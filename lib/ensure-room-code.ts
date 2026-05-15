import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

let columnReady = false;

export async function ensureRoomCodeColumn() {
  if (columnReady) return;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'room_code'`
  );
  if ((rows as RowDataPacket[])[0].cnt === 0) {
    try {
      await pool.query(`
        ALTER TABLE bookings
          ADD COLUMN room_code CHAR(6) NULL AFTER status,
          ADD UNIQUE KEY idx_bookings_room_code (room_code)
      `);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('Duplicate') && !msg.includes('already exists')) throw e;
    }
  }
  columnReady = true;
}
