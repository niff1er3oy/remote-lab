import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getSessionUser } from '@/lib/session';

const TIME_SLOTS = [
  '00:00', '02:00', '04:00', '06:00', '08:00', '10:00',
  '12:00', '14:00', '16:00', '18:00', '20:00', '22:00',
];
const ACTIVE_STATUSES = ['pending', 'confirmed', 'in_progress'];

export type SlotStatus = 'free' | 'mine' | 'taken';

export async function GET() {
  try {
    const user = await getSessionUser();
    const uid = user?.uid ?? null;

    // Thai midnight as UTC timestamp — works regardless of server timezone
    const todayThaiStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const thaiMidnight = new Date(todayThaiStr + 'T00:00:00+07:00');
    const endDate = new Date(thaiMidnight.getTime() + 7 * 86400000);

    const labsSnap = await adminDb.collection('labs').where('is_active', '==', true).orderBy('code').get();
    const labs = labsSnap.docs.map(d => ({ room_id: d.id, ...d.data() }));

    const bookingsSnap = await adminDb.collection('bookings')
      .where('status', 'in', ACTIVE_STATUSES)
      .where('start_time', '<', Timestamp.fromDate(endDate))
      .get();
    const bookingRows = bookingsSnap.docs
      .map(d => ({ booking_id: d.id, ...d.data() as { lab_id: string; user_id: string; start_time: Timestamp; end_time: Timestamp } }))
      .filter(b => b.end_time.toMillis() > thaiMidnight.getTime());

    const THAI_MS = 7 * 3600 * 1000;
    const dates = Array.from({ length: 7 }, (_, i) => {
      const thaiDay = new Date(thaiMidnight.getTime() + i * 86400000 + THAI_MS);
      return `${thaiDay.getUTCDate()}/${thaiDay.getUTCMonth() + 1}/${String(thaiDay.getUTCFullYear()).slice(-2)}`;
    });

    const slotsByRoom: Record<string, SlotStatus[][]> = {};
    const mineBookingIds: Record<string, Record<string, string>> = {};

    for (const lab of labs) {
      const matrix: SlotStatus[][] = TIME_SLOTS.map(() => Array(7).fill('free') as SlotStatus[]);

      for (let day = 0; day < 7; day++) {
        for (let ti = 0; ti < TIME_SLOTS.length; ti++) {
          const hours = Number(TIME_SLOTS[ti].split(':')[0]);
          const slotStart = new Date(thaiMidnight.getTime() + day * 86400000 + hours * 3600000);
          const slotEnd   = new Date(slotStart.getTime() + 2 * 3600000);

          const booking = bookingRows.find(
            b => b.lab_id === lab.room_id &&
                 b.start_time.toDate() < slotEnd &&
                 b.end_time.toDate()   > slotStart
          );

          if (booking) {
            const isMine = uid && booking.user_id === uid;
            matrix[ti][day] = isMine ? 'mine' : 'taken';
            if (isMine) {
              if (!mineBookingIds[lab.room_id]) mineBookingIds[lab.room_id] = {};
              mineBookingIds[lab.room_id][`${ti}-${day}`] = booking.booking_id;
            }
          }
        }
      }

      slotsByRoom[lab.room_id] = matrix;
    }

    return NextResponse.json({
      ok: true,
      rooms: labs,
      slots_by_room: slotsByRoom,
      mine_booking_ids: mineBookingIds,
      dates,
      logged_in: !!uid,
    });
  } catch (err) {
    console.error('[availability]', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
