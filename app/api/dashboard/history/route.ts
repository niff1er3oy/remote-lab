import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = store.get('session');
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const offset = Number(req.nextUrl.searchParams.get('offset') ?? 0);
  const limit  = 10;

  try {
    const { uid } = JSON.parse(Buffer.from(session.value, 'base64').toString());

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         b.booking_id,
         l.code    AS lab_code,
         l.name_th AS lab_name,
         b.start_time,
         b.end_time,
         b.status,
         -- ถ้า session ปิดแล้วใช้ duration_seconds, ถ้ายังเปิดอยู่คำนวณจากเวลาจริง (cap ที่ end_time)
         COALESCE(
           s.duration_seconds,
           CASE WHEN s.session_id IS NOT NULL
             THEN TIMESTAMPDIFF(SECOND, s.start_time, LEAST(b.end_time, UTC_TIMESTAMP()))
             ELSE NULL
           END
         ) AS duration_seconds,
         s.session_id
       FROM bookings b
       JOIN labs l ON l.lab_id = b.lab_id
       LEFT JOIN sessions s ON s.booking_id = b.booking_id
       WHERE b.user_id = ?
         AND (b.status IN ('completed','cancelled') OR b.end_time < ?)
       ORDER BY b.start_time DESC
       LIMIT ? OFFSET ?`,
      [uid, new Date(), limit + 1, offset]
    );

    const has_more = (rows as RowDataPacket[]).length > limit;
    const items    = (rows as RowDataPacket[]).slice(0, limit);

    return NextResponse.json({ ok: true, items, has_more });
  } catch (err) {
    console.error('[dashboard/history]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
