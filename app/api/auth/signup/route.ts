import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
  try {
    const { name, email, role, password } = await req.json();

    if (!name?.trim() || !email || !role || !password)
      return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 });

    if (password.length < 8)
      return NextResponse.json({ ok: false, error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }, { status: 400 });

    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT user_id FROM users WHERE email = ?', [email]
    );
    if ((existing as RowDataPacket[]).length > 0)
      return NextResponse.json({ ok: false, error: 'อีเมลนี้ถูกใช้งานแล้ว' }, { status: 409 });

    const hash = await bcrypt.hash(password, 12);

    await pool.query(
      'INSERT INTO users (user_id, email, name, password_hash, role) VALUES (UUID(), ?, ?, ?, ?)',
      [email, name.trim(), hash, role]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[signup]', err);
    const msg = process.env.NODE_ENV === 'development' && err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
