import crypto from 'crypto';

const PASSWORD = process.env.GPU_MONITOR_PASSWORD;

// In-memory token store (survives for the process lifetime)
const validTokens = new Set();

/**
 * Create a session token if the password matches.
 * Returns { token } or null.
 */
export function login(password) {
  if (password !== PASSWORD) return null;
  const token = crypto.randomBytes(32).toString('hex');
  validTokens.add(token);
  return { token };
}

/**
 * Invalidate a token.
 */
export function logout(token) {
  validTokens.delete(token);
}

/**
 * Express middleware — rejects requests without a valid bearer token.
 * Skips auth for POST /api/auth/login so the client can obtain a token.
 */
export function requireAuth(req, res, next) {
  // Let the login endpoint through
  if (req.path === '/auth/login' && req.method === 'POST') return next();

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token || !validTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
