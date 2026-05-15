import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifySession } from '@/lib/session';
import { RowDataPacket } from 'mysql2';

async function getUid(): Promise<string | null> {
  try {
    const store = await cookies();
    const s = store.get('session');
    if (!s) return null;
    return (verifySession(s.value)?.uid as string) ?? null;
  } catch { return null; }
}

// GET — ดึงการแจ้งเตือน 20 รายการล่าสุด
export async function GET() {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT notification_id, title, message, type, action_url, is_read, created_at
     FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    [uid]
  );
  const unread = (rows as RowDataPacket[]).filter(n => !n.is_read).length;
  return NextResponse.json({ ok: true, notifications: rows, unread });
}

// PATCH — อ่านทั้งหมด
export async function PATCH(_req: NextRequest) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [uid]);
  return NextResponse.json({ ok: true });
}
