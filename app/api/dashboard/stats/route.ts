import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getSessionUser } from '@/lib/session';

const NOT_CANCELLED = ['pending', 'confirmed', 'in_progress', 'completed'];

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const upcomingSnap = await adminDb.collection('bookings')
      .where('user_id', '==', user.uid)
      .where('status', 'in', NOT_CANCELLED)
      .where('start_time', '>=', Timestamp.now())
      .orderBy('start_time', 'asc')
      .limit(5)
      .get();

    const upcoming = await Promise.all(upcomingSnap.docs.map(async d => {
      const b = d.data() as { lab_id: string; start_time: Timestamp; end_time: Timestamp; status: string };
      const lab = (await adminDb.collection('labs').doc(b.lab_id).get()).data();
      return {
        booking_id: d.id,
        equipment_name: `${lab?.code} — ${lab?.name_th}`,
        start_time: b.start_time.toDate().toISOString(),
        end_time: b.end_time.toDate().toISOString(),
        status: b.status,
      };
    }));

    const sessionCountSnap = await adminDb.collection('sessions').where('user_id', '==', user.uid).count().get();
    const activeLabsSnap = await adminDb.collection('labs').where('is_active', '==', true).count().get();

    return NextResponse.json({
      ok: true,
      upcoming_bookings: upcoming,
      session_count: sessionCountSnap.data().count,
      available_equipment: activeLabsSnap.data().count,
    });
  } catch (err) {
    console.error('[dashboard/stats]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
