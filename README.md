# 🎓 StudySpace — Collaborative Study Room (MERN + Socket.io)

[![CI](https://github.com/anushastefyj/Collaborative-Study-Room/actions/workflows/ci.yml/badge.svg)](https://github.com/anushastefyj/Collaborative-Study-Room/actions/workflows/ci.yml)

StudySpace is a full-stack, real-time collaborative virtual study room platform designed for focused group productivity. Built using the **MERN stack** (MongoDB, Express, React, Node.js) and **Socket.io** WebSockets, it features conflict-free collaborative notes (powered by **Yjs CRDT**), a shared real-time whiteboard, synchronized Pomodoro study timers, comprehensive study analytics, persistent room chat, shared group tasks, ambient study audio, and AI-powered notes synthesis with active-recall flashcards.

---

## 🏗️ Architecture Overview

StudySpace leverages a hybrid **REST API + WebSockets** architecture:
- **REST API (`/api/*`)**: Handles stateless user registration, authentication (JWT), room provisioning, study stats aggregation, fallback note retrieval, and AI note summaries.
- **WebSocket Gateway (Socket.io)**: Manages bi-directional, sub-50ms real-time communication for presence tracking, whiteboard stroke streaming, Yjs CRDT binary updates, live drawing cursor positions, host-synchronized Pomodoro clocks, room chat, and shared group tasks.
- **CRDT Layer (Yjs)**: Enables conflict-free concurrent editing where multiple users can type simultaneously into the shared notes pad without character collision or race condition overwrites.
- **Persistence Layer (MongoDB)**: Debounced in-memory flushing ensures high-frequency whiteboard strokes and text changes are persisted reliably to MongoDB with minimal database overhead.

```
       +-------------------------------------------------------------+
       |               React + Vite Frontend (SPA)                   |
       |  +--------------------+  +------------------+  +---------+  |
       |  | Collaborative Board|  |  Yjs Notes Pad   |  |Pomodoro |  |
       |  |  (Canvas + Cursors)|  | (CRDT Text Sync) |  |  Timer  |  |
       |  +---------+----------+--+--------+---------+--+----+----+--+
       |            |                      |                 |       |
       |  +---------+----------+  +--------+---------+  +----+----+  |
       |  |  Shared Task List  |  |  Room Chat Panel |  | Ambient |  |
       |  | (Assign + Progress)|  | (Unread + Typing)|  | Sounds  |  |
       +--+---------+----------+--+--------+---------+--+----+----+--+
                    |                      |                 |
        [task:add / update]      [chat:message / type]   [timer:sync]
                    |                      |                 |
                    v                      v                 v
       +-------------------------------------------------------------+
       |             Socket.io Real-Time Gateway (Node.js)           |
       |  - JWT Handshake Auth      - In-Memory Y.Doc CRDT Cache     |
       |  - Presence Room Store     - Timer Clock & Interval Sync    |
       |  - Zod Payload Validation  - User Rate Limiting Token Store |
       +------------------------------+------------------------------+
                                      | Debounced Flush
                                      v
       +-------------------------------------------------------------+
       |                      MongoDB Database                       |
       |  Users • Rooms • Notes • Sessions • Whiteboards • Messages • Tasks |
       +-------------------------------------------------------------+
```

---

## ⚡ Core Features

### 1. Room Chat (Extension Phase)
- **Real-Time Sliding Drawer**: Collapsible chat panel integrated directly into the study room.
- **Unread Message Counter**: Dynamic unread counter badge displayed when the drawer is closed.
- **Typing Indicators**: Live "Alice is typing..." indicator with inactivity auto-expiry.
- **History Retrieval**: Automatically fetches the last 50 room messages sorted chronologically on join.
- **Security & Validation**: Zod-validated payloads, HTML text sanitization, 500-character ceiling, and per-user sliding window rate limiting.

### 2. Shared Task List (Extension Phase)
- **Real-Time Collaborative Tasks**: Add, edit, check off, delete, and assign tasks to members in real time.
- **Team Progress Bar**: Real-time progress tracker displaying completed task percentage and counts.
- **Pomodoro Linking**: One-click "Link to Pomodoro" feature that projects "Working on: [Task]" next to the timer for all members.
- **Persistent Storage**: Backed by MongoDB `Task` model indexed by `roomCode`.

### 3. Full Pomodoro Cycle + Ambient Sounds (Extension Phase)
- **Extended Pomodoro Cycles**: Configurable focus cycles (default 4 sessions) leading automatically into an extended 15-minute Long Break.
- **Cycle Progress Dots**: Visual indicators tracking progress through the current interval cycle (e.g., `2/4`).
- **Looped Ambient Soundscapes**: Looped royalty-free audio tracks for **Rain**, **Lo-Fi**, and **Cafe Noise** (`/sounds/*.wav`).
- **Personal Audio Control**: Per-user volume slider and mute toggle saved in `localStorage`.
- **Timer Audio Synchronization**: Host can toggle "Sync ambient sound with timer" to play audio during focus intervals and pause during breaks.
- **Desktop Notifications & Alarm**: Native browser notifications (`Notification` API) and alarm audio triggered on phase completion.

### 4. AI Notes Summary + Study Flashcards (Extension Phase)
- **Anthropic Claude Integration**: Backend endpoint (`POST /api/ai/summarize`) invoking Claude 3.5 Haiku via `@anthropic-ai/sdk`.
- **Executive Summaries & Key Points**: Clear multi-paragraph summary with high-yield bullet points.
- **Interactive Flashcards Viewer**: 3D flip card viewer with Question/Answer states, next/prev navigation, and card shuffling.
- **Export Capabilities**: Instant export of generated flashcards as **JSON** (`.json`) or **CSV** (`.csv`), plus one-click summary copying.
- **Protections**: Pre-call note length checks, Zod schema validation, API key privacy, and hourly rate limits (15 calls/hr).

### 5. Collaborative Real-Time Notes Pad (Phase 3)
- **Conflict-Free Synchronization**: Built on **Yjs CRDT**; changes from concurrent typists merge deterministically without data loss.
- **Auto-Save Persistence**: Debounced auto-save to MongoDB `Note` model every 2 seconds.
- **Export Capabilities**: One-click download as styled PDF via `jspdf`, plain text (`.txt`), or clipboard copy.

### 6. Shared Collaborative Whiteboard (Phases 2 & 3)
- **Multi-User Canvas**: HTML5 Canvas with normalized (0 to 1) coordinate mapping.
- **Live Drawing Cursors**: Floating peer pointers with peer name tags, pen colors, and drawing status banners.
- **Tools**: Pen, Eraser, 8 Preset Colors, Custom Color Picker, Brush Size slider, Undo, and Clear.
- **Export as PNG**: High-resolution client-side canvas render with watermark.

### 7. Study Analytics & Streaks (Phase 3)
- **Interactive Recharts Bar Chart**: Weekly rhythm bar chart tracking focus minutes and sessions over the past 7 days.
- **Streak Tracker**: Consecutive days studied with active streak flame indicator (🔥).

---

## 📡 Socket.io Event Catalog

| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `room:join` | Client ➔ Server | `{ roomCode }` | Join room; receives presence, board, timer, and notes |
| `room:leave` | Client ➔ Server | `{ roomCode }` | Cleanly leave room; broadcasts presence departure |
| `presence:update` | Server ➔ Room | `{ roomCode, members, action, user }` | Participant join/leave updates |
| `board:init` | Client ➔ Server | `{ roomCode }` | Request initial whiteboard strokes |
| `board:state` | Server ➔ Socket | `{ roomCode, strokes }` | Initial whiteboard stroke history |
| `draw:stroke` | Bidirectional | `{ roomCode, strokeId, points, color, size, tool }` | Real-time stroke transmission |
| `draw:undo` | Bidirectional | `{ roomCode, strokeId, userId }` | Undo user's latest stroke |
| `draw:clear` | Bidirectional | `{ roomCode, clearedBy }` | Clear room whiteboard |
| `draw:cursor` | Bidirectional | `{ roomCode, x, y, isDrawing, color, userName }` | Real-time drawing cursor coordinates |
| `notes:init` | Client ➔ Server | `{ roomCode }` | Request Yjs CRDT document binary state |
| `notes:update` | Bidirectional | `{ roomCode, update: Array<number> }` | Broadcast Yjs binary update vector |
| `notes:typing` | Bidirectional | `{ roomCode, isTyping: boolean }` | Note pad typing indicator |
| `chat:history` | Client ➔ Server | `{ roomCode }` | Request last 50 room chat messages |
| `chat:message` | Bidirectional | `{ roomCode, text }` | Send and broadcast validated room message |
| `chat:typing` | Bidirectional | `{ roomCode, isTyping: boolean }` | Chat input typing broadcast |
| `task:init` | Client ➔ Server | `{ roomCode }` | Request full shared task list |
| `task:add` | Bidirectional | `{ roomCode, text, assignedTo, assignedToName }` | Create task and broadcast to peers |
| `task:update` | Bidirectional | `{ roomCode, taskId, text, completed, ... }` | Update task status or Pomodoro focus link |
| `task:delete` | Bidirectional | `{ roomCode, taskId }` | Remove task from list |
| `timer:start` | Client ➔ Server | `{ roomCode }` | Start synchronized Pomodoro clock |
| `timer:pause` | Client ➔ Server | `{ roomCode }` | Pause timer clock |
| `timer:reset` | Client ➔ Server | `{ roomCode }` | Reset timer clock to mode default |
| `timer:setMode` | Client ➔ Server | `{ roomCode, mode, duration }` | Switch between focus, break, long_break |
| `timer:state` | Server ➔ Room | `{ mode, currentCycle, cycleTarget, activeTask, ... }` | Authoritative server clock state broadcast |
| `timer:setCycleTarget` | Client ➔ Server | `{ roomCode, cycleTarget: number }` | Host configures focus sessions before long break |
| `timer:toggle-control` | Client ➔ Server | `{ roomCode, anyoneCanControl: boolean }` | Host toggles open controls |
| `timer:toggle-ambient-sync` | Client ➔ Server | `{ roomCode, syncAmbientWithTimer: boolean }` | Host toggles ambient sound synchronization |

---

## 📂 Updated Folder Structure

```
Collaborative Study Room/
├── .github/
│   └── workflows/
│       └── ci.yml                       # GitHub Actions CI workflow (Tests + Build)
├── client/
│   ├── public/
│   │   └── sounds/
│   │       ├── alarm.wav                # Phase completion chime
│   │       ├── cafe.wav                 # Looped cafe ambience
│   │       ├── lofi.wav                 # Looped lo-fi chords
│   │       └── rain.wav                 # Looped rain sounds
│   ├── src/
│   │   ├── components/
│   │   │   ├── AiSummaryModal.jsx       # AI summary modal & 3D flip flashcard viewer
│   │   │   ├── AmbientSoundPlayer.jsx   # Ambient audio player with volume & host sync
│   │   │   ├── ChatPanel.jsx            # Real-time room chat with unread badge & typing
│   │   │   ├── Navbar.jsx               # Navigation header & theme switcher
│   │   │   ├── NotesPad.jsx             # Yjs collaborative notes & AI trigger
│   │   │   ├── PomodoroTimer.jsx        # Synchronized timer with long breaks & task link
│   │   │   ├── ProtectedRoute.jsx       # JWT route guard
│   │   │   ├── ReconnectionBanner.jsx   # WebSocket connection drop alert
│   │   │   ├── TaskList.jsx             # Shared room task list with progress bar
│   │   │   ├── Toast.jsx                # Notification popups
│   │   │   └── Whiteboard.jsx           # Canvas whiteboard with cursors & PNG export
│   │   ├── context/
│   │   │   ├── AuthContext.jsx          # Auth user & token state
│   │   │   ├── SocketContext.jsx        # Gateway connection management
│   │   │   └── ThemeContext.jsx         # Dark / Light theme state
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx        # Room listings & creation
│   │   │   ├── LoginPage.jsx            # Sign-in
│   │   │   ├── RegisterPage.jsx         # Registration
│   │   │   ├── RoomPage.jsx             # Responsive study space layout
│   │   │   └── StatsPage.jsx            # Recharts study analytics
│   │   ├── services/
│   │   │   └── api.js                   # REST API client (Auth, Rooms, Notes, Stats, AI)
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── Dockerfile                       # Multi-stage client Dockerfile (Vite + Nginx)
│   ├── nginx.conf                       # Nginx SPA fallback & reverse proxy configuration
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── app.js                       # Express app definition & route bindings
│   │   ├── server.js                    # Server startup & Socket.io initialization
│   │   ├── config/
│   │   │   └── db.js                    # Mongoose MongoDB connection
│   │   ├── controllers/
│   │   │   ├── aiController.js          # Anthropic SDK summarization & flashcards
│   │   │   ├── authController.js        # Auth controllers
│   │   │   ├── notesController.js       # Notes controllers
│   │   │   ├── roomController.js        # Room controllers
│   │   │   └── statsController.js       # Analytics aggregation
│   │   ├── middleware/
│   │   │   ├── auth.js                  # Bearer token verification
│   │   │   ├── errorHandler.js          # Global error handling
│   │   │   ├── rateLimiter.js           # API, Auth, and AI rate limiters
│   │   │   └── validate.js              # express-validator schemas
│   │   ├── models/
│   │   │   ├── Message.js               # Chat message schema
│   │   │   ├── Note.js                  # Collaborative notes schema
│   │   │   ├── Room.js                  # Room schema
│   │   │   ├── Session.js               # Pomodoro study sessions schema
│   │   │   ├── Task.js                  # Shared task list schema
│   │   │   ├── User.js                  # User schema
│   │   │   └── Whiteboard.js            # Whiteboard strokes schema
│   │   ├── routes/
│   │   │   ├── aiRoutes.js              # /api/ai/summarize
│   │   │   ├── authRoutes.js            # /api/auth
│   │   │   ├── notesRoutes.js           # /api/notes
│   │   │   ├── roomRoutes.js            # /api/rooms
│   │   │   └── statsRoutes.js           # /api/stats
│   │   └── sockets/
│   │       ├── chat.js                  # Room chat handlers with Zod validation
│   │       ├── index.js                 # Socket gateway initialization
│   │       ├── notesHandler.js          # Yjs CRDT notes sync
│   │       ├── presenceStore.js         # Room presence store
│   │       ├── roomHandler.js           # Room join/leave & presence
│   │       ├── socketAuth.js            # Socket handshake JWT verification
│   │       ├── tasks.js                 # Shared task handlers with Zod validation
│   │       ├── timer.js                 # Full cycle timer with long break & task link
│   │       └── whiteboard.js            # Whiteboard stroke sync & cursors
│   ├── tests/
│   │   ├── auth.test.js                 # Supertest + Jest auth route tests
│   │   └── chatTaskValidation.test.js   # Jest tests for Zod schemas & sanitization
│   ├── Dockerfile                       # Production Node.js server image
│   ├── package.json
│   ├── test-phase1.js                   # Phase 1 integration test script
│   ├── test-phase2.js                   # Phase 2 integration test script
│   ├── test-phase3.js                   # Phase 3 integration test script
│   └── test-phase4.js                   # Phase 4 integration test script
│
├── .dockerignore
├── .gitignore
├── docker-compose.yml                   # Docker Compose (Client + Server + MongoDB)
└── README.md
```

---

## 🐳 Running with Docker Compose

To spin up the entire application including **MongoDB**, the **Backend API & WebSockets server**, and the **Nginx-served Client frontend**:

```bash
# 1. Provide your environment variables (optional: add ANTHROPIC_API_KEY)
export ANTHROPIC_API_KEY="your-anthropic-key-here"

# 2. Build and launch all containers
docker compose up --build

# 3. Access StudySpace
# - Frontend: http://localhost (or http://localhost:5173)
# - Backend Health: http://localhost:5000/api/health
```

To stop and remove containers:
```bash
docker compose down
```

---

## 🧪 Automated Testing

### 1. Jest & Supertest Test Suites (Server Unit & Route Tests)
```bash
cd server
npm test
```
Tests:
- `tests/auth.test.js`: User registration, validation error handling, password requirements, login, and JWT bearer authentication.
- `tests/chatTaskValidation.test.js`: Zod schema validation for chat messages, typing signals, task creation, and XSS sanitization.

### 2. End-to-End Multi-Socket Integration Tests
```bash
cd server
node test-phase1.js   # Auth, room creation, socket JWT handshake & presence
node test-phase2.js   # Whiteboard strokes, undo, timer controls & session recording
node test-phase3.js   # Yjs CRDT notes sync, typing indicators, stats & security headers
node test-phase4.js   # Room chat, shared tasks, Pomodoro long break, and AI endpoints
```
