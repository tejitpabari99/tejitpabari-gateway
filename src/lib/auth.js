import { createHmac } from 'crypto';

const SECRET = process.env.SESSION_SECRET || 'fallback-secret';

export function signRole(role) {
  const hmac = createHmac('sha256', SECRET).update(role).digest('hex');
  return `${role}:${hmac}`;
}

export function verifySession(cookieValue) {
  if (!cookieValue) return null;
  const colonIdx = cookieValue.lastIndexOf(':');
  if (colonIdx === -1) return null;
  const role = cookieValue.slice(0, colonIdx);
  const hmac = cookieValue.slice(colonIdx + 1);
  if (!role || !hmac) return null;
  const expected = createHmac('sha256', SECRET).update(role).digest('hex');
  if (hmac !== expected) return null;
  if (role !== 'admin' && role !== 'guest') return null;
  return role;
}
