import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getSessionUser } from '@/lib/session';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action: 'cancel' | 'start' | 'complete' = body.action ?? 'cancel';

  try {
    const bookingRef = adminDb.collection('bookings').doc(id);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) return NextResponse.json({ ok: false, error: 'ไม่พบการจอง' }, { status: 404 });
    const booking = bookingSnap.data()!;

    if (booking.user_id !== user.uid) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์' }, { status: 403 });

    const labSnap = await adminDb.collection('labs').doc(booking.lab_id).get();
    const lab = labSnap.data();

    // ── เริ่มใช้งาน → in_progress + สร้าง session ────────────────────────────
    if (action === 'start') {
      if (['confirmed', 'pending'].includes(booking.status))
        await bookingRef.update({ status: 'in_progress' });

      // Mirrors the old ON DUPLICATE KEY UPDATE no-op: only set start_time once.
      const sessionRef = adminDb.collection('sessions').doc(id);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) {
        await sessionRef.set({
          user_id: user.uid,
          lab_id: booking.lab_id,
          booking_id: id,
          start_time: FieldValue.serverTimestamp(),
          status: 'active',
        });
      }
      return NextResponse.json({ ok: true });
    }

    // ── เสร็จสิ้น → completed + ปิด session ─────────────────────────────────
    if (action === 'complete') {
      if (['in_progress', 'confirmed', 'pending'].includes(booking.status))
        await bookingRef.update({ status: 'completed' });

      const sessionRef = adminDb.collection('sessions').doc(id);
      const sessionSnap = await sessionRef.get();
      if (sessionSnap.exists && sessionSnap.data()!.status === 'active') {
        const startTime = sessionSnap.data()!.start_time as Timestamp;
        const durationSeconds = Math.floor((Date.now() - startTime.toMillis()) / 1000);
        await sessionRef.update({
          end_time: FieldValue.serverTimestamp(),
          duration_seconds: durationSeconds,
          status: 'completed',
        });
      }
      return NextResponse.json({ ok: true });
    }

    // ── ยกเลิก ────────────────────────────────────────────────────────────────
    if (!['pending', 'confirmed'].includes(booking.status))
      return NextResponse.json({ ok: false, error: 'ไม่สามารถยกเลิกการจองที่อยู่ในสถานะนี้ได้' }, { status: 400 });

    await bookingRef.update({ status: 'cancelled' });
    const startTime = (booking.start_time as Timestamp).toDate();
    const label = startTime.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
    await adminDb.collection('notifications').add({
      user_id: user.uid,
      title: `ยกเลิกการจองแล้ว — ${lab?.code}`,
      message: `${lab?.name_th} วันที่ ${label} ถูกยกเลิกเรียบร้อย`,
      type: 'warning',
      is_read: false,
      created_at: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[bookings PATCH]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 });
  }
}
