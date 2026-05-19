import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

async function validateRoom(roomCode: string): Promise<boolean> {
  const now = new Date();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM bookings b
     WHERE b.room_code = ?
       AND b.status IN ('confirmed','pending','in_progress')
       AND b.start_time <= ?
       AND b.end_time   >= ?
     LIMIT 1`,
    [roomCode, now, now]
  );
  return rows.length > 0;
}

export async function GET(req: NextRequest) {
  const roomCode = req.nextUrl.searchParams.get('room')?.toUpperCase().trim();
  const since    = Number(req.nextUrl.searchParams.get('since') ?? 0);

  if (!roomCode)
    return NextResponse.json({ ok: false }, { status: 400 });

  try {
    if (!await validateRoom(roomCode)) return NextResponse.json({ ok: false }, { status: 404 });

    const [messages] = await pool.query<RowDataPacket[]>(
      `SELECT id, user_id, user_name, content, created_at
       FROM lab_chat WHERE lab_code = ? AND id > ?
       ORDER BY created_at ASC LIMIT 80`,
      [roomCode, since]
    );

    return NextResponse.json({ ok: true, messages, lab_code: roomCode });
  } catch (err) {
    console.error('[lab/chat-view GET]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const roomCode  = (body.room   as string)?.toUpperCase().trim();
    const name      = (body.name   as string)?.trim().slice(0, 40);
    const rawId     = (body.viewer_id as string)?.trim() ?? '';
    const viewerId  = rawId.startsWith('viewer_') ? rawId.slice(7) : rawId;
    const content   = (body.content as string)?.trim().slice(0, 1000);

    if (!roomCode || !name || !viewerId || !content)
      return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ครบ' }, { status: 400 });

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(viewerId))
      return NextResponse.json({ ok: false, error: 'viewer_id ไม่ถูกต้อง' }, { status: 400 });

    if (!await validateRoom(roomCode))
      return NextResponse.json({ ok: false, error: 'ห้องปิดแล้วหรือไม่มีอยู่' }, { status: 404 });

    const now = new Date();
    const [result] = await pool.query(
      `INSERT INTO lab_chat (lab_code, user_id, user_name, content, created_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
      [roomCode, viewerId, name, content]
    );
    const insertId = (result as { insertId: number }).insertId;

    const message = { id: insertId, user_id: viewerId, user_name: name, content, created_at: now.toISOString() };

    const broadcast = (global as { __wssBroadcastToRoom?: (room: string, msg: unknown) => void }).__wssBroadcastToRoom;
    if (broadcast) broadcast(`lab:${roomCode}`, { type: 'chat', payload: message });

    return NextResponse.json({ ok: true, message });
  } catch (err) {
    console.error('[lab/chat-view POST]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
