import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { ensureRoomCodeColumn } from '@/lib/ensure-room-code';
import { verifySession } from '@/lib/session';
import { RowDataPacket } from 'mysql2';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

async function generateRoomCode(): Promise<string> {
  await ensureRoomCodeColumn();
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++)
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT 1 FROM bookings WHERE room_code = ?', [code]
    );
    if (!(rows as RowDataPacket[]).length) return code;
  }
  throw new Error('room code collision');
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = store.get('session');
  if (!session) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });

  try {
    const payload = verifySession(session.value);
    if (!payload) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
    const { uid } = payload;
    const { room_id, start_time, end_time } = await req.json();

    if (!room_id || !start_time || !end_time)
      return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 });

    if (new Date(end_time.replace(' ', 'T') + 'Z') <= new Date())
      return NextResponse.json({ ok: false, error: 'ไม่สามารถจองเวลาที่สิ้นสุดไปแล้วได้' }, { status: 400 });

    // ตรวจว่าห้องนี้มีอยู่และเปิดใช้งาน
    const [labRows] = await pool.query<RowDataPacket[]>(
      'SELECT lab_id, code, name_th FROM labs WHERE lab_id = ? AND is_active = 1',
      [room_id]
    );
    if (!(labRows as RowDataPacket[]).length)
      return NextResponse.json({ ok: false, error: 'ไม่พบห้องทดลองนี้' }, { status: 404 });

    const lab = (labRows as RowDataPacket[])[0];

    const roomCode = await generateRoomCode();
    await pool.query(
      `INSERT INTO bookings (booking_id, user_id, lab_id, start_time, end_time, status, room_code)
       VALUES (UUID(), ?, ?, ?, ?, 'confirmed', ?)`,
      [uid, room_id, start_time, end_time, roomCode]
    );

    const dt = new Date(start_time.replace(' ', 'T') + 'Z');
    const thaiDate = dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
    const thaiTime = dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
    const label = `${thaiDate} เวลา ${thaiTime}`;
    await pool.query(
      `INSERT INTO notifications (notification_id, user_id, title, message, type, created_at)
       VALUES (UUID(), ?, ?, ?, 'success', UTC_TIMESTAMP())`,
      [uid, `จองสำเร็จ — ${lab.code}`, `${lab.name_th} วันที่ ${label}`]
    );

    return NextResponse.json({ ok: true, room_code: roomCode });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ห้องนี้ถูกจอง') || msg.includes('45000'))
      return NextResponse.json({ ok: false, error: 'ห้องนี้ถูกจองในช่วงเวลาดังกล่าวแล้ว' }, { status: 409 });
    console.error('[bookings POST]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 });
  }
}
