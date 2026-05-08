import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password)
      return NextResponse.json({ ok: false, error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 });

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT user_id, name, password_hash, role FROM users WHERE email = ?',
      [email]
    );

    const user = (rows as RowDataPacket[])[0];

    if (!user || !user.password_hash)
      return NextResponse.json({ ok: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 });

    const valid = await bcrypt.compare(password, user.password_hash as string);
    if (!valid)
      return NextResponse.json({ ok: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 });

    const session = Buffer.from(JSON.stringify({ uid: user.user_id, role: user.role })).toString('base64');

    const res = NextResponse.json({ ok: true, user: { name: user.name, role: user.role } });
    res.cookies.set('session', session, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 });
  }
}
