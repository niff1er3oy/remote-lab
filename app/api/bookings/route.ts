import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getSessionUser } from '@/lib/session';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACTIVE_STATUSES = ['pending', 'confirmed', 'in_progress'];

class OverlapError extends Error {}

function parseUtc(s: string): Date {
  return new Date(s.replace(' ', 'T') + 'Z');
}

async function generateRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++)
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    const snap = await adminDb.collection('bookings').where('room_code', '==', code).limit(1).get();
    if (snap.empty) return code;
  }
  throw new Error('room code collision');
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });

  try {
    const { room_id, start_time, end_time } = await req.json();
    if (!room_id || !start_time || !end_time)
      return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 });

    const startDate = parseUtc(start_time);
    const endDate = parseUtc(end_time);

    if (endDate <= new Date())
      return NextResponse.json({ ok: false, error: 'ไม่สามารถจองเวลาที่สิ้นสุดไปแล้วได้' }, { status: 400 });
    if (endDate <= startDate)
      return NextResponse.json({ ok: false, error: 'ช่วงเวลาที่จองไม่ถูกต้อง' }, { status: 400 });

    // ตรวจว่าห้องนี้มีอยู่และเปิดใช้งาน
    const labSnap = await adminDb.collection('labs').doc(room_id).get();
    if (!labSnap.exists || !labSnap.data()?.is_active)
      return NextResponse.json({ ok: false, error: 'ไม่พบห้องทดลองนี้' }, { status: 404 });
    const lab = labSnap.data()!;

    const roomCode = await generateRoomCode();
    const startTs = Timestamp.fromDate(startDate);
    const endTs = Timestamp.fromDate(endDate);

    let roomCodeResult: string;
    try {
      roomCodeResult = await adminDb.runTransaction(async (tx) => {
        const candidatesSnap = await tx.get(
          adminDb.collection('bookings')
            .where('lab_id', '==', room_id)
            .where('status', 'in', ACTIVE_STATUSES)
            .where('start_time', '<', endTs)
        );
        const overlaps = candidatesSnap.docs.some(
          d => (d.data().end_time as Timestamp).toMillis() > startTs.toMillis()
        );
        if (overlaps) throw new OverlapError();

        const ref = adminDb.collection('bookings').doc();
        tx.set(ref, {
          user_id: user.uid,
          lab_id: room_id,
          start_time: startTs,
          end_time: endTs,
          status: 'confirmed',
          room_code: roomCode,
          created_at: FieldValue.serverTimestamp(),
        });
        return roomCode;
      });
    } catch (err) {
      if (err instanceof OverlapError)
        return NextResponse.json({ ok: false, error: 'ห้องนี้ถูกจองในช่วงเวลาดังกล่าวแล้ว' }, { status: 409 });
      throw err;
    }

    const thaiDate = startDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
    const thaiTime = startDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
    const label = `${thaiDate} เวลา ${thaiTime}`;
    adminDb.collection('notifications').add({
      user_id: user.uid,
      title: `จองสำเร็จ — ${lab.code}`,
      message: `${lab.name_th} วันที่ ${label}`,
      type: 'success',
      is_read: false,
      created_at: FieldValue.serverTimestamp(),
    }).catch(err => console.error('[bookings notify]', err));

    return NextResponse.json({ ok: true, room_code: roomCodeResult });
  } catch (err: unknown) {
    console.error('[bookings POST]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 });
  }
}
