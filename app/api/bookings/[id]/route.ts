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
  const action: 'cancel' | 'start' | 'complete' = body.action ?? 'cancel';

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT b.user_id, b.status, b.start_time, b.lab_id, l.code, l.name_th
       FROM bookings b
       JOIN labs l ON l.lab_id = b.lab_id
       WHERE b.booking_id = ?`,
      [id]
    );
    const booking = (rows as RowDataPacket[])[0];

    if (!booking) return NextResponse.json({ ok: false, error: 'ไม่พบการจอง' }, { status: 404 });
    if (booking.user_id !== uid) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์' }, { status: 403 });

    // ── เริ่มใช้งาน → in_progress + สร้าง session ────────────────────────────
    if (action === 'start') {
      if (['confirmed', 'pending'].includes(booking.status as string))
        await pool.query("UPDATE bookings SET status = 'in_progress' WHERE booking_id = ?", [id]);

      const sessionId = `${booking.code}-${id.slice(0, 8)}`;
      await pool.query(
        `INSERT INTO sessions (session_id, user_id, lab_id, booking_id, start_time, status)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), 'active')
         ON DUPLICATE KEY UPDATE session_id = session_id`,
        [sessionId, uid, booking.lab_id, id]
      );
      return NextResponse.json({ ok: true });
    }

    // ── เสร็จสิ้น → completed + ปิด session ─────────────────────────────────
    if (action === 'complete') {
      if (['in_progress', 'confirmed', 'pending'].includes(booking.status as string))
        await pool.query("UPDATE bookings SET status = 'completed' WHERE booking_id = ?", [id]);

      await pool.query(
        `UPDATE sessions
         SET end_time         = UTC_TIMESTAMP(),
             duration_seconds = TIMESTAMPDIFF(SECOND, start_time, UTC_TIMESTAMP()),
             status           = 'completed'
         WHERE booking_id = ? AND status = 'active'`,
        [id]
      );
      return NextResponse.json({ ok: true });
    }

    // ── ยกเลิก ────────────────────────────────────────────────────────────────
    if (!['pending', 'confirmed'].includes(booking.status as string))
      return NextResponse.json({ ok: false, error: 'ไม่สามารถยกเลิกการจองที่อยู่ในสถานะนี้ได้' }, { status: 400 });

    await pool.query("UPDATE bookings SET status = 'cancelled' WHERE booking_id = ?", [id]);
    const label = new Date(booking.start_time).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
    await pool.query(
      `INSERT INTO notifications (notification_id, user_id, title, message, type, created_at)
       VALUES (UUID(), ?, ?, ?, 'warning', UTC_TIMESTAMP())`,
      [uid, `ยกเลิกการจองแล้ว — ${booking.code}`, `${booking.name_th} วันที่ ${label} ถูกยกเลิกเรียบร้อย`]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[bookings PATCH]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 });
  }
}
