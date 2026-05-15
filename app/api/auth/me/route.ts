import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifySession } from '@/lib/session';
import { RowDataPacket } from 'mysql2';

export async function GET() {
  const store = await cookies();
  const session = store.get('session');
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const payload = verifySession(session.value);
    if (!payload) return NextResponse.json({ ok: false }, { status: 401 });
    const { uid } = payload;
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT user_id, name, email, role FROM users WHERE user_id = ?', [uid]
    );
    const user = (rows as RowDataPacket[])[0];
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });
    return NextResponse.json({ ok: true, user: { name: user.name, email: user.email, role: user.role } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}
