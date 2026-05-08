import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     Number(process.env.DB_PORT ?? 3306),
  user:     process.env.DB_USER     ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME     ?? 'remote_lab',
  waitForConnections: true,
  connectionLimit:    10,
  charset:  'utf8mb4',
  timezone: 'Z',
});

// Run once on startup — add missing columns safely
(async () => {
  try {
    const [r1] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'action_url'`
    ) as [{ cnt: number }[], unknown];
    if (!r1[0].cnt) {
      await pool.query('ALTER TABLE notifications ADD COLUMN action_url VARCHAR(255) DEFAULT NULL AFTER type');
      console.log('[db] Added notifications.action_url');
    }

    const [r2] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'notified_soon'`
    ) as [{ cnt: number }[], unknown];
    if (!r2[0].cnt) {
      await pool.query('ALTER TABLE bookings ADD COLUMN notified_soon TINYINT(1) NOT NULL DEFAULT 0 AFTER notes');
      console.log('[db] Added bookings.notified_soon');
    }
  } catch (err) {
    // DB not ready yet (e.g. build time) — ignore silently
    console.warn('[db] Migration skipped:', (err as Error).message);
  }
})();

export default pool;
