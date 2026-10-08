import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getAdminUser } from '@/lib/admin';
import { cutAllCircuits } from '@/lib/rig';

const thaiDay = (t: Timestamp) =>
  t.toDate().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });

// PATCH /api/admin/bookings/[id]  { action: "cancel" | "end" }
//   cancel — a round that has not been entered yet is called off.
//   end    — the round running right now is closed and the rig's circuits cut.
// Either way its owner is told through a notification.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ ok: false, error: 'สำหรับผู้ดูแลระบบเท่านั้น' }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action: unknown = body && typeof body === 'object' ? (body as { action?: unknown }).action : undefined;
  if (action !== 'cancel' && action !== 'end')
    return NextResponse.json({ ok: false, error: 'คำสั่งไม่ถูกต้อง' }, { status: 400 });

  try {
    const ref = adminDb.collection('bookings').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: 'ไม่พบการจอง' }, { status: 404 });
    const booking = snap.data() as { user_id: string; lab_id: string; status: string; start_time: Timestamp; end_time: Timestamp };
    const lab = (await adminDb.collection('labs').doc(booking.lab_id).get()).data();
    const now = Date.now();

    if (action === 'cancel') {
      if (!['pending', 'confirmed'].includes(booking.status))
        return NextResponse.json({ ok: false, error: 'ยกเลิกได้เฉพาะรอบที่ยังไม่เริ่มใช้งาน' }, { status: 400 });
      await ref.update({ status: 'cancelled', cancelled_by: admin.uid });
      if (booking.user_id !== admin.uid) {
        await adminDb.collection('notifications').add({
          user_id: booking.user_id,
          title: `ผู้ดูแลระบบยกเลิกการจอง — ${lab?.code ?? booking.lab_id}`,
          message: `${lab?.name_th ?? ''} วันที่ ${thaiDay(booking.start_time)} ถูกยกเลิกโดยผู้ดูแลระบบ กรุณาจองรอบใหม่`,
          type: 'warning',
          is_read: false,
          created_at: FieldValue.serverTimestamp(),
        });
      }
      return NextResponse.json({ ok: true });
    }

    const running = ['pending', 'confirmed', 'in_progress'].includes(booking.status)
      && booking.start_time.toMillis() <= now && booking.end_time.toMillis() >= now;
    if (!running) return NextResponse.json({ ok: false, error: 'รอบนี้ไม่ได้กำลังดำเนินอยู่' }, { status: 400 });

    await ref.update({ status: 'completed', ended_by: admin.uid });
    const sessionRef = adminDb.collection('sessions').doc(id);
    const session = await sessionRef.get();
    if (session.exists && session.data()!.status === 'active') {
      const startedAt = (session.data()!.start_time as Timestamp).toMillis();
      await sessionRef.update({
        end_time: FieldValue.serverTimestamp(),
        duration_seconds: Math.floor((now - startedAt) / 1000),
        status: 'completed',
      });
    }
    // The student's page learns of this within a minute; the rig must not stay
    // live until then.
    const uncut = await cutAllCircuits();
    if (booking.user_id !== admin.uid) {
      await adminDb.collection('notifications').add({
        user_id: booking.user_id,
        title: `ผู้ดูแลระบบสิ้นสุดรอบทดลอง — ${lab?.code ?? booking.lab_id}`,
        message: `${lab?.name_th ?? ''} รอบของคุณถูกสิ้นสุดโดยผู้ดูแลระบบ`,
        type: 'warning',
        is_read: false,
        created_at: FieldValue.serverTimestamp(),
      });
    }
    return NextResponse.json({ ok: true, circuits_cut: uncut.length === 0 });
  } catch (err) {
    console.error('[admin/bookings PATCH]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 });
  }
}
