// server/src/index.js
import express from 'express';
import cors from 'cors';
import { env } from './env.js';

import { health } from './routes/health.js';
import { tools } from './routes/tools.js';
import { chat } from './routes/chat.js';
import { admin } from './routes/admin.js';

const app = express();

// middlewares
app.use(cors({ origin: env.ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));

// routes
app.use('/api/health', health);
app.use('/api/tools', tools);
app.use('/api', chat);
app.use('/api/admin', admin);

// 404 (optional)
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// start server
app.listen(env.PORT, () => {
    console.log(`API on :${env.PORT}`);
});
