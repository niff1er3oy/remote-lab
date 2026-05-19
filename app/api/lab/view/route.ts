import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET(req: NextRequest) {
  const roomCode = req.nextUrl.searchParams.get('room')?.toUpperCase().trim();
  if (!roomCode)
    return NextResponse.json({ ok: false, error: 'กรุณาระบุรหัสห้อง' }, { status: 400 });

  try {
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

    if (!rows.length)
      return NextResponse.json(
        { ok: false, error: 'รหัสห้องไม่ถูกต้อง หรือห้องนี้ไม่ได้เปิดใช้งานอยู่' },
        { status: 404 }
      );

    const r = rows[0];
    return NextResponse.json({
      ok:        true,
      room_code: r.room_code,
      lab_code:  r.lab_code,
      lab_name:  r.lab_name,
      host_name: r.host_name,
      end_time:  r.end_time,
    });
  } catch (err) {
    console.error('[lab/view]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
