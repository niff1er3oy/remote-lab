import crypto from 'crypto';

const SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-me';

export function signSession(payload: Record<string, unknown>): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64');
  const sig  = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
  return `${data}.${sig}`;
}

export function verifySession(token: string): Record<string, unknown> | null {
  try {
    const dot = token.lastIndexOf('.');
    if (dot === -1) return null;
    const data     = token.slice(0, dot);
    const sig      = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return JSON.parse(Buffer.from(data, 'base64').toString());
  } catch {
    return null;
  }
}
