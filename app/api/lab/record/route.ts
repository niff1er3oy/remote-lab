import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getSessionUser } from '@/lib/session';
import { isAdmin } from '@/lib/admin';
import { cleanEvents } from '@/lib/lab-record';

// The record of a visit to the lab room, kept so its summary can be opened
// again from the dashboard.
//
// POST /api/lab/record  { booking_id, events }   the lab page saves the visit
// GET  /api/lab/record?booking=<id>              its owner (or an admin) reads it back

// A round's record can be saved from when it starts until this long after it
// ends: the page saves as the visit goes, on finishing, and when it is left.
// A round an admin ended is 'completed' with its end time unchanged, so the
// visit it cut short can still be saved.
const SAVE_GRACE_MS = 60 * 60 * 1000;

const bookingIdOf = (v: unknown) => (typeof v === 'string' && /^[\w-]{1,128}$/.test(v) ? v : null);

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });

  const body = await request.json().catch(() => null) as { booking_id?: unknown; events?: unknown } | null;
  const bookingId = bookingIdOf(body?.booking_id);
  const events = cleanEvents(body?.events);
  if (!bookingId || !events) return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });

  try {
    const bookingRef = adminDb.collection('bookings').doc(bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) return NextResponse.json({ ok: false, error: 'ไม่พบการจอง' }, { status: 404 });
    const booking = bookingSnap.data() as { user_id: string; lab_id: string; status: string; start_time: Timestamp; end_time: Timestamp };
    if (booking.user_id !== user.uid) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์' }, { status: 403 });

    const now = Date.now();
    if (booking.status === 'cancelled' || booking.start_time.toMillis() > now || booking.end_time.toMillis() + SAVE_GRACE_MS < now)
      return NextResponse.json({ ok: false, error: 'บันทึกได้เฉพาะรอบที่กำลังทดลองหรือเพิ่งจบ' }, { status: 403 });

    // A later save holds everything an earlier one did and more: the page
    // loads what is kept before a visit continues, and adds to it. One that
    // holds less (an old tab, a request arriving late) does not replace it.
    const recordRef = adminDb.collection('lab_records').doc(bookingId);
    const existing = await recordRef.get();
    const kept = existing.exists ? (existing.data()?.events as unknown[] | undefined)?.length ?? 0 : 0;
    if (kept > events.length) return NextResponse.json({ ok: true, events: kept });

    await recordRef.set({
      user_id: user.uid,
      booking_id: bookingId,
      lab_id: booking.lab_id,
      events,
      saved_at: FieldValue.serverTimestamp(),
    });
    // The history list reads this from the booking, without opening the record.
    await bookingRef.update({ has_record: true });
    return NextResponse.json({ ok: true, events: events.length });
  } catch (err) {
    console.error('[lab/record POST]', err);
    return NextResponse.json({ ok: false, error: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });

  const bookingId = bookingIdOf(req.nextUrl.searchParams.get('booking'));
  if (!bookingId) return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });

  try {
    const snap = await adminDb.collection('lab_records').doc(bookingId).get();
    // Someone else's record answers like one that does not exist.
    const record = snap.exists ? snap.data() as { user_id: string; lab_id: string; events: unknown } : null;
    if (!record || (record.user_id !== user.uid && !isAdmin(user)))
      return NextResponse.json({ ok: false, error: 'ไม่พบบันทึกของรอบนี้' }, { status: 404 });

    const labSnap = await adminDb.collection('labs').doc(record.lab_id).get();
    return NextResponse.json({
      ok: true,
      booking_id: bookingId,
      experiment_name: labSnap.data()?.name_th ?? '',
      events: cleanEvents(record.events) ?? [],
    });
  } catch (err) {
    console.error('[lab/record GET]', err);
    return NextResponse.json({ ok: false, error: 'เปิดบันทึกไม่ได้ ลองใหม่อีกครั้ง' }, { status: 500 });
  }
}
