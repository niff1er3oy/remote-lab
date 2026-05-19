import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifySession } from '@/lib/session';
import { RowDataPacket } from 'mysql2';

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lab_chat (
      id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lab_code   VARCHAR(20)  NOT NULL,
      user_id    CHAR(36)     NOT NULL,
      user_name  VARCHAR(255) NOT NULL,
      content    TEXT         NOT NULL,
      created_at DATETIME     NOT NULL DEFAULT NOW(),
      KEY idx_lab_chat (lab_code, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function GET(req: NextRequest) {
  const store = await cookies();
  if (!store.get('session')) return NextResponse.json({ ok: false }, { status: 401 });

  const lab   = req.nextUrl.searchParams.get('lab') ?? 'LAB8';
  const since = Number(req.nextUrl.searchParams.get('since') ?? 0);

  try {
    await ensureTable();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, user_id, user_name, content, created_at
       FROM lab_chat WHERE lab_code = ? AND id > ?
       ORDER BY created_at ASC LIMIT 80`,
      [lab, since]
    );
    return NextResponse.json({ ok: true, messages: rows });
  } catch (err) {
    console.error('[lab/chat GET]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = store.get('session');
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const payload = verifySession(session.value);
    if (!payload) return NextResponse.json({ ok: false }, { status: 401 });
    const uid = payload.uid as string;
    const { lab, content } = await req.json();
    if (!content?.trim()) return NextResponse.json({ ok: false }, { status: 400 });

    const [userRows] = await pool.query<RowDataPacket[]>(
      'SELECT name FROM users WHERE user_id = ?', [uid]
    );
    const userName = (userRows as RowDataPacket[])[0]?.name ?? 'ผู้ใช้';
    const chatKey = lab ?? 'LAB8';
    const now = new Date();

    await ensureTable();
    const [result] = await pool.query(
      `INSERT INTO lab_chat (lab_code, user_id, user_name, content, created_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
      [chatKey, uid, userName, content.trim()]
    );
    const insertId = (result as { insertId: number }).insertId;

    const message = {
      id: insertId,
      user_id: uid,
      user_name: userName,
      content: content.trim(),
      created_at: now.toISOString(),
    };

    // Broadcast to WebSocket room so all clients receive instantly
    const broadcast = (global as { __wssBroadcastToRoom?: (room: string, msg: unknown) => void }).__wssBroadcastToRoom;
    if (broadcast) broadcast(`lab:${chatKey}`, { type: 'chat', payload: message });

    return NextResponse.json({ ok: true, message });
  } catch (err) {
    console.error('[lab/chat POST]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
