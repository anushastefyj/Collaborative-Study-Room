# 🎓 StudySpace — Collaborative Study Room (MERN + Socket.io)

StudySpace is a full-stack, real-time collaborative virtual study room platform designed for focused group productivity. Built using the **MERN stack** (MongoDB, Express, React, Node.js) and **Socket.io** WebSockets, it features conflict-free collaborative notes (powered by **Yjs CRDT**), a shared real-time whiteboard, synchronized Pomodoro study timers, comprehensive study analytics, and robust security protections.

---

## 🏗️ Architecture Overview

StudySpace leverages a hybrid **REST API + WebSockets** architecture:
- **REST API (`/api/*`)**: Handles stateless user registration, authentication (JWT), room provisioning, study stats aggregation, and fallback note retrieval.
- **WebSocket Gateway (Socket.io)**: Manages bi-directional, sub-50ms real-time communication for presence tracking, whiteboard stroke streaming, Yjs CRDT binary updates, live drawing cursor positions, and host-synchronized Pomodoro clocks.
- **CRDT Layer (Yjs)**: Enables conflict-free concurrent editing where multiple users can type simultaneously into the shared notes pad without character collision or race condition overwrites.
- **Persistence Layer (MongoDB)**: Debounced in-memory flushing ensures high-frequency whiteboard strokes and text changes are persisted reliably to MongoDB with minimal database overhead.

```
       +-------------------------------------------------------------+
       |               React + Vite Frontend (SPA)                   |
       |  +--------------------+  +------------------+  +---------+  |
       |  | Collaborative Board|  |  Yjs Notes Pad   |  |Pomodoro |  |
       |  |  (Canvas + Cursors)|  | (CRDT Text Sync) |  |  Timer  |  |
       +--+---------+----------+--+--------+---------+--+----+----+--+
                    |                      |                 |
       [draw:stroke / cursor]     [notes:update]      [timer:action]
                    |                      |                 |
                    v                      v                 v
       +-------------------------------------------------------------+
       |             Socket.io Real-Time Gateway (Node.js)           |
       |  - JWT Handshake Auth      - In-Memory Y.Doc CRDT Cache     |
       |  - Presence Room Store     - Timer Clock & Interval Sync   |
       +------------------------------+------------------------------+
                                      | Debounced Flush
                                      v
       +-------------------------------------------------------------+
       |                      MongoDB Database                       |
       |   Users   •   Rooms   •   Notes   •   Sessions   •  Boards  |
       +-------------------------------------------------------------+
```

---

## ⚡ Core Features

### 1. Collaborative Real-Time Notes Pad (Phase 3)
- **Conflict-Free Synchronization**: Built on **Yjs CRDT**; changes from multiple concurrent typists merge deterministically without data loss.
- **Auto-Save Persistence**: Debounced auto-save to MongoDB `Note` model (`roomId`, `roomCode`, `content`, `lastEditedBy`, `updatedAt`) every 2 seconds.
- **Live Typing Indicators**: Broadcasts active typers ("Alice is typing...", "Alice and Bob are typing...") with automatic inactivity expiry.
- **Export Capabilities**:
  - **Download as PDF**: Generates a clean, styled document with room code, export date, and word-wrapped text via `jspdf`.
  - **Download as Plain Text**: Exports `.txt` file with one click.
  - **Copy to Clipboard**: Quick copy with animated feedback.
- **Word & Character Counters**: Live counting of document length.

### 2. Live Study Analytics & Streak Tracking (Phase 3)
- **Focus Metric Cards**:
  - **Total Focus Hours**: Calculated from completed 25-minute Pomodoro intervals.
  - **Sessions Completed**: All-time completed study session count.
  - **Current Daily Streak**: Consecutive days studied with active streak flame indicator (🔥).
  - **Study Spaces Count**: Total rooms created/studied in.
- **Weekly Rhythm Bar Chart (Recharts)**: Interactive bar chart plotting daily session counts and focus minutes over the past 7 days.
- **Room Breakdown Table**: Detailed summary showing completed focus cycles per room with direct navigation links.

### 3. Shared Collaborative Whiteboard (Phases 2 & 3)
- **Multi-User Canvas**: HTML5 Canvas with normalized (0 to 1) coordinate mapping ensuring identical rendering across different screen dimensions.
- **Live Drawing Cursors**: Floating peer pointers displaying peer name tags and colors as they draw, accompanied by a status banner ("Alice is currently drawing...").
- **Tools**: Pen, Eraser, 8 Preset Colors, Custom Color Picker, Brush Size slider (2px–24px).
- **Undo & Clear**: Room-wide Undo of the user's last stroke and global board clearing with confirmation.
- **Export as PNG**: Instant client-side render to high-resolution PNG image with dark slate backdrop and room watermark.

### 4. Synchronized Pomodoro Timer (Phase 2)
- **Room-Wide Synchronization**: Authoritative server timer clock broadcasting ticks every second.
- **Focus & Break Cycles**: 25-minute focus intervals automatically rolling into 5-minute short breaks.
- **Host vs. Open Control**: Host controls the timer by default, or can toggle "Anyone can control timer" to enable peer collaboration.
- **Daily Session Counting**: Completed focus sessions are automatically recorded in MongoDB for today's date.

### 5. Authentication, Rooms & Presence (Phase 1)
- **JWT Authentication**: Secure signup and login with hashed passwords (`bcryptjs`).
- **Room Management**: Easy room creation generating unique 6-character alphanumeric room codes (`e.g. 3SY9Q4`).
- **Live Presence**: Real-time participants panel tracking online users, host indicators, and join/leave alerts.

### 6. UI Polish & Security (Phase 3)
- **Responsive Layout**: Clean desktop layout with tab/split toggle (`Shared Whiteboard`, `Collaborative Notes`, `Split View`) and 3-tab mobile switcher (`Board`, `Notes`, `Timer`).
- **Dark/Light Theme Toggle**: Seamless dark mode and light mode toggle with `localStorage` persistence.
- **Reconnection Banner**: Prominent connection-drop warning when the live WebSocket gateway disconnects, auto-dismissing on reconnect.
- **Security Protections**:
  - **Helmet**: Secures HTTP response headers.
  - **Rate Limiting**: 150 req/15min API limiter and 30 req/15min auth brute-force limiter.
  - **Input Validation**: `express-validator` schema rules on registration, login, room creation, and room codes.
  - **CORS Configuration**: Multi-origin CORS support for production.

---

## 📡 Socket.io Event Catalog

| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `room:join` | Client ➔ Server | `{ roomCode }` | Client enters study room; triggers presence update & board/timer sync |
| `room:leave` | Client ➔ Server | `{ roomCode }` | Client leaves study room; cleans up socket from room |
| `presence:update` | Server ➔ Room | `{ roomCode, members, action, user }` | Broadcasts active participant list when someone joins or leaves |
| `board:init` | Client ➔ Server | `{ roomCode }` | Requests initial whiteboard strokes array |
| `board:state` | Server ➔ Socket | `{ roomCode, strokes }` | Sends full whiteboard stroke history to joining socket |
| `draw:stroke` | Bidirectional | `{ roomCode, strokeId, points, color, size, tool }` | Emits new stroke points; broadcast to peers |
| `draw:undo` | Bidirectional | `{ roomCode, strokeId, userId }` | Reverts user's most recent stroke |
| `draw:clear` | Bidirectional | `{ roomCode, clearedBy }` | Clears all strokes on the whiteboard |
| `draw:cursor` | Bidirectional | `{ roomCode, x, y, isDrawing, color, userName }` | Real-time peer drawing cursor position and status |
| `notes:init` | Client ➔ Server | `{ roomCode }` | Requests initial Yjs document state and metadata |
| `notes:update` | Bidirectional | `{ roomCode, update: Array<number>, userName }` | Yjs CRDT binary update applied to document |
| `notes:typing` | Bidirectional | `{ roomCode, isTyping: boolean }` | Broadcasts typing indicator to peers |
| `timer:action` | Client ➔ Server | `{ roomCode, action: 'start'\|'pause'\|'reset'\|'switch-mode' }` | Host/peer triggers timer state mutation |
| `timer:state` | Server ➔ Room | `{ roomCode, mode, isRunning, remainingSeconds, ... }` | Authoritative timer state broadcast every second |
| `timer:settings`| Bidirectional | `{ roomCode, anyoneCanControlTimer: boolean }` | Toggles timer permission mode |

---

## 📂 Project Structure

```
Collaborative Study Room/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx               # Navigation bar with Theme toggle & Stats link
│   │   │   ├── NotesPad.jsx             # Yjs CRDT collaborative text editor & exports
│   │   │   ├── PomodoroTimer.jsx        # Synchronized Pomodoro timer component
│   │   │   ├── ProtectedRoute.jsx       # Auth route guard
│   │   │   ├── ReconnectionBanner.jsx   # Live gateway connection loss alert
│   │   │   ├── Toast.jsx                # Toast notification popup
│   │   │   └── Whiteboard.jsx           # HTML5 canvas whiteboard with peer cursors & PNG export
│   │   ├── context/
│   │   │   ├── AuthContext.jsx          # JWT authentication context
│   │   │   ├── SocketContext.jsx        # Socket.io connection manager
│   │   │   └── ThemeContext.jsx         # Dark / Light theme toggle context
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx        # Rooms list, create room, join room
│   │   │   ├── LoginPage.jsx            # User sign-in
│   │   │   ├── RegisterPage.jsx         # User registration
│   │   │   ├── RoomPage.jsx             # Responsive study room (Board/Notes/Timer)
│   │   │   └── StatsPage.jsx            # Study stats, Recharts weekly rhythm & streaks
│   │   ├── services/
│   │   │   └── api.js                   # Universal fetch wrapper (Auth, Rooms, Notes, Stats)
│   │   ├── App.jsx                      # Main application routing
│   │   ├── index.css                    # Tailwind CSS v4 & theme variables
│   │   └── main.jsx                     # Vite entry point
│   ├── .env.example                     # Client environment variables template
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js                    # Mongoose MongoDB connection
│   │   ├── controllers/
│   │   │   ├── authController.js        # Register, login, getMe
│   │   │   ├── notesController.js       # REST notes fetch & fallback save
│   │   │   ├── roomController.js        # Create, get, list rooms & session history
│   │   │   └── statsController.js       # Focus hours, streak, weekly history aggregation
│   │   ├── middleware/
│   │   │   ├── auth.js                  # Bearer JWT verification middleware
│   │   │   ├── errorHandler.js          # 404 and global error handler
│   │   │   ├── rateLimiter.js           # API and Auth rate limiters
│   │   │   └── validate.js              # express-validator schemas
│   │   ├── models/
│   │   │   ├── Note.js                  # Collaborative notes document schema
│   │   │   ├── Room.js                  # Study room schema
│   │   │   ├── Session.js               # Pomodoro focus session schema
│   │   │   ├── User.js                  # User schema with bcrypt passwordHash
│   │   │   └── Whiteboard.js            # Whiteboard stroke schema
│   │   ├── routes/
│   │   │   ├── authRoutes.js            # /api/auth
│   │   │   ├── notesRoutes.js           # /api/notes
│   │   │   ├── roomRoutes.js            # /api/rooms
│   │   │   └── statsRoutes.js           # /api/stats
│   │   ├── sockets/
│   │   │   ├── index.js                 # Socket.io server bootstrap & auth handshake
│   │   │   ├── notesHandler.js          # Yjs CRDT sync, typing indicators & note persistence
│   │   │   ├── presenceStore.js         # In-memory room membership tracker
│   │   │   ├── roomHandler.js           # Room join/leave & presence events
│   │   │   ├── socketAuth.js            # Socket handshake JWT middleware
│   │   │   ├── timer.js                 # Authoritative Pomodoro clock & session recorder
│   │   │   └── whiteboard.js            # Canvas stroke broadcast, undo & peer cursors
│   │   ├── utils/
│   │   │   └── generateCode.js          # Unique 6-character room code generator
│   │   └── server.js                    # Express app, Helmet, CORS, Socket.io HTTP server
│   ├── test-phase1.js                   # Phase 1 integration test suite
│   ├── test-phase2.js                   # Phase 2 integration test suite
│   ├── test-phase3.js                   # Phase 3 integration test suite
│   ├── .env.example                     # Server environment variables template
│   └── package.json
└── README.md
```

---

## 🚀 Local Development Setup

### Prerequisites
- **Node.js** (v18 or higher recommended)
- **MongoDB** running locally (`mongodb://localhost:27017`) or a free MongoDB Atlas connection string.

### 1. Clone & Setup Server
```bash
cd server
cp .env.example .env
npm install
npm run dev
```

### 2. Setup Client
```bash
cd ../client
cp .env.example .env
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Running Automated Test Suites

All 3 phases include comprehensive end-to-end integration test scripts that simulate multi-user socket interactions:

```bash
# In the server directory:
node test-phase1.js   # Auth, room creation, socket JWT handshake & presence
node test-phase2.js   # Whiteboard strokes, undo, timer controls & session recording
node test-phase3.js   # Yjs CRDT notes sync, typing indicators, stats & security headers
```

---

## 🌐 Production Deployment Guide

### Step 1: MongoDB Atlas Database
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and sign in.
2. Create a free shared cluster (e.g., M0 tier).
3. Under **Database Access**, create a user with read/write privileges (e.g., `studyspace_user`).
4. Under **Network Access**, add IP `0.0.0.0/0` (allow connections from anywhere) so Render/Railway can connect.
5. In **Clusters > Connect > Drivers**, copy your connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/collaborative-study-room?retryWrites=true&w=majority
   ```

### Step 2: Backend on Render or Railway (WebSockets Supported)
Both **Render** and **Railway** provide native WebSocket support required for Socket.io.

#### Deploying on Render:
1. Push your repository to GitHub.
2. Sign in to [Render](https://render.com) and click **New > Web Service**.
3. Select your repository.
4. Set the configuration:
   - **Root Directory**: `server`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/server.js`
5. Under **Environment Variables**, add:
   - `PORT`: `5000` (or leave default assigned by Render)
   - `MONGODB_URI`: `<Your MongoDB Atlas Connection String>`
   - `JWT_SECRET`: `<A strong random string, e.g. openssl rand -base64 32>`
   - `CLIENT_URL`: `https://your-frontend.vercel.app`
6. Click **Create Web Service**. Note your backend URL (e.g. `https://studyspace-backend.onrender.com`).

### Step 3: Frontend on Vercel
1. Sign in to [Vercel](https://vercel.com) and click **Add New > Project**.
2. Select your repository.
3. Configure project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click edit and choose `client`
4. Under **Environment Variables**, add:
   - `VITE_API_URL`: `https://studyspace-backend.onrender.com`
   - `VITE_SOCKET_URL`: `https://studyspace-backend.onrender.com`
5. Click **Deploy**.
6. Once deployed, copy your production Vercel URL and update the `CLIENT_URL` in your Render backend settings.

---

## 🛡️ Production `.env` Configurations

### Backend (`server/.env`)
```ini
PORT=5000
MONGODB_URI=mongodb+srv://admin:StrongPassword123@cluster0.abcde.mongodb.net/collaborative-study-room?retryWrites=true&w=majority
JWT_SECRET=supersecret_study_room_jwt_key_2026_prod
CLIENT_URL=https://studyspace.vercel.app,http://localhost:5173
```

### Frontend (`client/.env`)
```ini
VITE_API_URL=https://studyspace-backend.onrender.com
VITE_SOCKET_URL=https://studyspace-backend.onrender.com
```

---

## ✅ Final End-to-End Test Checklist

Before shipping to production, verify each flow:
- [ ] **Authentication**: User registration rejects short passwords / bad emails with clear 400 messages; successful signup stores token and redirects to dashboard.
- [ ] **Room Creation**: Host creates room, receives unique 6-character room code; copy room code button displays checkmark.
- [ ] **Presence**: Multiple tabs / users entering the room appear in the Participants panel; toast alerts trigger on join/leave.
- [ ] **Collaborative Notes**:
  - [ ] Two users typing concurrently at different places merge seamlessly via Yjs without overwrites.
  - [ ] "Alice is typing..." indicator displays when Alice types and vanishes after pause.
  - [ ] Auto-save indicator shows "Saving changes..." and transitions to "All changes saved".
  - [ ] Notes export to `.pdf` with formatted headers and to `.txt`.
- [ ] **Whiteboard**:
  - [ ] Strokes drawn in one window appear instantly in the other.
  - [ ] Moving/drawing on canvas displays peer cursor with name tag.
  - [ ] "Export PNG" downloads canvas snapshot with watermark.
  - [ ] Undo reverts only the active user's last stroke.
- [ ] **Pomodoro Timer**:
  - [ ] Host controls timer; non-host peer receives alert if controls are locked.
  - [ ] Host can toggle "Anyone can control timer" to allow peer controls.
  - [ ] Completed sessions increment and persist to daily session record.
- [ ] **Stats Page**:
  - [ ] Total focus hours, completed session count, and streak count display accurately.
  - [ ] Recharts weekly bar chart plots 7-day session distribution with hover tooltip.
- [ ] **UI Polish**:
  - [ ] Responsive 3-tab switcher activates properly on mobile viewports.
  - [ ] Dark/Light mode toggle switches themes and persists across refresh.
  - [ ] Reconnection banner appears if backend is paused and vanishes on reconnect.
