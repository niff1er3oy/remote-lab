import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

let columnReady = false;
async function ensureRoomCodeColumn() {
  if (columnReady) return;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'room_code'`
  );
  if ((rows as RowDataPacket[])[0].cnt === 0) {
    try {
      await pool.query(`
        ALTER TABLE bookings
          ADD COLUMN room_code CHAR(6) NULL AFTER status,
          ADD UNIQUE KEY idx_bookings_room_code (room_code)
      `);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('Duplicate') && !msg.includes('already exists')) throw e;
    }
  }
  columnReady = true;
}

export async function GET() {
  const store = await cookies();
  const session = store.get('session');
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const { uid } = JSON.parse(Buffer.from(session.value, 'base64').toString());
    await ensureRoomCodeColumn();
    const now = new Date();

    const [activeRows] = await pool.query<RowDataPacket[]>(
      `SELECT b.booking_id, b.start_time, b.end_time, b.room_code, l.code, l.name_th
       FROM bookings b
       JOIN labs l ON l.lab_id = b.lab_id
       WHERE b.user_id = ?
         AND b.status IN ('confirmed', 'pending', 'in_progress')
         AND b.start_time <= ?
         AND b.end_time   >= ?
       LIMIT 1`,
      [uid, now, now]
    );

    if ((activeRows as RowDataPacket[]).length > 0) {
      const b = (activeRows as RowDataPacket[])[0];
      return NextResponse.json({
        ok: true,
        active: true,
        booking: {
          booking_id:      b.booking_id,
          experiment_code: b.code,
          experiment_name: b.name_th,
          start_time:      b.start_time,
          end_time:        b.end_time,
          room_code:       b.room_code ?? null,
        },
      });
    }

    const [nextRows] = await pool.query<RowDataPacket[]>(
      `SELECT b.start_time, l.code, l.name_th
       FROM bookings b
       JOIN labs l ON l.lab_id = b.lab_id
       WHERE b.user_id = ?
         AND b.status IN ('confirmed', 'pending')
         AND b.start_time > ?
       ORDER BY b.start_time ASC LIMIT 1`,
      [uid, now]
    );

    const next = (nextRows as RowDataPacket[])[0] ?? null;
    return NextResponse.json({
      ok: true,
      active: false,
      next_booking: next ? {
        start_time:      next.start_time,
        experiment_code: next.code,
        experiment_name: next.name_th,
      } : null,
    });
  } catch (err) {
    console.error('[active-session]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
