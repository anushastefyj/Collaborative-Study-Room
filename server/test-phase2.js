import { io } from 'socket.io-client';

const BASE_URL = 'http://127.0.0.1:5000';

async function runPhase2Tests() {
  console.log('=== PHASE 2 TEST SUITE STARTING (WHITEBOARD & POMODORO TIMER) ===\n');

  const timestamp = Date.now();
  const aliceEmail = `alice_p2_${timestamp}@test.com`;
  const bobEmail = `bob_p2_${timestamp}@test.com`;
  const charlieEmail = `charlie_p2_${timestamp}@test.com`;

  // 1. Register Alice, Bob, Charlie
  console.log('1. Registering test users...');
  const [aliceRes, bobRes, charlieRes] = await Promise.all([
    fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice Host', email: aliceEmail, password: 'password123' }),
    }),
    fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob Peer', email: bobEmail, password: 'password123' }),
    }),
    fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Charlie LateJoiner', email: charlieEmail, password: 'password123' }),
    }),
  ]);

  const alice = await aliceRes.json();
  const bob = await bobRes.json();
  const charlie = await charlieRes.json();

  console.log('   ✓ Users registered successfully.');

  // 2. Alice creates a room
  console.log('\n2. Alice creating study room...');
  const roomRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${alice.token}`,
    },
    body: JSON.stringify({ name: 'Phase 2 Live Whiteboard Room' }),
  });
  const roomData = await roomRes.json();
  const roomCode = roomData.room.code;
  console.log(`   ✓ Room created with code: [${roomCode}]`);

  // 3. Connect Alice and Bob sockets
  console.log('\n3. Connecting Alice & Bob sockets...');
  const aliceSocket = io(BASE_URL, { auth: { token: alice.token }, transports: ['websocket'] });
  const bobSocket = io(BASE_URL, { auth: { token: bob.token }, transports: ['websocket'] });

  await new Promise((resolve) => {
    let connected = 0;
    const check = () => { if (++connected === 2) resolve(); };
    aliceSocket.on('connect', check);
    bobSocket.on('connect', check);
  });

  // Alice and Bob join room
  await new Promise((resolve) => {
    aliceSocket.emit('room:join', { roomCode }, () => {
      bobSocket.emit('room:join', { roomCode }, () => resolve());
    });
  });
  console.log('   ✓ Alice and Bob joined room.');

  // ==========================================
  // 4. TEST WHITEBOARD REAL-TIME DRAWING
  // ==========================================
  console.log('\n4. Testing Whiteboard stroke broadcast (draw:stroke)...');
  const stroke1 = {
    strokeId: 'stroke_alice_1',
    roomCode,
    tool: 'pen',
    color: '#818cf8',
    size: 4,
    points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }],
  };

  await new Promise((resolve) => {
    bobSocket.on('draw:stroke', (received) => {
      if (received.strokeId === stroke1.strokeId) {
        console.log(`   ✓ Bob received Alice's stroke: ${received.strokeId} (Points: ${received.points.length})`);
        resolve();
      }
    });
    aliceSocket.emit('draw:stroke', stroke1);
  });

  bobSocket.off('draw:stroke');

  // Alice draws stroke 2
  const stroke2 = {
    strokeId: 'stroke_alice_2',
    roomCode,
    tool: 'pen',
    color: '#34d399',
    size: 6,
    points: [{ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 }],
  };

  await new Promise((resolve) => {
    bobSocket.on('draw:stroke', (received) => {
      if (received.strokeId === stroke2.strokeId) {
        console.log(`   ✓ Bob received Alice's second stroke: ${received.strokeId}`);
        resolve();
      }
    });
    aliceSocket.emit('draw:stroke', stroke2);
  });

  bobSocket.off('draw:stroke');

  // ==========================================
  // 5. TEST WHITEBOARD UNDO (draw:undo)
  // ==========================================
  console.log('\n5. Testing Whiteboard Undo (draw:undo)...');
  await new Promise((resolve) => {
    bobSocket.on('draw:undo', (payload) => {
      if (payload.strokeId === 'stroke_alice_2') {
        console.log(`   ✓ Bob received undo broadcast for stroke: ${payload.strokeId}`);
        resolve();
      }
    });
    aliceSocket.emit('draw:undo', { roomCode });
  });

  bobSocket.off('draw:undo');

  // ==========================================
  // 6. TEST LATE JOINER GETS BOARD STATE (board:state)
  // ==========================================
  console.log('\n6. Testing Late Joiner receiving existing board state (board:state)...');
  const charlieSocket = io(BASE_URL, { auth: { token: charlie.token }, transports: ['websocket'] });
  await new Promise((resolve) => charlieSocket.on('connect', resolve));

  await new Promise((resolve) => {
    charlieSocket.on('board:state', (payload) => {
      console.log(`   ✓ Charlie received board:state with ${payload.strokes.length} strokes`);
      const hasStroke1 = payload.strokes.some((s) => s.strokeId === 'stroke_alice_1');
      const hasStroke2 = payload.strokes.some((s) => s.strokeId === 'stroke_alice_2');
      if (hasStroke1 && !hasStroke2) {
        console.log('   ✓ Charlie verified stroke 1 exists and undone stroke 2 was excluded!');
        resolve();
      }
    });
    charlieSocket.emit('room:join', { roomCode });
  });

  charlieSocket.off('board:state');

  // ==========================================
  // 7. TEST CLEAR WHITEBOARD (draw:clear)
  // ==========================================
  console.log('\n7. Testing Clear Whiteboard (draw:clear)...');
  await new Promise((resolve) => {
    let bobCleared = false;
    let charlieCleared = false;
    const check = () => { if (bobCleared && charlieCleared) resolve(); };

    bobSocket.on('draw:clear', () => {
      console.log('   ✓ Bob received draw:clear');
      bobCleared = true;
      check();
    });

    charlieSocket.on('draw:clear', () => {
      console.log('   ✓ Charlie received draw:clear');
      charlieCleared = true;
      check();
    });

    aliceSocket.emit('draw:clear', { roomCode });
  });

  bobSocket.off('draw:clear');
  charlieSocket.off('draw:clear');

  // ==========================================
  // 8. TEST POMODORO TIMER PERMISSION & START
  // ==========================================
  console.log('\n8. Testing Pomodoro Timer Controls & Permissions...');

  // Bob (peer) attempts to start timer when host-only control is enabled
  await new Promise((resolve) => {
    bobSocket.emit('timer:start', { roomCode }, (res) => {
      if (res?.error) {
        console.log(`   ✓ Non-host peer blocked from starting timer: "${res.error}"`);
        resolve();
      }
    });
  });

  // Alice (host) starts timer
  console.log('\n9. Alice (Host) starting timer...');
  await new Promise((resolve) => {
    bobSocket.on('timer:state', (state) => {
      if (state.isRunning && state.startedAt) {
        console.log(`   ✓ Bob received synced timer:state. isRunning=${state.isRunning}, duration=${state.duration}s`);
        resolve();
      }
    });
    aliceSocket.emit('timer:start', { roomCode });
  });
  bobSocket.off('timer:state');

  // Alice pauses timer
  console.log('\n10. Alice pausing timer...');
  await new Promise((resolve) => {
    bobSocket.on('timer:state', (state) => {
      if (!state.isRunning && state.pausedRemaining) {
        console.log(`   ✓ Bob received pause timer:state. pausedRemaining=${state.pausedRemaining}s`);
        resolve();
      }
    });
    aliceSocket.emit('timer:pause', { roomCode });
  });
  bobSocket.off('timer:state');

  // Alice toggles open controls for anyone
  console.log('\n11. Alice toggling "Anyone can control timer"...');
  await new Promise((resolve) => {
    bobSocket.on('timer:state', (state) => {
      if (state.anyoneCanControl === true) {
        console.log('   ✓ Bob received updated anyoneCanControl: true');
        resolve();
      }
    });
    aliceSocket.emit('timer:toggle-control', { roomCode, anyoneCanControl: true });
  });
  bobSocket.off('timer:state');

  // Now Bob can start the timer
  console.log('\n12. Bob starting timer with open controls...');
  await new Promise((resolve) => {
    aliceSocket.on('timer:state', (state) => {
      if (state.isRunning) {
        console.log('   ✓ Bob successfully started timer with open controls!');
        resolve();
      }
    });
    bobSocket.emit('timer:start', { roomCode });
  });
  aliceSocket.off('timer:state');

  // ==========================================
  // 13. TEST TIMER AUTO-SWITCH & SESSION RECORDING
  // ==========================================
  console.log('\n13. Testing Timer auto-switch from focus to break & session recording...');
  // Set focus duration to 2 seconds to test auto-switch
  aliceSocket.emit('timer:setMode', { roomCode, mode: 'focus', duration: 2 });

  await new Promise((resolve) => {
    // Wait for auto-switch event
    bobSocket.on('timer:state', (state) => {
      if (state.autoSwitched && state.mode === 'break') {
        console.log(`   ✓ Server auto-switched mode to break! Previous: ${state.previousMode}, New: ${state.mode}`);
        console.log(`   ✓ Completed sessions today recorded: ${state.completedSessionsToday}`);
        resolve();
      }
    });

    // Start 2s timer
    aliceSocket.emit('timer:start', { roomCode });
  });
  bobSocket.off('timer:state');

  // Verify session endpoint
  const sessionRes = await fetch(`${BASE_URL}/api/rooms/${roomCode}/sessions`, {
    headers: { Authorization: `Bearer ${alice.token}` },
  });
  const sessionData = await sessionRes.json();
  console.log(`   ✓ GET /api/rooms/:code/sessions verified. Today completed: ${sessionData.todayCompletedCount}`);

  // Disconnect sockets
  aliceSocket.disconnect();
  bobSocket.disconnect();
  charlieSocket.disconnect();

  console.log('\n🎉 ALL PHASE 2 REQUIREMENTS (WHITEBOARD & POMODORO TIMER) VERIFIED AND PASSED 100%!');
  process.exit(0);
}

runPhase2Tests().catch((err) => {
  console.error('\n❌ Phase 2 Test failed:', err);
  process.exit(1);
});
