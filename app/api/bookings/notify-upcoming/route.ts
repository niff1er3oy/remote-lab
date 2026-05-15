import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifySession } from '@/lib/session';
import { RowDataPacket } from 'mysql2';

async function getUid(): Promise<string | null> {
  try {
    const store = await cookies();
    const s = store.get('session');
    if (!s) return null;
    return (verifySession(s.value)?.uid as string) ?? null;
  } catch { return null; }
}

export async function POST() {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const now  = new Date();
    const soon = new Date(now.getTime() + 5 * 60 * 1000);
    let notified = 0;

    // ── 1. เข้าได้แล้ว: อยู่ในช่วงเวลา ──────────────────────────────────────
    const [activeRows] = await pool.query<RowDataPacket[]>(
      `SELECT b.booking_id, b.start_time, b.end_time, l.code, l.name_th
       FROM bookings b
       JOIN labs l ON l.lab_id = b.lab_id
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
      const startStr = new Date(b.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
      const endStr   = new Date(b.end_time).toLocaleTimeString('th-TH',   { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

      await pool.query(
        `INSERT INTO notifications (notification_id, user_id, title, message, type, action_url, created_at)
         VALUES (UUID(), ?, ?, ?, 'success', '/lab', UTC_TIMESTAMP())`,
        [uid,
         `เข้าห้องแลปได้แล้ว — ${b.code}`,
         `${b.name_th}  ·  ${startStr} – ${endStr}  ·  กรุณาเข้าสู่ห้องปฏิบัติการ`]
      );
      notified++;
    }

    // ── 2. ใกล้ถึงเวลา: เริ่มใน 5 นาที ──────────────────────────────────────
    const [upcomingRows] = await pool.query<RowDataPacket[]>(
      `SELECT b.booking_id, b.start_time, l.code, l.name_th
       FROM bookings b
       JOIN labs l ON l.lab_id = b.lab_id
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
      const startStr = new Date(b.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

      await pool.query(
        `INSERT INTO notifications (notification_id, user_id, title, message, type, action_url, created_at)
         VALUES (UUID(), ?, ?, ?, 'info', '/lab', UTC_TIMESTAMP())`,
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
