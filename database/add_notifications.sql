-- รันไฟล์นี้ถ้า import schema.sql ไปแล้วก่อนหน้า
CREATE TABLE IF NOT EXISTS notifications (
    notification_id  CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
    user_id          CHAR(36)     NOT NULL,
    title            VARCHAR(255) NOT NULL,
    message          TEXT         NOT NULL,
    type             ENUM('info','success','warning','error') NOT NULL DEFAULT 'info',
    is_read          TINYINT(1)   NOT NULL DEFAULT 0,
    created_at       DATETIME     NOT NULL DEFAULT NOW(),

    KEY idx_notif_user (user_id, created_at DESC),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
