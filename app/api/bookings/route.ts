import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getSessionUser } from '@/lib/session';

const ACTIVE_STATUSES = ['pending', 'confirmed', 'in_progress'];

// How many rounds one user can hold at a time: those still ahead of them or
// running. An admin's blocked stretch is not a round and does not count.
export const MAX_ACTIVE_BOOKINGS = 5;

class OverlapError extends Error {}
class LimitError extends Error {}

// The calendar sends UTC as "YYYY-MM-DD HH:MM:SS". Null for anything else, so
// a time that is no date is refused here instead of failing further down.
function parseUtc(s: unknown): Date | null {
  if (typeof s !== 'string') return null;
  const date = new Date(s.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });

  try {
    const { room_id, start_time, end_time } = await req.json();
    if (typeof room_id !== 'string' || !room_id || !start_time || !end_time)
      return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 });

    const startDate = parseUtc(start_time);
    const endDate = parseUtc(end_time);
    if (!startDate || !endDate)
      return NextResponse.json({ ok: false, error: 'ช่วงเวลาที่จองไม่ถูกต้อง' }, { status: 400 });

    if (endDate <= new Date())
      return NextResponse.json({ ok: false, error: 'ไม่สามารถจองเวลาที่สิ้นสุดไปแล้วได้' }, { status: 400 });
    if (endDate <= startDate)
      return NextResponse.json({ ok: false, error: 'ช่วงเวลาที่จองไม่ถูกต้อง' }, { status: 400 });

    // ตรวจว่าห้องนี้มีอยู่และเปิดใช้งาน
    const labSnap = await adminDb.collection('labs').doc(room_id).get();
    if (!labSnap.exists || !labSnap.data()?.is_active)
      return NextResponse.json({ ok: false, error: 'ไม่พบห้องทดลองนี้' }, { status: 404 });
    const lab = labSnap.data()!;

    const startTs = Timestamp.fromDate(startDate);
    const endTs = Timestamp.fromDate(endDate);

    try {
      await adminDb.runTransaction(async (tx) => {
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

        // Counted inside the transaction, so that two requests sent together
        // cannot both find room for one more.
        const mineSnap = await tx.get(
          adminDb.collection('bookings')
            .where('user_id', '==', user.uid)
            .where('status', 'in', ACTIVE_STATUSES)
        );
        const now = Date.now();
        const held = mineSnap.docs.filter(d => {
          const booking = d.data();
          return booking.blocked !== true && (booking.end_time as Timestamp).toMillis() > now;
        });
        if (held.length >= MAX_ACTIVE_BOOKINGS) throw new LimitError();

        const ref = adminDb.collection('bookings').doc();
        tx.set(ref, {
          user_id: user.uid,
          lab_id: room_id,
          start_time: startTs,
          end_time: endTs,
          status: 'confirmed',
          created_at: FieldValue.serverTimestamp(),
        });
      });
    } catch (err) {
      if (err instanceof OverlapError)
        return NextResponse.json({ ok: false, error: 'ห้องนี้ถูกจองในช่วงเวลาดังกล่าวแล้ว' }, { status: 409 });
      if (err instanceof LimitError)
        return NextResponse.json({ ok: false, error: `จองได้ไม่เกิน ${MAX_ACTIVE_BOOKINGS} รอบพร้อมกัน ยกเลิกรอบที่ไม่ใช้ก่อนจึงจะจองเพิ่มได้` }, { status: 409 });
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

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[bookings POST]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 });
  }
}
