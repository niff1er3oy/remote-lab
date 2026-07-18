import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';

async function postSession(idToken: string): Promise<{ ok: boolean; needsRefresh?: boolean }> {
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error('session');
  return res.json();
}

// Exchanges the signed-in user's ID token for an httpOnly session cookie.
// First-time sign-ins via a provider that skipped /api/auth/signup (e.g.
// Google) get a default 'student' role assigned server-side, which requires
// one forced token refresh before the session cookie can carry it.
async function establishSessionFromUser(user: User): Promise<void> {
  const first = await postSession(await user.getIdToken());
  if (first.needsRefresh) {
    await postSession(await user.getIdToken(true));
  }
}

export async function establishSession(email: string, password: string): Promise<void> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await establishSessionFromUser(cred.user);
}

export async function establishGoogleSession(): Promise<void> {
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  await establishSessionFromUser(cred.user);
}

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'auth/invalid-email': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'auth/too-many-requests': 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่ภายหลัง',
  'auth/popup-closed-by-user': 'ปิดหน้าต่างเข้าสู่ระบบก่อนดำเนินการเสร็จสิ้น',
  'auth/cancelled-popup-request': 'ปิดหน้าต่างเข้าสู่ระบบก่อนดำเนินการเสร็จสิ้น',
  'auth/popup-blocked': 'เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตแล้วลองใหม่',
};

export function authErrorMessage(err: unknown): string {
  const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
  return FIREBASE_ERROR_MESSAGES[code] ?? 'ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่';
}
