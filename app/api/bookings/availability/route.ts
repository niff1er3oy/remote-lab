import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifySession } from '@/lib/session';
import { RowDataPacket } from 'mysql2';

const TIME_SLOTS = [
  '00:00', '02:00', '04:00', '06:00', '08:00', '10:00',
  '12:00', '14:00', '16:00', '18:00', '20:00', '22:00',
];

export type SlotStatus = 'free' | 'mine' | 'taken';

export async function GET() {
  try {
    let uid: string | null = null;
    try {
      const store = await cookies();
      const session = store.get('session');
      if (session) uid = (verifySession(session.value)?.uid as string) ?? null;
    } catch {}

    // Thai midnight as UTC timestamp — works regardless of server timezone
    const todayThaiStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const thaiMidnight = new Date(todayThaiStr + 'T00:00:00+07:00');
    const endDate = new Date(thaiMidnight.getTime() + 7 * 86400000);

    const [labs] = await pool.query<RowDataPacket[]>(
      'SELECT lab_id AS room_id, code, name_th, name_en FROM labs WHERE is_active = 1 ORDER BY code'
    );

    const [bookingRows] = await pool.query<RowDataPacket[]>(
      `SELECT booking_id, lab_id, user_id, start_time, end_time
       FROM bookings
       WHERE status IN ('pending','confirmed','in_progress')
         AND start_time < ? AND end_time > ?`,
      [endDate, thaiMidnight]
    );

    const THAI_MS = 7 * 3600 * 1000;
    const dates = Array.from({ length: 7 }, (_, i) => {
      const thaiDay = new Date(thaiMidnight.getTime() + i * 86400000 + THAI_MS);
      return `${thaiDay.getUTCDate()}/${thaiDay.getUTCMonth() + 1}/${String(thaiDay.getUTCFullYear()).slice(-2)}`;
    });

    const slotsByRoom: Record<string, SlotStatus[][]> = {};
    const mineBookingIds: Record<string, Record<string, string>> = {};

    for (const lab of labs as RowDataPacket[]) {
      const matrix: SlotStatus[][] = TIME_SLOTS.map(() => Array(7).fill('free') as SlotStatus[]);

      for (let day = 0; day < 7; day++) {
        for (let ti = 0; ti < TIME_SLOTS.length; ti++) {
          const hours = Number(TIME_SLOTS[ti].split(':')[0]);
          const slotStart = new Date(thaiMidnight.getTime() + day * 86400000 + hours * 3600000);
          const slotEnd   = new Date(slotStart.getTime() + 2 * 3600000);

          const booking = (bookingRows as RowDataPacket[]).find(
            b => b.lab_id === lab.room_id &&
                 new Date(b.start_time) < slotEnd &&
                 new Date(b.end_time)   > slotStart
          );

          if (booking) {
            const isMine = uid && booking.user_id === uid;
            matrix[ti][day] = isMine ? 'mine' : 'taken';
            if (isMine) {
              if (!mineBookingIds[lab.room_id as string]) mineBookingIds[lab.room_id as string] = {};
              mineBookingIds[lab.room_id as string][`${ti}-${day}`] = booking.booking_id as string;
            }
          }
        }
      }

      slotsByRoom[lab.room_id as string] = matrix;
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
