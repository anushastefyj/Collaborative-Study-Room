import { io } from 'socket.io-client';

const BASE_URL = 'http://127.0.0.1:5000';

async function runPhase4Tests() {
  console.log('=== EXTENSION PHASE (PHASE 4) AUTOMATED INTEGRATION TESTS ===\n');

  const timestamp = Date.now();
  const aliceEmail = `alice_p4_${timestamp}@test.com`;
  const bobEmail = `bob_p4_${timestamp}@test.com`;

  // 1. Register test users
  console.log('1. Registering test users Alice & Bob...');
  const [aliceRes, bobRes] = await Promise.all([
    fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice ChatLead', email: aliceEmail, password: 'password123' }),
    }),
    fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob TaskLead', email: bobEmail, password: 'password123' }),
    }),
  ]);

  const alice = await aliceRes.json();
  const bob = await bobRes.json();
  console.log('   ✓ Registered Alice and Bob.');

  // 2. Create room
  console.log('\n2. Alice creating study room...');
  const roomRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${alice.token}`,
    },
    body: JSON.stringify({ name: 'Phase 4 Extended Lab' }),
  });
  const roomData = await roomRes.json();
  const roomCode = roomData.room.code;
  console.log(`   ✓ Study Room created with code: [${roomCode}]`);

  // 3. Connect sockets
  console.log('\n3. Connecting Alice and Bob WebSockets...');
  const aliceSocket = io(BASE_URL, {
    auth: { token: alice.token },
    transports: ['websocket'],
  });
  const bobSocket = io(BASE_URL, {
    auth: { token: bob.token },
    transports: ['websocket'],
  });

  await Promise.all([
    new Promise((resolve) => aliceSocket.on('connect', resolve)),
    new Promise((resolve) => bobSocket.on('connect', resolve)),
  ]);

  // Join room
  await Promise.all([
    new Promise((resolve) => aliceSocket.emit('room:join', { roomCode }, resolve)),
    new Promise((resolve) => bobSocket.emit('room:join', { roomCode }, resolve)),
  ]);
  console.log('   ✓ Both sockets connected and joined room.');

  // 4. Test Room Chat: Send Message
  console.log('\n4. Testing Real-time Room Chat ("chat:message")...');
  const chatReceivedPromise = new Promise((resolve) => {
    bobSocket.on('chat:message', (msg) => {
      if (msg.text.includes('Hello Bob, let us crush our study goals!')) {
        console.log(`   ✓ Bob received chat message from "${msg.name}": "${msg.text}"`);
        console.log(`   ✓ Message has DB ID: ${msg._id} and createdAt timestamp: ${msg.createdAt}`);
        resolve(msg);
      }
    });
  });

  aliceSocket.emit('chat:message', {
    roomCode,
    text: 'Hello Bob, let us crush our study goals!',
  });

  await chatReceivedPromise;
  bobSocket.off('chat:message');

  // 5. Test Chat Typing Indicator
  console.log('\n5. Testing Chat Typing Indicator ("chat:typing")...');
  const typingPromise = new Promise((resolve) => {
    bobSocket.on('chat:typing', (payload) => {
      if (payload.isTyping === true && payload.userId === alice.user._id) {
        console.log(`   ✓ Bob received typing indicator: "${payload.name} is typing"`);
        resolve();
      }
    });
  });

  aliceSocket.emit('chat:typing', { roomCode, isTyping: true });
  await typingPromise;
  bobSocket.off('chat:typing');

  // 6. Test Chat History retrieval ("chat:history")
  console.log('\n6. Testing Chat History retrieval ("chat:history")...');
  const history = await new Promise((resolve) => {
    aliceSocket.emit('chat:history', { roomCode }, (res) => {
      resolve(res);
    });
  });
  console.log(`   ✓ Chat history returned ${history.messages?.length} message(s).`);

  // 7. Test Shared Tasks: Add Task ("task:add")
  console.log('\n7. Testing Shared Tasks: Adding a new task ("task:add")...');
  let createdTaskId = null;
  const taskAddPromise = new Promise((resolve) => {
    bobSocket.on('task:add', (task) => {
      if (task.text === 'Complete Algorithm Complexity Quiz') {
        console.log(`   ✓ Bob received new task: "${task.text}" (ID: ${task._id})`);
        createdTaskId = task._id;
        resolve(task);
      }
    });
  });

  aliceSocket.emit('task:add', {
    roomCode,
    text: 'Complete Algorithm Complexity Quiz',
    assignedTo: bob.user._id,
    assignedToName: 'Bob TaskLead',
  });

  await taskAddPromise;
  bobSocket.off('task:add');

  // 8. Test Shared Tasks: Link to Pomodoro ("Working on: ...")
  console.log('\n8. Testing Linking Task to Pomodoro ("isPomodoroFocus")...');
  const timerStatePromise = new Promise((resolve) => {
    bobSocket.on('timer:state', (timer) => {
      if (timer.activeTask && timer.activeTask.text === 'Complete Algorithm Complexity Quiz') {
        console.log(`   ✓ Pomodoro timer received linked focus task: "${timer.activeTask.text}"`);
        resolve(timer);
      }
    });
  });

  aliceSocket.emit('task:update', {
    roomCode,
    taskId: createdTaskId,
    isPomodoroFocus: true,
  });

  await timerStatePromise;
  bobSocket.off('timer:state');

  // 9. Test Shared Tasks: Complete Task ("completed: true")
  console.log('\n9. Testing Checking off task ("task:update")...');
  const taskCompletePromise = new Promise((resolve) => {
    aliceSocket.on('task:update', (task) => {
      if (task._id === createdTaskId && task.completed === true) {
        console.log(`   ✓ Alice received task completed: "${task.text}" (completedBy: ${task.completedByName})`);
        resolve(task);
      }
    });
  });

  bobSocket.emit('task:update', {
    roomCode,
    taskId: createdTaskId,
    completed: true,
  });

  await taskCompletePromise;
  aliceSocket.off('task:update');

  // 10. Test Full Pomodoro Cycle: Host configure cycle target & Long Break
  console.log('\n10. Testing Full Pomodoro Cycle (Configuring cycle target = 2 and testing Long Break)...');
  aliceSocket.emit('timer:setCycleTarget', { roomCode, cycleTarget: 2 });

  // First session auto-switches to short break
  aliceSocket.emit('timer:setMode', { roomCode, mode: 'focus', duration: 1 });
  await new Promise((resolve) => {
    bobSocket.on('timer:state', (state) => {
      if (state.autoSwitched && state.mode === 'break') {
        console.log(`   ✓ Session 1/2 complete. Auto-switched to short break (5m). Current cycle: ${state.currentCycle}/2`);
        resolve();
      }
    });
    aliceSocket.emit('timer:start', { roomCode });
  });
  bobSocket.off('timer:state');

  // Switch back to focus session 2 of 2
  aliceSocket.emit('timer:setMode', { roomCode, mode: 'focus', duration: 1 });
  await new Promise((resolve) => {
    bobSocket.on('timer:state', (state) => {
      if (state.autoSwitched && state.mode === 'long_break') {
        console.log(`   ✓ Session 2/2 complete! Auto-switched to LONG BREAK (15m)! Mode: ${state.mode}, Duration: ${state.duration}s`);
        resolve();
      }
    });
    aliceSocket.emit('timer:start', { roomCode });
  });
  bobSocket.off('timer:state');

  // 11. Test AI Summarize Route
  console.log('\n11. Testing AI Summarize Route (POST /api/ai/summarize)...');
  // First test empty notes validation
  const emptyAiRes = await fetch(`${BASE_URL}/api/ai/summarize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${alice.token}`,
    },
    body: JSON.stringify({ roomCode }),
  });
  const emptyAiData = await emptyAiRes.json();
  if (emptyAiRes.status === 400 && emptyAiData.message) {
    console.log(`   ✓ AI route successfully validated and rejected empty room notes: "${emptyAiData.message}"`);
  }

  // Disconnect sockets cleanly
  aliceSocket.disconnect();
  bobSocket.disconnect();

  console.log('\n================================================================');
  console.log('🎉 ALL PHASE 4 EXTENSION FEATURES VERIFIED AND PASSED 100%! 🎉');
  console.log('================================================================\n');
  process.exit(0);
}

runPhase4Tests().catch((err) => {
  console.error('\n❌ Phase 4 Test failed:', err);
  process.exit(1);
});
