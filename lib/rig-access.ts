import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

// Who may act on the rig right now. A booking gives its owner the rig from
// start_time to end_time; this is the server-side check behind every hardware
// command. The lab page's own gate (api/bookings/active-session) applies the
// same rule to decide what to show.

const LIVE_STATUSES = ['confirmed', 'pending', 'in_progress'];
// Slots are two hours long; a booking that started longer ago than this cannot
// still matter. It bounds the query to the user's last few bookings.
const LOOKBACK_MS = 6 * 60 * 60 * 1000;

/**
 * 'active'     — the user's booking is running right now.
 * 'just-ended' — it ended within `graceMs`, or was marked completed before its
 *                slot ran out. Enough to switch the rig off, not to switch it on.
 * 'none'       — neither.
 */
export type RigAccess = 'active' | 'just-ended' | 'none';

export async function rigAccess(uid: string, graceMs: number): Promise<RigAccess> {
  const now = Date.now();
  const snap = await adminDb.collection('bookings')
    .where('user_id', '==', uid)
    .where('status', 'in', [...LIVE_STATUSES, 'completed'])
    .where('start_time', '<=', Timestamp.fromMillis(now))
    .where('start_time', '>=', Timestamp.fromMillis(now - LOOKBACK_MS))
    .get();

  let access: RigAccess = 'none';
  for (const doc of snap.docs) {
    const b = doc.data() as { status: string; end_time: Timestamp };
    const end = b.end_time.toMillis();
    if (LIVE_STATUSES.includes(b.status) && end >= now) return 'active';
    if (end + graceMs >= now) access = 'just-ended';
  }
  return access;
}
