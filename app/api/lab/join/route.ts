import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
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
    await pool.query(`
      ALTER TABLE bookings
        ADD COLUMN room_code CHAR(6) NULL AFTER status,
        ADD UNIQUE KEY idx_bookings_room_code (room_code)
    `);
  }
  columnReady = true;
}

export async function GET(req: NextRequest) {
  const store = await cookies();
  if (!store.get('session'))
    return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });

  const roomCode = req.nextUrl.searchParams.get('room')?.toUpperCase().trim();
  if (!roomCode)
    return NextResponse.json({ ok: false, error: 'กรุณาระบุรหัสห้อง' }, { status: 400 });

  try {
    await ensureRoomCodeColumn();
    const now = new Date();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT b.room_code, b.end_time,
              l.code AS lab_code, l.name_th AS lab_name,
              u.name AS host_name
       FROM bookings b
       JOIN labs  l ON l.lab_id  = b.lab_id
       JOIN users u ON u.user_id = b.user_id
       WHERE b.room_code = ?
         AND b.status IN ('confirmed','pending','in_progress')
         AND b.start_time <= ?
         AND b.end_time   >= ?
       LIMIT 1`,
      [roomCode, now, now]
    );

    if (!(rows as RowDataPacket[]).length)
      return NextResponse.json(
        { ok: false, error: 'รหัสห้องไม่ถูกต้อง หรือห้องนี้ไม่ได้เปิดใช้งานอยู่' },
        { status: 404 }
      );

    const r = (rows as RowDataPacket[])[0];
    return NextResponse.json({
      ok:        true,
      room_code: r.room_code,
      lab_code:  r.lab_code,
      lab_name:  r.lab_name,
      host_name: r.host_name,
      end_time:  r.end_time,
    });
  } catch (err) {
    console.error('[lab/join]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
