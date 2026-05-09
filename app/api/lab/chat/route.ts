import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
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
    const { uid } = JSON.parse(Buffer.from(session.value, 'base64').toString());
    const { lab, content } = await req.json();
    if (!content?.trim()) return NextResponse.json({ ok: false }, { status: 400 });

    const [userRows] = await pool.query<RowDataPacket[]>(
      'SELECT name FROM users WHERE user_id = ?', [uid]
    );
    const userName = (userRows as RowDataPacket[])[0]?.name ?? 'ผู้ใช้';

    await ensureTable();
    await pool.query(
      `INSERT INTO lab_chat (lab_code, user_id, user_name, content, created_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
      [lab ?? 'LAB8', uid, userName, content.trim()]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[lab/chat POST]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
