import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

async function getUid(): Promise<string | null> {
  try {
    const store = await cookies();
    const s = store.get('session');
    if (!s) return null;
    return JSON.parse(Buffer.from(s.value, 'base64').toString()).uid ?? null;
  } catch { return null; }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action: 'cancel' | 'start' = body.action ?? 'cancel';

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT user_id, status, experiment_id, start_time FROM bookings WHERE booking_id = ?', [id]
    );
    const booking = (rows as RowDataPacket[])[0];

    if (!booking) return NextResponse.json({ ok: false, error: 'ไม่พบการจอง' }, { status: 404 });
    if (booking.user_id !== uid) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์' }, { status: 403 });

    // ── เข้าห้อง lab: mark in_progress ────────────────────────────────────────
    if (action === 'start') {
      if (['confirmed', 'pending'].includes(booking.status as string)) {
        await pool.query("UPDATE bookings SET status = 'in_progress' WHERE booking_id = ?", [id]);
      }
      return NextResponse.json({ ok: true });
    }

    // ── ยกเลิก ────────────────────────────────────────────────────────────────
    if (!['pending', 'confirmed'].includes(booking.status as string))
      return NextResponse.json({ ok: false, error: 'ไม่สามารถยกเลิกการจองที่อยู่ในสถานะนี้ได้' }, { status: 400 });

    await pool.query("UPDATE bookings SET status = 'cancelled' WHERE booking_id = ?", [id]);

    // Auto-create notification
    const [roomRows] = await pool.query<RowDataPacket[]>(
      'SELECT code, name_th FROM experiments WHERE experiment_id = ?', [booking.experiment_id]
    );
    const room = (roomRows as RowDataPacket[])[0];
    const label = String(booking.start_time).slice(0, 10);
    await pool.query(
      `INSERT INTO notifications (notification_id, user_id, title, message, type)
       VALUES (UUID(), ?, ?, ?, 'warning')`,
      [uid,
       `ยกเลิกการจองแล้ว${room ? ` — ${room.code}` : ''}`,
       `${room?.name_th ?? 'การจอง'} วันที่ ${label} ถูกยกเลิกเรียบร้อย`]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[bookings PATCH]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 });
  }
}
