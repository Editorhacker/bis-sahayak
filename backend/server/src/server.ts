import express from 'express';
import cookieParser from 'cookie-parser';
import { getEnv } from './config/env.js';
import { pool, closePool } from './db/index.js';
import {
  securityHeaders,
  corsMiddleware,
  globalRateLimit,
  validateContentType,
  sanitizeInput,
  requestLogger,
  logger,
  errorHandler,
  notFoundHandler,
} from './middleware/index.js';
import authRoutes from './modules/auth/index.js';
import businessRoutes from './modules/businesses/index.js';
import productRoutes from './modules/products/index.js';
import roadmapRoutes from './modules/roadmap/index.js';
import requirementRoutes from './modules/requirements/index.js';
import standardRoutes from './modules/standards/index.js';
import labRoutes from './modules/labs/index.js';
import chatRoutes, { conversationRoutes } from './modules/chat/index.js';
import applicationRoutes from './modules/applications/index.js';
import feedbackRoutes from './modules/feedback/index.js';
import adminRoutes from './modules/admin/index.js';

const env = getEnv();

const app = express();

app.use(securityHeaders);
app.use(corsMiddleware);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(globalRateLimit);
app.use(validateContentType);
app.use(sanitizeInput);
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/businesses', businessRoutes);
app.use('/api/v1/businesses/:id/products', productRoutes);
app.use('/api/v1', roadmapRoutes);
app.use('/api/v1/requirements', requirementRoutes);
app.use('/api/v1/standards', standardRoutes);
app.use('/api/v1/laboratories', labRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1', conversationRoutes);
app.use('/api/v1/applications', applicationRoutes);
app.use('/api/v1/feedback', feedbackRoutes);
app.use('/api/v1/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  try {
    await pool.query('SELECT 1');
    logger.info('Database connected');

    app.listen(env.PORT, env.HOST, () => {
      logger.info(`Server running on http://${env.HOST}:${env.PORT}`);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await closePool();
  process.exit(0);
});

startServer();

export { app };