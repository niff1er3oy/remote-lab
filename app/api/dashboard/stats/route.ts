import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET() {
  const store = await cookies();
  const session = store.get('session');
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const { uid } = JSON.parse(Buffer.from(session.value, 'base64').toString());

    const [upcoming] = await pool.query<RowDataPacket[]>(
      `SELECT b.booking_id,
              CONCAT(ex.code, ' — ', ex.name_th) AS equipment_name,
              b.start_time, b.end_time, b.status
       FROM bookings b
       JOIN equipment   e  ON e.equipment_id  = b.equipment_id
       JOIN experiments ex ON ex.experiment_id = e.experiment_id
       WHERE b.user_id = ? AND b.start_time >= NOW() AND b.status != 'cancelled'
       ORDER BY b.start_time ASC LIMIT 5`,
      [uid]
    );

    const [[{ count: session_count }]] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?', [uid]
    ) as [RowDataPacket[], unknown];

    const [[{ count: available_equipment }]] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM equipment WHERE status = 'available'"
    ) as [RowDataPacket[], unknown];

    return NextResponse.json({ ok: true, upcoming_bookings: upcoming, session_count, available_equipment });
  } catch (err) {
    console.error('[dashboard/stats]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
