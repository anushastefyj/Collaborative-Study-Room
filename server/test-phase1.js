import { io } from 'socket.io-client';

const BASE_URL = 'http://127.0.0.1:5000';

async function runTests() {
  console.log('=== PHASE 1 TEST SUITE STARTING ===\n');

  const timestamp = Date.now();
  const aliceEmail = `alice_${timestamp}@test.com`;
  const bobEmail = `bob_${timestamp}@test.com`;

  // 1. Test Registration
  console.log('1. Testing User Registration...');
  const regAliceRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice Smith', email: aliceEmail, password: 'password123' }),
  });
  const aliceData = await regAliceRes.json();
  if (!regAliceRes.ok || !aliceData.token) {
    throw new Error(`Alice registration failed: ${JSON.stringify(aliceData)}`);
  }
  console.log('   ✓ Alice registered successfully. Token received.');

  const regBobRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Bob Jones', email: bobEmail, password: 'password123' }),
  });
  const bobData = await regBobRes.json();
  if (!regBobRes.ok || !bobData.token) {
    throw new Error(`Bob registration failed: ${JSON.stringify(bobData)}`);
  }
  console.log('   ✓ Bob registered successfully. Token received.');

  // 2. Test Login
  console.log('\n2. Testing User Login...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: aliceEmail, password: 'password123' }),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok || !loginData.token) {
    throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  }
  console.log('   ✓ Login endpoint verified.');

  // 3. Test GET /api/auth/me
  console.log('\n3. Testing GET /api/auth/me (Protected Route)...');
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${aliceData.token}` },
  });
  const meData = await meRes.json();
  if (!meRes.ok || meData.user.email !== aliceEmail.toLowerCase()) {
    throw new Error(`GET /me failed: ${JSON.stringify(meData)}`);
  }
  console.log(`   ✓ Protected me route verified for user: ${meData.user.name}`);

  // 4. Test Create Room (POST /api/rooms)
  console.log('\n4. Testing POST /api/rooms...');
  const createRoomRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aliceData.token}`,
    },
    body: JSON.stringify({ name: 'Algorithms & Data Structures' }),
  });
  const roomData = await createRoomRes.json();
  if (!createRoomRes.ok || !roomData.room || !roomData.room.code) {
    throw new Error(`Create room failed: ${JSON.stringify(roomData)}`);
  }
  const roomCode = roomData.room.code;
  console.log(`   ✓ Room created: "${roomData.room.name}" with 6-char code: [${roomCode}]`);

  // 5. Test Get Room by Code (GET /api/rooms/:code)
  console.log('\n5. Testing GET /api/rooms/:code...');
  const getRoomRes = await fetch(`${BASE_URL}/api/rooms/${roomCode}`, {
    headers: { Authorization: `Bearer ${bobData.token}` },
  });
  const fetchedRoomData = await getRoomRes.json();
  if (!getRoomRes.ok || fetchedRoomData.room.code !== roomCode) {
    throw new Error(`Fetch room by code failed: ${JSON.stringify(fetchedRoomData)}`);
  }
  console.log(`   ✓ Fetched room successfully: Host is "${fetchedRoomData.room.host.name}"`);

  // 6. Test Get My Rooms (GET /api/rooms/mine)
  console.log('\n6. Testing GET /api/rooms/mine...');
  const myRoomsRes = await fetch(`${BASE_URL}/api/rooms/mine`, {
    headers: { Authorization: `Bearer ${aliceData.token}` },
  });
  const myRoomsData = await myRoomsRes.json();
  if (!myRoomsRes.ok || myRoomsData.count < 1) {
    throw new Error(`Fetch my rooms failed: ${JSON.stringify(myRoomsData)}`);
  }
  console.log(`   ✓ User created rooms count: ${myRoomsData.count}`);

  // 7. Test Socket.io with JWT Auth and Live Presence
  console.log('\n7. Testing Socket.io JWT Auth & Live Presence Events...');

  // Connect Alice's socket
  const aliceSocket = io(BASE_URL, {
    auth: { token: aliceData.token },
    transports: ['websocket'],
  });

  // Connect Bob's socket
  const bobSocket = io(BASE_URL, {
    auth: { token: bobData.token },
    transports: ['websocket'],
  });

  await new Promise((resolve, reject) => {
    let aliceConnected = false;
    let bobConnected = false;

    const checkBoth = () => {
      if (aliceConnected && bobConnected) resolve();
    };

    aliceSocket.on('connect', () => {
      console.log('   ✓ Alice connected via WebSocket');
      aliceConnected = true;
      checkBoth();
    });

    bobSocket.on('connect', () => {
      console.log('   ✓ Bob connected via WebSocket');
      bobConnected = true;
      checkBoth();
    });

    aliceSocket.on('connect_error', (e) => reject(new Error(`Alice socket error: ${e.message}`)));
    bobSocket.on('connect_error', (e) => reject(new Error(`Bob socket error: ${e.message}`)));
  });

  // Test room:join for Alice
  console.log('\n8. Alice joining room...');
  await new Promise((resolve) => {
    aliceSocket.on('presence:update', (payload) => {
      console.log(`   ✓ Alice received presence:update (Count: ${payload.members.length}, Action: ${payload.action})`);
      if (payload.members.length === 1) {
        resolve();
      }
    });
    aliceSocket.emit('room:join', { roomCode });
  });

  // Test room:join for Bob (should broadcast to both Alice and Bob)
  console.log('\n9. Bob joining same room...');
  await new Promise((resolve) => {
    let aliceNotified = false;
    let bobNotified = false;

    const check = () => {
      if (aliceNotified && bobNotified) resolve();
    };

    aliceSocket.on('presence:update', (payload) => {
      if (payload.members.length === 2) {
        console.log(`   ✓ Alice notified of Bob's arrival (Total online: ${payload.members.length})`);
        aliceNotified = true;
        check();
      }
    });

    bobSocket.on('presence:update', (payload) => {
      if (payload.members.length === 2) {
        console.log(`   ✓ Bob received live presence list with both participants`);
        bobNotified = true;
        check();
      }
    });

    bobSocket.emit('room:join', { roomCode });
  });

  // Test Bob leaving the room
  console.log('\n10. Testing Bob leaving room (room:leave)...');
  await new Promise((resolve) => {
    aliceSocket.on('presence:update', (payload) => {
      if (payload.members.length === 1 && payload.action === 'leave') {
        console.log(`   ✓ Alice received presence:update showing Bob left (Remaining: ${payload.members.length})`);
        resolve();
      }
    });

    bobSocket.emit('room:leave', { roomCode });
  });

  aliceSocket.disconnect();
  bobSocket.disconnect();

  console.log('\n🎉 ALL PHASE 1 REQUIREMENTS VERIFIED AND PASSED WITH 100% SUCCESS!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
