import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.routes';
import passwordResetRoutes from './routes/passwordReset.routes';
import n8nInstanceRoutes from './routes/n8nInstance.routes';
import workflowRoutes from './routes/workflow.routes';
import adminRoutes from './routes/admin.routes';
import credentialGuidanceRoutes from './routes/credentialGuidance.routes';
import publicRoutes from './routes/public.routes';
import templatesRoutes from './routes/templates.routes';
import { errorHandler } from './middleware/errorHandler';

// Load environment variables
dotenv.config();

// Validate required secrets at startup
const requiredSecrets = ['JWT_SECRET', 'ENCRYPTION_KEY'] as const;
for (const secret of requiredSecrets) {
  if (!process.env[secret]) {
    console.error(`FATAL: ${secret} environment variable is not set. Server cannot start securely.`);
    process.exit(1);
  }
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/password-reset', passwordResetRoutes);
app.use('/api/n8n-instances', n8nInstanceRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/credentials/guidance', credentialGuidanceRoutes);

// Public routes (no authentication required)
app.use('/api/public', publicRoutes);
app.use('/api/templates', templatesRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});

export { io };
