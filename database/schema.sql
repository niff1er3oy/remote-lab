-- ============================================================
--  Remote Lab — Database Schema (MySQL 8.0+)
--  ห้องปฏิบัติการฟิสิกส์ระยะไกล
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ============================================================
--  1. USERS
-- ============================================================

CREATE TABLE users (
    user_id        CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
    email          VARCHAR(255) NOT NULL UNIQUE,
    name           VARCHAR(255) NOT NULL,
    password_hash  TEXT,
    role           ENUM('student','researcher','instructor','other') NOT NULL DEFAULT 'student',
    email_verified TINYINT(1)   NOT NULL DEFAULT 0,
    remember_token TEXT,
    created_at     DATETIME     NOT NULL DEFAULT NOW(),
    updated_at     DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  2. SOCIAL AUTH PROVIDERS  (Google, Microsoft)
-- ============================================================

CREATE TABLE user_social_accounts (
    id             CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
    user_id        CHAR(36)     NOT NULL,
    provider       VARCHAR(50)  NOT NULL,
    provider_uid   VARCHAR(255) NOT NULL,
    access_token   TEXT,
    refresh_token  TEXT,
    created_at     DATETIME     NOT NULL DEFAULT NOW(),

    UNIQUE KEY uq_provider_uid (provider, provider_uid),
    CONSTRAINT fk_social_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  3. EXPERIMENTS  (lab protocols)
-- ============================================================

CREATE TABLE experiments (
    experiment_id    CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
    code             VARCHAR(20)  NOT NULL UNIQUE,
    name_th          VARCHAR(255) NOT NULL,
    name_en          VARCHAR(255),
    description_th   TEXT,
    procedure_json   JSON,
    expected_outcomes TEXT,
    duration_minutes INT          NOT NULL DEFAULT 120,
    is_active        TINYINT(1)   NOT NULL DEFAULT 1,
    created_at       DATETIME     NOT NULL DEFAULT NOW(),
    updated_at       DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  4. EQUIPMENT
-- ============================================================

CREATE TABLE equipment (
    equipment_id   CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
    experiment_id  CHAR(36),
    name_th        VARCHAR(255) NOT NULL,
    name_en        VARCHAR(255),
    equipment_type ENUM('coil','solenoid','sensor','other') NOT NULL,
    description    TEXT,
    specifications JSON         NOT NULL DEFAULT ('{}'),
    max_current_a  DECIMAL(6,3),
    status         ENUM('available','in_use','maintenance','offline') NOT NULL DEFAULT 'available',
    location       VARCHAR(255),
    created_at     DATETIME     NOT NULL DEFAULT NOW(),
    updated_at     DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),

    KEY idx_equipment_status     (status),
    KEY idx_equipment_experiment (experiment_id),
    CONSTRAINT fk_equip_experiment FOREIGN KEY (experiment_id) REFERENCES experiments (experiment_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  5. EXPERIMENT ↔ EQUIPMENT  (many-to-many)
-- ============================================================

CREATE TABLE experiment_equipment (
    experiment_id CHAR(36)   NOT NULL,
    equipment_id  CHAR(36)   NOT NULL,
    is_required   TINYINT(1) NOT NULL DEFAULT 1,

    PRIMARY KEY (experiment_id, equipment_id),
    CONSTRAINT fk_ee_experiment FOREIGN KEY (experiment_id) REFERENCES experiments (experiment_id) ON DELETE CASCADE,
    CONSTRAINT fk_ee_equipment  FOREIGN KEY (equipment_id)  REFERENCES equipment   (equipment_id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  6. BOOKINGS
-- ============================================================

CREATE TABLE bookings (
    booking_id    CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
    user_id       CHAR(36)     NOT NULL,
    equipment_id  CHAR(36)     NOT NULL,
    experiment_id CHAR(36),
    start_time    DATETIME     NOT NULL,
    end_time      DATETIME     NOT NULL,
    status        ENUM('pending','confirmed','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
    notes           TEXT,
    notified_soon   TINYINT(1)   NOT NULL DEFAULT 0,
    created_at      DATETIME     NOT NULL DEFAULT NOW(),
    updated_at      DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),

    CONSTRAINT chk_booking_times CHECK (end_time > start_time),
    KEY idx_bookings_user      (user_id),
    KEY idx_bookings_equipment (equipment_id),
    KEY idx_bookings_time      (start_time, end_time),
    CONSTRAINT fk_booking_user       FOREIGN KEY (user_id)       REFERENCES users       (user_id)       ON DELETE CASCADE,
    CONSTRAINT fk_booking_equipment  FOREIGN KEY (equipment_id)  REFERENCES equipment   (equipment_id)  ON DELETE RESTRICT,
    CONSTRAINT fk_booking_experiment FOREIGN KEY (experiment_id) REFERENCES experiments (experiment_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trigger: ป้องกัน double-booking (แทน EXCLUDE USING GIST ของ PostgreSQL)
DELIMITER $$
CREATE TRIGGER trg_bookings_no_overlap
BEFORE INSERT ON bookings
FOR EACH ROW
BEGIN
    DECLARE overlap_count INT;
    SELECT COUNT(*) INTO overlap_count
    FROM bookings
    WHERE equipment_id = NEW.equipment_id
      AND status NOT IN ('cancelled')
      AND NEW.start_time < end_time
      AND NEW.end_time   > start_time;

    IF overlap_count > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'อุปกรณ์นี้ถูกจองในช่วงเวลาดังกล่าวแล้ว';
    END IF;
END$$
DELIMITER ;

-- ============================================================
--  7. SESSIONS  (active experiment sessions)
-- ============================================================

CREATE TABLE sessions (
    session_id       VARCHAR(30)  NOT NULL PRIMARY KEY,
    user_id          CHAR(36)     NOT NULL,
    equipment_id     CHAR(36)     NOT NULL,
    experiment_id    CHAR(36),
    booking_id       CHAR(36)     UNIQUE,
    start_time       DATETIME     NOT NULL DEFAULT NOW(),
    end_time         DATETIME,
    duration_seconds INT,
    status           ENUM('active','paused','stopped','completed') NOT NULL DEFAULT 'active',
    created_at       DATETIME     NOT NULL DEFAULT NOW(),
    updated_at       DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),

    KEY idx_sessions_user      (user_id),
    KEY idx_sessions_equipment (equipment_id),
    KEY idx_sessions_status    (status),
    CONSTRAINT fk_session_user       FOREIGN KEY (user_id)      REFERENCES users     (user_id)      ON DELETE CASCADE,
    CONSTRAINT fk_session_equipment  FOREIGN KEY (equipment_id) REFERENCES equipment (equipment_id) ON DELETE RESTRICT,
    CONSTRAINT fk_session_experiment FOREIGN KEY (experiment_id) REFERENCES experiments (experiment_id) ON DELETE SET NULL,
    CONSTRAINT fk_session_booking    FOREIGN KEY (booking_id)   REFERENCES bookings  (booking_id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  8. MEASUREMENTS  (time-series sensor data)
-- ============================================================

CREATE TABLE measurements (
    measurement_id      BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id          VARCHAR(30)  NOT NULL,
    equipment_id        CHAR(36)     NOT NULL,
    measured_at         DATETIME(3)  NOT NULL DEFAULT NOW(3),
    current_nominal_a   DECIMAL(8,4),
    current_measured_a  DECIMAL(8,4),
    b_theory_mt         DECIMAL(10,6),
    b_measured_mt       DECIMAL(10,6),
    delta_b_mt          DECIMAL(10,6),
    delta_b_percent     DECIMAL(8,4),
    position_z_m        DECIMAL(8,5),
    raw_data            JSON         NOT NULL DEFAULT ('{}'),

    KEY idx_meas_session_time (session_id, measured_at DESC),
    KEY idx_meas_equipment    (equipment_id),
    CONSTRAINT fk_meas_session    FOREIGN KEY (session_id)   REFERENCES sessions  (session_id)   ON DELETE CASCADE,
    CONSTRAINT fk_meas_equipment  FOREIGN KEY (equipment_id) REFERENCES equipment (equipment_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  9. CHAT MESSAGES  (AI teaching assistant)
-- ============================================================

CREATE TABLE chat_messages (
    message_id   BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id   VARCHAR(30) NOT NULL,
    user_id      CHAR(36),
    role         ENUM('user','assistant') NOT NULL,
    content      TEXT        NOT NULL,
    context_json JSON        NOT NULL DEFAULT ('{}'),
    created_at   DATETIME    NOT NULL DEFAULT NOW(),

    KEY idx_chat_session (session_id, created_at),
    CONSTRAINT fk_chat_session FOREIGN KEY (session_id) REFERENCES sessions (session_id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_user    FOREIGN KEY (user_id)    REFERENCES users    (user_id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  10. SESSION LOGS  (event log / audit trail)
-- ============================================================

CREATE TABLE session_logs (
    log_id       BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id   VARCHAR(30) NOT NULL,
    logged_at    DATETIME(3) NOT NULL DEFAULT NOW(3),
    log_type     ENUM('info','warn','data','cmd','error') NOT NULL DEFAULT 'info',
    message      TEXT        NOT NULL,
    context_data JSON        NOT NULL DEFAULT ('{}'),

    KEY idx_logs_session (session_id, logged_at DESC),
    CONSTRAINT fk_log_session FOREIGN KEY (session_id) REFERENCES sessions (session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  11. NOTIFICATIONS
-- ============================================================

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  12. ROLE PERMISSIONS  (booking limits per role)
-- ============================================================

CREATE TABLE role_permissions (
    role                     ENUM('student','researcher','instructor','other') NOT NULL PRIMARY KEY,
    max_days_ahead           INT        NOT NULL DEFAULT 7,
    max_slots_per_day        INT        NOT NULL DEFAULT 2,
    can_access_all_equipment TINYINT(1) NOT NULL DEFAULT 0,
    notes                    TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO role_permissions (role, max_days_ahead, max_slots_per_day, can_access_all_equipment, notes) VALUES
    ('student',    7,  1, 0, 'นักศึกษาสามารถจองล่วงหน้าได้ 7 วัน ไม่เกิน 1 slot/วัน'),
    ('researcher', 30, 4, 1, 'นักวิจัยสามารถจองล่วงหน้าได้ 30 วัน'),
    ('instructor', 30, 8, 1, 'อาจารย์มีสิทธิ์เต็ม'),
    ('other',      7,  1, 0, 'ผู้ใช้ทั่วไป');

-- ============================================================
--  12. SEED DATA — Experiments & Equipment
-- ============================================================

INSERT INTO experiments (experiment_id, code, name_th, name_en, description_th, duration_minutes) VALUES
    (UUID(), 'LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก', 'Biot-Savart Law & Magnetic Fields',
     'ศึกษาสนามแม่เหล็กที่เกิดจากลวดตัวนำรูปทรงต่างๆ และตรวจสอบความถูกต้องของกฎ Biot-Savart', 120);

-- ห้อง LAB8 มีอุปกรณ์ 4 ชิ้น (ทั้งหมดอยู่ในห้องเดียวกัน ผู้ใช้จองห้อง ไม่ได้จองอุปกรณ์เดี่ยว)
INSERT INTO equipment (equipment_id, experiment_id, name_th, name_en, equipment_type, specifications, max_current_a)
SELECT UUID(), ex.experiment_id, t.name_th, t.name_en, t.equipment_type, CAST(t.specs AS JSON), t.max_a
FROM experiments ex,
(SELECT 'ขดลวดวงกลม 2 รอบ'  AS name_th, 'Single Coil 2 turns'  AS name_en, 'coil'     AS equipment_type, '{"turns":2,  "radius_m":0.05}'                  AS specs, 2.0 AS max_a UNION ALL
 SELECT 'ขดลวดวงกลม 3 รอบ',             'Single Coil 3 turns',             'coil',                        '{"turns":3,  "radius_m":0.05}',                              2.0 UNION ALL
 SELECT 'โซลีนอยด์ 75 รอบ',             'Solenoid 75 turns',               'solenoid',                    '{"turns":75, "radius_m":0.02,"length_m":0.10}',              2.0 UNION ALL
 SELECT 'โซลีนอยด์ 150 รอบ',            'Solenoid 150 turns',              'solenoid',                    '{"turns":150,"radius_m":0.02,"length_m":0.20}',              2.0
) AS t
WHERE ex.code = 'LAB8';

-- ============================================================
--  VIEWS
-- ============================================================

-- ดูสถานะอุปกรณ์พร้อมว่าถูกจองอยู่หรือไม่ในขณะนี้
CREATE VIEW equipment_live_status AS
SELECT
    e.equipment_id,
    e.name_th,
    e.name_en,
    e.equipment_type,
    e.status,
    CASE WHEN b.booking_id IS NOT NULL THEN 1 ELSE 0 END AS is_booked_now,
    b.user_id          AS current_user_id,
    b.start_time       AS current_booking_start,
    b.end_time         AS current_booking_end
FROM equipment e
LEFT JOIN bookings b
    ON  b.equipment_id = e.equipment_id
    AND b.status IN ('confirmed','in_progress')
    AND NOW() BETWEEN b.start_time AND b.end_time;

-- สรุปผลการทดลองต่อ session
CREATE VIEW session_summary AS
SELECT
    s.session_id,
    s.user_id,
    u.name                           AS user_name,
    e.name_th                        AS equipment_name,
    ex.code                          AS experiment_code,
    s.start_time,
    s.end_time,
    s.status,
    COUNT(m.measurement_id)          AS total_measurements,
    AVG(ABS(m.delta_b_percent))      AS avg_error_percent,
    MIN(m.measured_at)               AS first_measurement,
    MAX(m.measured_at)               AS last_measurement
FROM sessions s
JOIN users       u  ON u.user_id      = s.user_id
JOIN equipment   e  ON e.equipment_id = s.equipment_id
LEFT JOIN experiments ex ON ex.experiment_id = s.experiment_id
LEFT JOIN measurements m ON m.session_id     = s.session_id
GROUP BY s.session_id, u.name, e.name_th, ex.code, s.start_time, s.end_time, s.status;

SET FOREIGN_KEY_CHECKS = 1;
