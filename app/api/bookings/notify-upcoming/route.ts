import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
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

export async function POST() {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const now  = new Date();
    const soon = new Date(now.getTime() + 5 * 60 * 1000); // 5 นาที
    let notified = 0;

    // ── 1. เข้าได้แล้ว: อยู่ในช่วงเวลา, ยังไม่ได้เข้า lab (status ≠ in_progress) ──
    // แจ้งซ้ำได้ทุก 55 วินาที → ถี่ ~1 นาทีกับ polling 30 วินาที
    const [activeRows] = await pool.query<RowDataPacket[]>(
      `SELECT b.booking_id, b.start_time, b.end_time, ex.code, ex.name_th
       FROM bookings b
       JOIN equipment   e  ON e.equipment_id  = b.equipment_id
       JOIN experiments ex ON ex.experiment_id = e.experiment_id
       WHERE b.user_id = ?
         AND b.status IN ('confirmed', 'pending')
         AND b.start_time <= ?
         AND b.end_time   >= ?
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.user_id    = b.user_id
             AND n.created_at >= DATE_SUB(NOW(), INTERVAL 55 SECOND)
             AND n.title      LIKE 'เข้าห้องแลปได้แล้ว%'
         )`,
      [uid, now, now]
    );

    for (const b of activeRows as RowDataPacket[]) {
      const startStr = new Date(b.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      const endStr   = new Date(b.end_time).toLocaleTimeString('th-TH',   { hour: '2-digit', minute: '2-digit' });

      await pool.query(
        `INSERT INTO notifications (notification_id, user_id, title, message, type, action_url)
         VALUES (UUID(), ?, ?, ?, 'success', '/lab')`,
        [uid,
         `เข้าห้องแลปได้แล้ว — ${b.code}`,
         `${b.name_th}  ·  ${startStr} – ${endStr}  ·  กรุณาเข้าสู่ห้องปฏิบัติการ`]
      );
      notified++;
    }

    // ── 2. ใกล้ถึงเวลา: เริ่มใน 5 นาที, แจ้งเตือนครั้งเดียว (dedup 30 นาที) ──
    const [upcomingRows] = await pool.query<RowDataPacket[]>(
      `SELECT b.booking_id, b.start_time, ex.code, ex.name_th
       FROM bookings b
       JOIN equipment   e  ON e.equipment_id  = b.equipment_id
       JOIN experiments ex ON ex.experiment_id = e.experiment_id
       WHERE b.user_id = ?
         AND b.status IN ('confirmed', 'pending')
         AND b.start_time > ?
         AND b.start_time <= ?
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.user_id    = b.user_id
             AND n.created_at >= DATE_SUB(b.start_time, INTERVAL 30 MINUTE)
             AND n.created_at <  b.start_time
             AND n.title      LIKE 'ใกล้ถึงเวลา%'
         )`,
      [uid, now, soon]
    );

    for (const b of upcomingRows as RowDataPacket[]) {
      const diffMin  = Math.max(1, Math.round((new Date(b.start_time).getTime() - now.getTime()) / 60000));
      const startStr = new Date(b.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

      await pool.query(
        `INSERT INTO notifications (notification_id, user_id, title, message, type, action_url)
         VALUES (UUID(), ?, ?, ?, 'info', '/lab')`,
        [uid,
         `ใกล้ถึงเวลาแล้ว — ${b.code}`,
         `${b.name_th}  ·  เริ่มเวลา ${startStr}  (อีก ${diffMin} นาที)`]
      );
      notified++;
    }

    return NextResponse.json({ ok: true, notified });
  } catch (err) {
    console.error('[notify-upcoming]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
