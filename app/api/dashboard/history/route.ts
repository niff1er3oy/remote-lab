import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getSessionUser } from '@/lib/session';

const LIMIT = 10;
const OVERFETCH = 30; // raw bookings fetched per underlying query, before filtering to "history" rows
const MAX_ITERATIONS = 5;

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const cursorParam = req.nextUrl.searchParams.get('cursor');
  const cursorDate: Date | null = cursorParam ? new Date(cursorParam) : null;

  try {
    const items: Array<{
      booking_id: string; lab_code: string | undefined; lab_name: string | undefined;
      start_time: string; end_time: string; status: string;
      duration_seconds: number | null; session_id: string | null;
      /** Whether the visit's record was kept, so its summary can be opened. */
      has_record: boolean;
    }> = [];

    // Where the next raw batch picks up. A document rather than its start time:
    // two bookings can start at the same moment (a slot cancelled and booked
    // again), and resuming after a time would skip the second of them.
    let last: QueryDocumentSnapshot | null = null;
    let hasMoreRaw = true;
    let has_more = false;
    let iterations = 0;
    const now = Date.now();

    while (!has_more && hasMoreRaw && iterations < MAX_ITERATIONS) {
      iterations++;
      let q = adminDb.collection('bookings')
        .where('user_id', '==', user.uid)
        .orderBy('start_time', 'desc')
        .limit(OVERFETCH);
      if (last) q = q.startAfter(last);
      else if (cursorDate) q = q.startAfter(Timestamp.fromDate(cursorDate));

      const snap = await q.get();
      hasMoreRaw = snap.size === OVERFETCH;

      for (const doc of snap.docs) {
        last = doc;
        const b = doc.data() as { lab_id: string; start_time: Timestamp; end_time: Timestamp; status: string; has_record?: boolean };

        const isHistory = ['completed', 'cancelled'].includes(b.status) || b.end_time.toMillis() < now;
        if (!isHistory) continue;

        // The cursor handed back is a start time, and the next page begins
        // after it. So a page never ends between two rounds that share one: it
        // runs past LIMIT until the start time changes.
        const startTime = b.start_time.toDate().toISOString();
        if (items.length >= LIMIT && startTime !== items[items.length - 1].start_time) {
          has_more = true;
          break;
        }

        const [labSnap, sessionSnap] = await Promise.all([
          adminDb.collection('labs').doc(b.lab_id).get(),
          adminDb.collection('sessions').doc(doc.id).get(),
        ]);
        const lab = labSnap.data();

        let durationSeconds: number | null = null;
        if (sessionSnap.exists) {
          const s = sessionSnap.data()!;
          durationSeconds = s.duration_seconds ?? (
            s.start_time
              ? Math.floor((Math.min(b.end_time.toMillis(), now) - (s.start_time as Timestamp).toMillis()) / 1000)
              : null
          );
        }

        items.push({
          booking_id: doc.id,
          lab_code: lab?.code,
          lab_name: lab?.name_th,
          start_time: startTime,
          end_time: b.end_time.toDate().toISOString(),
          status: b.status,
          duration_seconds: durationSeconds,
          session_id: sessionSnap.exists ? doc.id : null,
          has_record: b.has_record === true,
        });
      }
    }

    const cursor = items.length ? items[items.length - 1].start_time : null;

    return NextResponse.json({ ok: true, items, has_more, cursor });
  } catch (err) {
    console.error('[dashboard/history]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
