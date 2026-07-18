import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getSessionUser } from '@/lib/session';

const ACTIVE_STATUSES = ['confirmed', 'pending', 'in_progress'];

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const now = Date.now();

    const activeSnap = await adminDb.collection('bookings')
      .where('user_id', '==', user.uid)
      .where('status', 'in', ACTIVE_STATUSES)
      .where('start_time', '<=', Timestamp.fromMillis(now))
      .get();
    const active = activeSnap.docs
      .map(d => ({ booking_id: d.id, ...d.data() as { lab_id: string; start_time: Timestamp; end_time: Timestamp; room_code: string | null } }))
      .find(b => b.end_time.toMillis() >= now);

    if (active) {
      const labSnap = await adminDb.collection('labs').doc(active.lab_id).get();
      const lab = labSnap.data();
      return NextResponse.json({
        ok: true,
        active: true,
        booking: {
          booking_id:      active.booking_id,
          experiment_code: lab?.code,
          experiment_name: lab?.name_th,
          start_time:      active.start_time.toDate().toISOString(),
          end_time:        active.end_time.toDate().toISOString(),
          room_code:       active.room_code ?? null,
        },
      });
    }

    const nextSnap = await adminDb.collection('bookings')
      .where('user_id', '==', user.uid)
      .where('status', 'in', ['confirmed', 'pending'])
      .where('start_time', '>', Timestamp.fromMillis(now))
      .orderBy('start_time', 'asc')
      .limit(1)
      .get();

    if (nextSnap.empty)
      return NextResponse.json({ ok: true, active: false, next_booking: null });

    const nextData = nextSnap.docs[0].data() as { lab_id: string; start_time: Timestamp };
    const labSnap = await adminDb.collection('labs').doc(nextData.lab_id).get();
    const lab = labSnap.data();

    return NextResponse.json({
      ok: true,
      active: false,
      next_booking: {
        start_time:      nextData.start_time.toDate().toISOString(),
        experiment_code: lab?.code,
        experiment_name: lab?.name_th,
      },
    });
  } catch (err) {
    console.error('[active-session]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
