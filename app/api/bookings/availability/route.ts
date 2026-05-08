import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
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
      if (session) uid = JSON.parse(Buffer.from(session.value, 'base64').toString()).uid;
    } catch {}

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 7);

    // Rooms = active experiments
    const [rooms] = await pool.query<RowDataPacket[]>(
      'SELECT experiment_id AS room_id, code, name_th, name_en FROM experiments WHERE is_active = 1 ORDER BY code'
    );

    // Equipment mapped to each room
    const [equipRows] = await pool.query<RowDataPacket[]>(
      "SELECT equipment_id, experiment_id FROM equipment WHERE status != 'offline'"
    );

    // All bookings in range, with experiment context via equipment
    const [bookingRows] = await pool.query<RowDataPacket[]>(
      `SELECT b.booking_id, b.equipment_id, b.user_id, b.start_time, b.end_time, e.experiment_id
       FROM bookings b
       JOIN equipment e ON e.equipment_id = b.equipment_id
       WHERE b.status IN ('pending','confirmed','in_progress')
         AND b.start_time < ? AND b.end_time > ?`,
      [endDate, today]
    );

    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
    });

    // Build slot matrix per room
    const slotsByRoom: Record<string, SlotStatus[][]> = {};
    // booking_id lookup for 'mine' slots: { room_id: { "ti-di": booking_id } }
    const mineBookingIds: Record<string, Record<string, string>> = {};

    for (const room of rooms as RowDataPacket[]) {
      const matrix: SlotStatus[][] = TIME_SLOTS.map(() => Array(7).fill('free') as SlotStatus[]);

      // Equipment IDs belonging to this room
      const roomEquipIds = new Set(
        (equipRows as RowDataPacket[])
          .filter(e => e.experiment_id === room.room_id)
          .map(e => e.equipment_id as string)
      );

      for (let day = 0; day < 7; day++) {
        const dayDate = new Date(today);
        dayDate.setDate(today.getDate() + day);

        for (let ti = 0; ti < TIME_SLOTS.length; ti++) {
          const hours = Number(TIME_SLOTS[ti].split(':')[0]);
          const slotStart = new Date(dayDate);
          slotStart.setHours(hours, 0, 0, 0);
          const slotEnd = new Date(dayDate);
          slotEnd.setHours(hours + 2, 0, 0, 0);

          // Find any booking in this room for this slot
          const booking = (bookingRows as RowDataPacket[]).find(
            b =>
              roomEquipIds.has(b.equipment_id as string) &&
              new Date(b.start_time) < slotEnd &&
              new Date(b.end_time) > slotStart
          );

          if (booking) {
            const isMine = uid && booking.user_id === uid;
            matrix[ti][day] = isMine ? 'mine' : 'taken';
            if (isMine) {
              if (!mineBookingIds[room.room_id as string]) mineBookingIds[room.room_id as string] = {};
              mineBookingIds[room.room_id as string][`${ti}-${day}`] = booking.booking_id as string;
            }
          }
        }
      }

      slotsByRoom[room.room_id as string] = matrix;
    }

    return NextResponse.json({ ok: true, rooms, slots_by_room: slotsByRoom, mine_booking_ids: mineBookingIds, dates, logged_in: !!uid });
  } catch (err) {
    console.error('[availability]', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
