// server/src/env.js
import 'dotenv/config';

export const env = {
    PORT: process.env.PORT || 5051,
    ORIGIN: process.env.ORIGIN || '*',
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
    MODEL: process.env.MODEL || 'llama-3.3-70b-versatile',
    ADMIN_USER: process.env.ADMIN_USER || '',
    ADMIN_PASS: process.env.ADMIN_PASS || '',
};
