import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import serviceRoutes from './routes/serviceRoutes';
import providerRoutes from './routes/providerRoutes';
import bookingRoutes from './routes/bookingRoutes';
import diagnosticsRoutes from './routes/diagnosticsRoutes';
import userRoutes from './routes/userRoutes';
import notificationRoutes from './routes/notificationRoutes';
import reviewRoutes from './routes/reviewRoutes';
import complaintRoutes from './routes/complaintRoutes';
import versionRoutes from './routes/versionRoutes';
import { globalErrorHandler } from './middleware/error';
import { createServer } from 'http';
import { initSocket } from './socket';

dotenv.config();

const app = express();
const httpServer = createServer(app);
initSocket(httpServer);

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use((req, res, next) => {
  console.log(`[API Request] ${req.method} ${req.url} - ${new Date().toISOString()}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/diagnostics', diagnosticsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/version', versionRoutes); // public — no auth

// Global Error Handler (must be after all routes)
app.use(globalErrorHandler);

httpServer.listen(PORT, () => {
  console.log(`[Server] Secure production-ready backend listening on port ${PORT}`);
});
