// server/src/index.js
import express from 'express';
import cors from 'cors';
import { env } from './env.js';

import { health } from './routes/health.js';
import { tools } from './routes/tools.js';
import { chat } from './routes/chat.js';
import { admin } from './routes/admin.js';
import { adminAuth } from './middleware/adminAuth.js';
import { errorMiddleware } from './errors.js';

const app = express();

// middlewares
app.use(cors({ origin: env.ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));

// tiny request logger with timing (no external deps)
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        // method path status ms
        console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms`);
    });
    next();
});

// routes
app.use('/api/health', health);
app.use('/api/tools', tools);
app.use('/api', chat);
app.use('/api/admin', adminAuth, admin);

// 404 (optional)
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Centralized error handler
app.use(errorMiddleware);

// start server
app.listen(env.PORT, () => {
    console.log(`API on :${env.PORT}`);
});
