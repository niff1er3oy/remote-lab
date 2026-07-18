import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getSessionUser } from '@/lib/session';

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const now  = Date.now();
    const soon = now + 5 * 60 * 1000;
    let notified = 0;

    // ── 1. เข้าได้แล้ว: อยู่ในช่วงเวลา ──────────────────────────────────────
    const activeSnap = await adminDb.collection('bookings')
      .where('user_id', '==', user.uid)
      .where('status', 'in', ['confirmed', 'pending'])
      .where('start_time', '<=', Timestamp.fromMillis(now))
      .get();

    for (const doc of activeSnap.docs) {
      const b = doc.data() as {
        lab_id: string; start_time: Timestamp; end_time: Timestamp;
        notified_can_enter_at?: Timestamp;
      };
      if (b.end_time.toMillis() < now) continue;
      if (b.notified_can_enter_at && now - b.notified_can_enter_at.toMillis() < 55_000) continue;

      const lab = (await adminDb.collection('labs').doc(b.lab_id).get()).data();
      const startStr = b.start_time.toDate().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
      const endStr   = b.end_time.toDate().toLocaleTimeString('th-TH',   { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

      await Promise.all([
        adminDb.collection('notifications').add({
          user_id: user.uid,
          title: `เข้าห้องแลปได้แล้ว — ${lab?.code}`,
          message: `${lab?.name_th}  ·  ${startStr} – ${endStr}  ·  กรุณาเข้าสู่ห้องปฏิบัติการ`,
          type: 'success',
          action_url: '/lab',
          is_read: false,
          created_at: FieldValue.serverTimestamp(),
        }),
        doc.ref.update({ notified_can_enter_at: FieldValue.serverTimestamp() }),
      ]);
      notified++;
    }

    // ── 2. ใกล้ถึงเวลา: เริ่มใน 5 นาที ──────────────────────────────────────
    const upcomingSnap = await adminDb.collection('bookings')
      .where('user_id', '==', user.uid)
      .where('status', 'in', ['confirmed', 'pending'])
      .where('start_time', '>', Timestamp.fromMillis(now))
      .where('start_time', '<=', Timestamp.fromMillis(soon))
      .get();

    for (const doc of upcomingSnap.docs) {
      const b = doc.data() as { lab_id: string; start_time: Timestamp; notified_starting_soon_at?: Timestamp };
      if (b.notified_starting_soon_at) continue;

      const lab = (await adminDb.collection('labs').doc(b.lab_id).get()).data();
      const diffMin  = Math.max(1, Math.round((b.start_time.toMillis() - now) / 60000));
      const startStr = b.start_time.toDate().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

      await Promise.all([
        adminDb.collection('notifications').add({
          user_id: user.uid,
          title: `ใกล้ถึงเวลาแล้ว — ${lab?.code}`,
          message: `${lab?.name_th}  ·  เริ่มเวลา ${startStr}  (อีก ${diffMin} นาที)`,
          type: 'info',
          action_url: '/lab',
          is_read: false,
          created_at: FieldValue.serverTimestamp(),
        }),
        doc.ref.update({ notified_starting_soon_at: FieldValue.serverTimestamp() }),
      ]);
      notified++;
    }

    return NextResponse.json({ ok: true, notified });
  } catch (err) {
    console.error('[notify-upcoming]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
