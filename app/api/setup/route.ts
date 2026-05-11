import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return (rows as RowDataPacket[])[0].cnt > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return (rows as RowDataPacket[])[0].cnt > 0;
}

export async function GET() {
  const results: string[] = [];

  try {
    // notifications table
    if (!(await tableExists('notifications'))) {
      await pool.query(`
        CREATE TABLE notifications (
          notification_id  CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
          user_id          CHAR(36)     NOT NULL,
          title            VARCHAR(255) NOT NULL,
          message          TEXT         NOT NULL,
          type             ENUM('info','success','warning','error') NOT NULL DEFAULT 'info',
          action_url       VARCHAR(255) DEFAULT NULL,
          is_read          TINYINT(1)   NOT NULL DEFAULT 0,
          created_at       DATETIME     NOT NULL DEFAULT NOW(),
          KEY idx_notif_user (user_id, created_at DESC),
          CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      results.push('✓ สร้างตาราง notifications');
    } else {
      if (!(await columnExists('notifications', 'action_url'))) {
        await pool.query('ALTER TABLE notifications ADD COLUMN action_url VARCHAR(255) DEFAULT NULL AFTER type');
        results.push('✓ เพิ่ม notifications.action_url');
      } else {
        results.push('— notifications.action_url มีอยู่แล้ว');
      }
    }

    // bookings.notified_soon + room_code
    if (await tableExists('bookings')) {
      if (!(await columnExists('bookings', 'notified_soon'))) {
        await pool.query('ALTER TABLE bookings ADD COLUMN notified_soon TINYINT(1) NOT NULL DEFAULT 0 AFTER notes');
        results.push('✓ เพิ่ม bookings.notified_soon');
      } else {
        results.push('— bookings.notified_soon มีอยู่แล้ว');
      }
      if (!(await columnExists('bookings', 'room_code'))) {
        await pool.query(`
          ALTER TABLE bookings
            ADD COLUMN room_code CHAR(6) NULL AFTER status,
            ADD UNIQUE KEY idx_bookings_room_code (room_code)
        `);
        results.push('✓ เพิ่ม bookings.room_code');
      } else {
        results.push('— bookings.room_code มีอยู่แล้ว');
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error('[setup]', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err), results }, { status: 500 });
  }
}
