import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { name, email, role, password } = await req.json();

    if (!name?.trim() || !email || !role || !password)
      return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 });

    if (password.length < 8)
      return NextResponse.json({ ok: false, error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }, { status: 400 });

    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name.trim(),
    });
    await adminAuth.setCustomUserClaims(userRecord.uid, { role });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'auth/email-already-exists')
      return NextResponse.json({ ok: false, error: 'อีเมลนี้ถูกใช้งานแล้ว' }, { status: 409 });

    console.error('[signup]', err);
    const msg = process.env.NODE_ENV === 'development' && err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
