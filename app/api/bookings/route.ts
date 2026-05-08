import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = store.get('session');
  if (!session) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });

  try {
    const { uid } = JSON.parse(Buffer.from(session.value, 'base64').toString());
    const { room_id, start_time, end_time } = await req.json();

    if (!room_id || !start_time || !end_time)
      return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 });

    // Find equipment in this room not booked in this slot
    const [equips] = await pool.query<RowDataPacket[]>(
      `SELECT e.equipment_id FROM equipment e
       WHERE e.experiment_id = ? AND e.status != 'offline'
         AND e.equipment_id NOT IN (
           SELECT b.equipment_id FROM bookings b
           WHERE b.status IN ('pending','confirmed','in_progress')
             AND b.start_time < ? AND b.end_time > ?
         )
       LIMIT 1`,
      [room_id, end_time, start_time]
    );

    if (!(equips as RowDataPacket[]).length)
      return NextResponse.json({ ok: false, error: 'ห้องนี้ถูกจองในช่วงเวลาดังกล่าวแล้ว' }, { status: 409 });

    const equipment_id = (equips as RowDataPacket[])[0].equipment_id;

    await pool.query(
      `INSERT INTO bookings (booking_id, user_id, equipment_id, experiment_id, start_time, end_time, status)
       VALUES (UUID(), ?, ?, ?, ?, ?, 'confirmed')`,
      [uid, equipment_id, room_id, start_time, end_time]
    );

    // Auto-create notification
    const [roomRows] = await pool.query<RowDataPacket[]>(
      'SELECT code, name_th FROM experiments WHERE experiment_id = ?', [room_id]
    );
    const room = (roomRows as RowDataPacket[])[0];
    if (room) {
      const label = `${start_time.slice(0, 10)} เวลา ${start_time.slice(11, 16)}`;
      await pool.query(
        `INSERT INTO notifications (notification_id, user_id, title, message, type)
         VALUES (UUID(), ?, ?, ?, 'success')`,
        [uid, `จองสำเร็จ — ${room.code}`, `${room.name_th} วันที่ ${label}`]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[bookings POST]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 });
  }
}
