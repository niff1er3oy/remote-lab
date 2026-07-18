import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { createSessionCookie, SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from '@/lib/session';

// Mints an httpOnly session cookie from a client-side Firebase ID token.
// Called right after the browser signs in via the Firebase client SDK —
// Admin SDK cannot verify a plaintext password directly, so the actual
// credential check happens client-side (signInWithEmailAndPassword /
// signInWithPopup) and this route only ever sees an already-verified ID token.
export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (!idToken)
      return NextResponse.json({ ok: false, error: 'ไม่พบ token' }, { status: 400 });

    // First-ever sign-in via a provider that never went through our own
    // /api/auth/signup (e.g. Google) has no `role` custom claim yet. Default
    // it to 'student' and ask the client to refresh its ID token before
    // retrying — a session cookie's claims are a snapshot of the ID token
    // passed in, not the live user record, so this must happen before we
    // create the cookie.
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!decoded.role) {
      await adminAuth.setCustomUserClaims(decoded.uid, { role: 'student' });
      return NextResponse.json({ ok: true, needsRefresh: true });
    }

    const cookie = await createSessionCookie(idToken);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, cookie, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });
    return res;
  } catch (err) {
    console.error('[auth/session]', err);
    return NextResponse.json({ ok: false, error: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่' }, { status: 401 });
  }
}
