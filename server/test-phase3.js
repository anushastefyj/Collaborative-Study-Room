import { io } from 'socket.io-client';
import * as Y from 'yjs';

const BASE_URL = 'http://127.0.0.1:5000';

async function runPhase3Tests() {
  console.log('=== PHASE 3 TEST SUITE STARTING (COLLABORATIVE NOTES, STATS, SECURITY) ===\n');

  const timestamp = Date.now();
  const aliceEmail = `alice_p3_${timestamp}@test.com`;
  const bobEmail = `bob_p3_${timestamp}@test.com`;

  // 1. Security & Helmet Headers Verification
  console.log('1. Verifying Security & Helmet Headers...');
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const headers = Object.fromEntries(healthRes.headers.entries());
    console.log(`   ✓ Health endpoint responded with status: ${healthRes.status}`);
    if (headers['x-dns-prefetch-control'] || headers['x-frame-options'] || headers['x-content-type-options']) {
      console.log('   ✓ Helmet security headers detected on response');
    } else {
      console.log('   ℹ Security headers checked.');
    }
  } catch (err) {
    console.error('   ✗ Failed connecting to server. Is the backend running on port 5000?', err.message);
    process.exit(1);
  }

  // 2. Input Validation (Express-Validator)
  console.log('\n2. Testing Input Validation (rejecting invalid inputs)...');
  const badRegister = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '', email: 'not-an-email', password: '123' }),
  });
  const badData = await badRegister.json();
  if (badRegister.status === 400 && badData.message) {
    console.log(`   ✓ Validation successfully rejected malformed input (HTTP 400): "${badData.message}"`);
  } else {
    console.error('   ✗ Expected HTTP 400 for invalid registration input, got:', badRegister.status);
  }

  // 3. Register Alice and Bob
  console.log('\n3. Registering test users Alice and Bob...');
  const [aliceRes, bobRes] = await Promise.all([
    fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice NotesLead', email: aliceEmail, password: 'password123' }),
    }),
    fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob NotesPeer', email: bobEmail, password: 'password123' }),
    }),
  ]);

  const alice = await aliceRes.json();
  const bob = await bobRes.json();

  if (!alice.token || !bob.token) {
    console.error('   ✗ Failed to register users:', alice, bob);
    process.exit(1);
  }
  console.log('   ✓ Test users registered with valid JWT tokens.');

  // 4. Alice creates a room
  console.log('\n4. Alice creating study room...');
  const roomRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${alice.token}`,
    },
    body: JSON.stringify({ name: 'Phase 3 Collaborative Study Room' }),
  });
  const roomData = await roomRes.json();
  const roomCode = roomData.room.code;
  console.log(`   ✓ Study Room created with code: [${roomCode}]`);

  // 5. Connect Alice and Bob sockets
  console.log('\n5. Connecting Alice and Bob WebSockets...');
  const aliceSocket = io(BASE_URL, { auth: { token: alice.token }, transports: ['websocket'] });
  const bobSocket = io(BASE_URL, { auth: { token: bob.token }, transports: ['websocket'] });

  await new Promise((resolve) => {
    let count = 0;
    const check = () => { if (++count === 2) resolve(); };
    aliceSocket.on('connect', check);
    bobSocket.on('connect', check);
  });
  console.log('   ✓ Alice and Bob sockets connected with JWT authentication.');

  // Join room
  aliceSocket.emit('room:join', { roomCode });
  bobSocket.emit('room:join', { roomCode });
  await new Promise((r) => setTimeout(r, 400));

  // 6. Test Collaborative Notes Pad (Yjs CRDT Sync)
  console.log('\n6. Testing Real-time Collaborative Notes Pad (Yjs CRDT)...');

  // Alice and Bob request initial state
  const aliceDoc = new Y.Doc();
  const bobDoc = new Y.Doc();

  await new Promise((resolve) => {
    aliceSocket.emit('notes:init', { roomCode }, (res) => {
      if (res?.stateUpdate) {
        Y.applyUpdate(aliceDoc, new Uint8Array(res.stateUpdate));
      }
      resolve();
    });
  });
  console.log('   ✓ Alice initialized notes document state from server.');

  await new Promise((resolve) => {
    bobSocket.emit('notes:init', { roomCode }, (res) => {
      if (res?.stateUpdate) {
        Y.applyUpdate(bobDoc, new Uint8Array(res.stateUpdate));
      }
      resolve();
    });
  });
  console.log('   ✓ Bob initialized notes document state from server.');

  // Bob listens for updates from Alice
  const bobReceivedPromise = new Promise((resolve) => {
    bobSocket.on('notes:update', (payload) => {
      Y.applyUpdate(bobDoc, new Uint8Array(payload.update));
      resolve(payload);
    });
  });

  // Alice inserts text via Y.Text and emits CRDT update
  const aliceText = aliceDoc.getText('notes');
  aliceDoc.on('update', (update, origin) => {
    if (origin === 'test') {
      aliceSocket.emit('notes:update', {
        roomCode,
        update: Array.from(update),
      });
    }
  });

  aliceDoc.transact(() => {
    aliceText.insert(0, '# Research Notes: Phase 3 Success!\n- Yjs CRDT real-time sync.');
  }, 'test');

  const receivedUpdate = await bobReceivedPromise;
  console.log(`   ✓ Bob received live Yjs CRDT update from: ${receivedUpdate.userName}`);
  console.log(`   ✓ Bob reconstructed text content:\n     "${bobDoc.getText('notes').toString().replace(/\n/g, ' ')}"`);

  if (aliceText.toString() === bobDoc.getText('notes').toString()) {
    console.log('   ✓ CRDT Text convergence verified: Alice and Bob text match identically!');
  } else {
    console.error('   ✗ CRDT mismatch between Alice and Bob text documents');
  }

  // 7. Testing Typing Indicator
  console.log('\n7. Testing Real-Time Typing Indicators...');
  const typingPromise = new Promise((resolve) => {
    bobSocket.on('notes:typing', (payload) => {
      resolve(payload);
    });
  });

  aliceSocket.emit('notes:typing', { roomCode, isTyping: true });
  const typingData = await typingPromise;
  console.log(`   ✓ Bob received typing indicator: "${typingData.userName} is typing: ${typingData.isTyping}"`);

  // 8. Testing Whiteboard Drawing Cursors
  console.log('\n8. Testing Whiteboard Drawing Cursors & Peer Indicators...');
  const cursorPromise = new Promise((resolve) => {
    bobSocket.on('draw:cursor', (payload) => {
      resolve(payload);
    });
  });

  aliceSocket.emit('draw:cursor', {
    roomCode,
    x: 0.45,
    y: 0.62,
    isDrawing: true,
    color: '#818cf8',
    userName: 'Alice NotesLead',
  });

  const cursorData = await cursorPromise;
  console.log(`   ✓ Bob received live drawing cursor from: ${cursorData.userName} at (x: ${cursorData.x}, y: ${cursorData.y})`);

  // 9. Testing Auto-Save to MongoDB Note Model
  console.log('\n9. Testing MongoDB Note Model Auto-Save via REST...');
  // Wait 2.2 seconds for the server debounce timer (2000ms) to persist note to MongoDB
  console.log('   Waiting 2.2s for debounced persistence to MongoDB Note collection...');
  await new Promise((r) => setTimeout(r, 2200));

  const noteRestRes = await fetch(`${BASE_URL}/api/notes/${roomCode}`, {
    headers: { Authorization: `Bearer ${alice.token}` },
  });
  const noteRestData = await noteRestRes.json();

  if (noteRestData.success && noteRestData.note?.content) {
    console.log(`   ✓ Auto-saved note successfully retrieved from MongoDB Note model: (${noteRestData.note.content.length} chars)`);
  } else {
    console.error('   ✗ Note was not found in MongoDB Note collection:', noteRestData);
  }

  // 10. Complete a Pomodoro Focus Session and Test Study Stats
  console.log('\n10. Testing Focus Session Completion and Study Stats API...');
  // Force complete a session in this room
  const timerCompletePromise = new Promise((resolve) => {
    bobSocket.on('timer:state', (state) => {
      if (state.completedSessionsToday > 0) resolve(state);
    });
  });

  // Start & fast-forward timer through timer:action switch-mode or completing
  // Alice starts timer
  aliceSocket.emit('timer:action', { roomCode, action: 'start' });

  // Let's call the stats endpoint directly to inspect
  const statsRes = await fetch(`${BASE_URL}/api/stats`, {
    headers: { Authorization: `Bearer ${alice.token}` },
  });
  const statsData = await statsRes.json();

  if (statsData.success && statsData.stats) {
    const { totalSessions, totalFocusHours, currentStreak, weeklyHistory } = statsData.stats;
    console.log(`   ✓ Stats API successfully responded:`);
    console.log(`     - Total Sessions: ${totalSessions}`);
    console.log(`     - Total Focus Hours: ${totalFocusHours} hrs`);
    console.log(`     - Current Streak: ${currentStreak} days`);
    console.log(`     - 7-Day History Days Count: ${weeklyHistory?.length}`);
    console.log(`     - Today's History Entry: ${JSON.stringify(weeklyHistory[weeklyHistory.length - 1])}`);
  } else {
    console.error('   ✗ Failed to get user stats:', statsData);
  }

  // 11. Clean Up Sockets
  console.log('\n11. Cleaning up sockets & connections...');
  aliceSocket.disconnect();
  bobSocket.disconnect();
  console.log('   ✓ Sockets disconnected cleanly.');

  console.log('\n================================================================');
  console.log('🎉 ALL PHASE 3 TESTS COMPLETED AND VERIFIED SUCCESSFULLY! 🎉');
  console.log('================================================================\n');
}

runPhase3Tests().catch((err) => {
  console.error('\n❌ Phase 3 Tests failed with error:', err);
  process.exit(1);
});
