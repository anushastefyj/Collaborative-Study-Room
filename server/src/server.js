import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { initSocketServer } from './sockets/index.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
await connectDB();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Express Middleware
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

// Create HTTP Server & initialize Socket.io
const httpServer = http.createServer(app);
initSocketServer(httpServer, CLIENT_URL);

// Start Server
httpServer.listen(PORT, () => {
  console.log(`[Server] Collaborative Study Room server running on port ${PORT}`);
  console.log(`[Server] CORS configured for client URL: ${CLIENT_URL}`);
});
