import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import notesRoutes from './routes/notesRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import { apiLimiter, authLimiter } from './middleware/rateLimiter.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { initSocketServer } from './sockets/index.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
await connectDB();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Security Headers with Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Flexible CORS for single or multi-origin deployments
const allowedOrigins = CLIENT_URL.split(',').map((u) => u.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked request from origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply general API rate limiting to all /api/ endpoints
app.use('/api/', apiLimiter);

// API Routes
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/stats', statsRoutes);

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

// Create HTTP Server & initialize Socket.io
const httpServer = http.createServer(app);
initSocketServer(httpServer, CLIENT_URL);

// Start Server
httpServer.listen(PORT, () => {
  console.log(`[Server] Collaborative Study Room server running on port ${PORT}`);
  console.log(`[Server] CORS configured for client URLs: ${allowedOrigins.join(', ')}`);
});
