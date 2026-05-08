-- รันไฟล์นี้เพื่อเพิ่ม columns สำหรับระบบแจ้งเตือนถึงเวลาเข้าห้องแลป
ALTER TABLE notifications
  ADD COLUMN action_url VARCHAR(255) DEFAULT NULL AFTER type;

ALTER TABLE bookings
  ADD COLUMN notified_soon TINYINT(1) NOT NULL DEFAULT 0 AFTER notes;
