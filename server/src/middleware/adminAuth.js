// server/src/middleware/adminAuth.js
import { env } from '../env.js';

function parseBasicAuth(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const payload = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = payload.indexOf(':');
    if (idx === -1) return null;
    return { user: payload.slice(0, idx), pass: payload.slice(idx + 1) };
  } catch {
    return null;
  }
}

export function adminAuth(req, res, next) {
  // Require credentials to be configured
  if (!env.ADMIN_USER || !env.ADMIN_PASS) {
    return res.status(503).json({ error: 'Admin is not configured. Set ADMIN_USER and ADMIN_PASS in server/.env' });
  }

  const creds = parseBasicAuth(req.headers.authorization || '');
  if (!creds) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (creds.user === env.ADMIN_USER && creds.pass === env.ADMIN_PASS) {
    return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).json({ error: 'Invalid credentials' });
}
