const enc = new TextEncoder();

async function digest(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

// Constant-time: compare fixed-length SHA-256 digests, no early exit.
async function safeEqual(a, b) {
  const [da, db] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}

function parseBasic(header) {
  if (!header || !/^basic /i.test(header)) return null;
  try {
    const bin = atob(header.slice(6).trim());
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const i = bytes.indexOf(58); // first ':'
    if (i < 0) return null;
    return { user: bytes.slice(0, i), pass: bytes.slice(i + 1) };
  } catch {
    return null;
  }
}

// True only when user is `admin` and password equals the secret. Caller handles unset secret.
export async function checkAuth(request, secret) {
  const creds = parseBasic(request.headers.get('Authorization'));
  const user = creds ? creds.user : new Uint8Array(0);
  const pass = creds ? creds.pass : new Uint8Array(0);
  const [userOk, passOk] = await Promise.all([
    safeEqual(user, enc.encode('admin')),
    safeEqual(pass, enc.encode(secret)),
  ]);
  return Boolean(creds) && userOk && passOk;
}

export function unauthorized() {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="stats"', 'Cache-Control': 'no-store' },
  });
}
