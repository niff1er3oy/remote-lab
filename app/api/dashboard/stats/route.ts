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
              CONCAT(l.code, ' — ', l.name_th) AS equipment_name,
              b.start_time, b.end_time, b.status
       FROM bookings b
       JOIN labs l ON l.lab_id = b.lab_id
       WHERE b.user_id = ?
         AND b.start_time >= ?
         AND b.status != 'cancelled'
       ORDER BY b.start_time ASC LIMIT 5`,
      [uid, new Date()]
    );

    const [[{ count: session_count }]] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?', [uid]
    ) as [RowDataPacket[], unknown];

    const [[{ count: active_labs }]] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS count FROM labs WHERE is_active = 1'
    ) as [RowDataPacket[], unknown];

    return NextResponse.json({
      ok: true,
      upcoming_bookings: upcoming,
      session_count,
      available_equipment: active_labs,
    });
  } catch (err) {
    console.error('[dashboard/stats]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
