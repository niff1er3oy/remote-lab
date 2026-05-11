-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: db:3306
-- Generation Time: May 11, 2026 at 01:58 PM
-- Server version: 8.0.43
-- PHP Version: 8.2.27

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `schema`
--

-- --------------------------------------------------------

--
-- Table structure for table `bookings`
--

CREATE TABLE `bookings` (
  `booking_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lab_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_time` datetime NOT NULL,
  `end_time` datetime NOT NULL,
  `status` enum('pending','confirmed','in_progress','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `room_code` char(6) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `notified_soon` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ;

--
-- Dumping data for table `bookings`
--

INSERT INTO `bookings` (`booking_id`, `user_id`, `lab_id`, `start_time`, `end_time`, `status`, `room_code`, `notes`, `notified_soon`, `created_at`, `updated_at`) VALUES
('000f1f9c-4b93-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-13 01:00:00', '2026-05-13 03:00:00', 'confirmed', NULL, NULL, 0, '2026-05-09 10:36:55', '2026-05-09 10:36:55'),
('02002525-4bab-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 13:00:00', '2026-05-09 15:00:00', 'completed', NULL, NULL, 0, '2026-05-09 13:28:47', '2026-05-09 13:29:07'),
('3187c47a-4b9f-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 11:00:00', '2026-05-09 13:00:00', 'completed', NULL, NULL, 0, '2026-05-09 12:04:12', '2026-05-09 12:08:58'),
('3c72eeb4-4ba1-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 11:00:00', '2026-05-09 13:00:00', 'completed', NULL, NULL, 0, '2026-05-09 12:18:50', '2026-05-09 12:35:28'),
('45c944db-4bc9-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 17:00:00', '2026-05-09 19:00:00', 'completed', NULL, NULL, 0, '2026-05-09 17:05:25', '2026-05-09 17:45:41'),
('56b0286c-4ba4-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 11:00:00', '2026-05-09 13:00:00', 'in_progress', NULL, NULL, 0, '2026-05-09 12:41:02', '2026-05-09 12:41:07'),
('570cc035-4b98-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 11:00:00', '2026-05-09 13:00:00', 'completed', NULL, NULL, 0, '2026-05-09 11:15:09', '2026-05-09 11:15:36'),
('6e6ab34f-4d13-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-11 07:00:00', '2026-05-11 09:00:00', 'completed', NULL, NULL, 0, '2026-05-11 08:28:47', '2026-05-11 08:29:16'),
('71bbdd85-4ba0-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 11:00:00', '2026-05-09 13:00:00', 'completed', NULL, NULL, 0, '2026-05-09 12:13:10', '2026-05-09 12:16:47'),
('7d5a31ec-4bd1-11f1-bc62-1ebe3fd493b5', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 21:00:00', '2026-05-09 23:00:00', 'confirmed', NULL, NULL, 0, '2026-05-09 18:04:14', '2026-05-09 18:04:14'),
('85001a3b-4bd1-11f1-bc62-1ebe3fd493b5', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 23:00:00', '2026-05-10 01:00:00', 'confirmed', NULL, NULL, 0, '2026-05-09 18:04:27', '2026-05-09 18:04:27'),
('85b025dc-4b90-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 09:00:00', '2026-05-09 11:00:00', 'completed', NULL, NULL, 0, '2026-05-09 10:19:11', '2026-05-09 11:20:13'),
('962cae92-4d13-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-11 07:00:00', '2026-05-11 09:00:00', 'completed', NULL, NULL, 0, '2026-05-11 08:29:54', '2026-05-11 08:41:11'),
('a8e23928-4d1a-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-11 09:00:00', '2026-05-11 11:00:00', 'in_progress', '8PWZNF', NULL, 0, '2026-05-11 09:20:32', '2026-05-11 09:20:33'),
('c2d4dc48-4b9b-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 11:00:00', '2026-05-09 13:00:00', 'completed', NULL, NULL, 0, '2026-05-09 11:39:38', '2026-05-09 12:04:00'),
('c935b9d1-4bd0-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 17:00:00', '2026-05-09 19:00:00', 'completed', NULL, NULL, 0, '2026-05-09 17:59:12', '2026-05-09 18:00:18'),
('d2d2be05-4baa-11f1-bc62-1ebe3fd493b5', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 13:00:00', '2026-05-09 15:00:00', 'completed', NULL, NULL, 0, '2026-05-09 13:27:27', '2026-05-09 13:28:16'),
('e2df0201-4b9f-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 11:00:00', '2026-05-09 13:00:00', 'completed', NULL, NULL, 0, '2026-05-09 12:09:10', '2026-05-09 12:12:59'),
('e5afbc62-4ba9-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 13:00:00', '2026-05-09 15:00:00', 'completed', NULL, NULL, 0, '2026-05-09 13:20:50', '2026-05-09 13:21:13'),
('e62b656c-4d17-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-11 09:00:00', '2026-05-11 11:00:00', 'completed', 'HT5W7B', NULL, 0, '2026-05-11 09:00:46', '2026-05-11 09:20:27'),
('e84cd3f2-4bab-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 13:00:00', '2026-05-09 15:00:00', 'completed', NULL, NULL, 0, '2026-05-09 13:35:13', '2026-05-09 13:59:39'),
('eb3c43b9-4bce-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 17:00:00', '2026-05-09 19:00:00', 'completed', NULL, NULL, 0, '2026-05-09 17:45:50', '2026-05-09 17:59:06'),
('efae2fe8-4b92-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-10 03:00:00', '2026-05-10 05:00:00', 'confirmed', NULL, NULL, 0, '2026-05-09 10:36:28', '2026-05-09 10:36:28'),
('f6a39801-4d15-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-11 07:00:00', '2026-05-11 09:00:00', 'completed', 'VYDFJB', NULL, 0, '2026-05-11 08:46:55', '2026-05-11 08:59:59'),
('f9156806-4bd0-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 17:00:00', '2026-05-09 19:00:00', 'in_progress', NULL, NULL, 0, '2026-05-09 18:00:32', '2026-05-09 18:06:05'),
('f9adccd0-4baa-11f1-bc62-1ebe3fd493b5', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 13:00:00', '2026-05-09 15:00:00', 'cancelled', NULL, NULL, 0, '2026-05-09 13:28:33', '2026-05-09 13:28:44'),
('fcf0c5df-4bd0-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '2026-05-09 19:00:00', '2026-05-09 21:00:00', 'confirmed', NULL, NULL, 0, '2026-05-09 18:00:39', '2026-05-09 18:00:39');

--
-- Triggers `bookings`
--
DELIMITER $$
CREATE TRIGGER `trg_bookings_no_overlap` BEFORE INSERT ON `bookings` FOR EACH ROW IF (SELECT COUNT(*) FROM bookings
    WHERE lab_id = NEW.lab_id
      AND status NOT IN ('cancelled', 'completed')
      AND NEW.start_time < end_time
      AND NEW.end_time   > start_time) > 0 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'ห้องนี้ถูกจองในช่วงเวลาดังกล่าวแล้ว';
END IF
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `chat_messages`
--

CREATE TABLE `chat_messages` (
  `message_id` bigint NOT NULL,
  `session_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('user','assistant') COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `context_json` json NOT NULL DEFAULT (_utf8mb4'{}'),
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `labs`
--

CREATE TABLE `labs` (
  `lab_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_th` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_en` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description_th` text COLLATE utf8mb4_unicode_ci,
  `duration_minutes` int NOT NULL DEFAULT '120',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `labs`
--

INSERT INTO `labs` (`lab_id`, `code`, `name_th`, `name_en`, `description_th`, `duration_minutes`, `is_active`, `created_at`, `updated_at`) VALUES
('4ac527b1-4b90-11f1-92c8-daabbe1b5418', 'LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก', 'Biot-Savart Law & Magnetic Fields', 'ศึกษาสนามแม่เหล็กที่เกิดจากลวดตัวนำรูปทรงต่างๆ และตรวจสอบความถูกต้องของกฎ Biot-Savart', 120, 1, '2026-05-09 10:17:32', '2026-05-09 10:17:32');

-- --------------------------------------------------------

--
-- Table structure for table `lab_chat`
--

CREATE TABLE `lab_chat` (
  `id` bigint NOT NULL,
  `lab_code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `lab_chat`
--

INSERT INTO `lab_chat` (`id`, `lab_code`, `user_id`, `user_name`, `content`, `created_at`) VALUES
(1, 'M9LZHY', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt', 'asd', '2026-05-09 17:14:13'),
(2, 'M9LZHY', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt', 'asdqwdzxczc', '2026-05-09 17:14:30'),
(3, 'LAB8', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', 'asdasd', '2026-05-09 17:14:35'),
(4, 'LAB8', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', 'ห', '2026-05-09 17:19:09'),
(5, 'LAB8', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', 'ฟหกฟหก', '2026-05-09 17:19:44'),
(6, 'M9LZHY', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt', 'ฟหกฟหก', '2026-05-09 17:19:47'),
(7, 'M9LZHY', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt', 'หฟกฟหกไๆ', '2026-05-09 17:19:53'),
(8, 'LAB8', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', 'หฟกฟหแผปแ', '2026-05-09 17:19:57'),
(9, 'VYDFJB', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', 'asdsad', '2026-05-11 08:47:30'),
(10, 'VYDFJB', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt', 'sadasdas', '2026-05-11 08:47:36'),
(11, 'VYDFJB', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt', 'fsdfwefsdc', '2026-05-11 08:47:43'),
(12, 'VYDFJB', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', 'ฟหก', '2026-05-11 08:51:05'),
(13, 'VYDFJB', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', 'ฟหกๆไกกหฃ', '2026-05-11 08:51:18'),
(14, 'VYDFJB', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt', 'หกฟหก', '2026-05-11 08:51:24'),
(15, 'VYDFJB', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', 'หฟก', '2026-05-11 08:52:55'),
(16, 'VYDFJB', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', 'หฟกหฟก', '2026-05-11 08:54:00'),
(17, 'HT5W7B', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', 'หฟกฟห', '2026-05-11 09:10:11'),
(18, 'HT5W7B', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt', 'ฟหก้ไๆืก', '2026-05-11 09:10:14'),
(19, 'HT5W7B', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt', 'หเหกยอา', '2026-05-11 09:10:45'),
(20, 'HT5W7B', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt', 'หฟปฟหป', '2026-05-11 09:11:03'),
(21, 'HT5W7B', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt', 'fhgf', '2026-05-11 09:15:31'),
(22, 'HT5W7B', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt', '5', '2026-05-11 09:15:47'),
(23, 'HT5W7B', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', '31261', '2026-05-11 09:15:50'),
(24, 'HT5W7B', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt', '6', '2026-05-11 09:16:02'),
(25, 'HT5W7B', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', '3', '2026-05-11 09:16:12'),
(26, 'HT5W7B', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt', 'xzc', '2026-05-11 09:16:29'),
(27, 'HT5W7B', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', 'zxczxcsaa', '2026-05-11 09:16:31'),
(28, 'HT5W7B', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', 'asd', '2026-05-11 09:20:07'),
(29, '8PWZNF', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'TyrK night', 'asdsa', '2026-05-11 09:20:38');

-- --------------------------------------------------------

--
-- Table structure for table `lab_rooms`
--

CREATE TABLE `lab_rooms` (
  `code` char(6) COLLATE utf8mb4_unicode_ci NOT NULL,
  `booking_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lab_code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lab_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `host_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `lab_rooms`
--

INSERT INTO `lab_rooms` (`code`, `booking_id`, `lab_code`, `lab_name`, `host_name`, `expires_at`, `created_at`) VALUES
('M9LZHY', '45c944db-4bc9-11f1-bc62-1ebe3fd493b5', 'LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก', 'TyrK night', '2026-05-09 19:00:00', '2026-05-09 17:13:14');

-- --------------------------------------------------------

--
-- Table structure for table `measurements`
--

CREATE TABLE `measurements` (
  `measurement_id` bigint NOT NULL,
  `session_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lab_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `measured_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `current_nominal_a` decimal(8,4) DEFAULT NULL,
  `current_measured_a` decimal(8,4) DEFAULT NULL,
  `b_theory_mt` decimal(10,6) DEFAULT NULL,
  `b_measured_mt` decimal(10,6) DEFAULT NULL,
  `delta_b_mt` decimal(10,6) DEFAULT NULL,
  `delta_b_percent` decimal(8,4) DEFAULT NULL,
  `position_z_m` decimal(8,5) DEFAULT NULL,
  `raw_data` json NOT NULL DEFAULT (_utf8mb4'{}')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `notification_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('info','success','warning','error') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
  `action_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`notification_id`, `user_id`, `title`, `message`, `type`, `action_url`, `is_read`, `created_at`) VALUES
('000fdf9b-4b93-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 13 พ.ค. 69 เวลา 08:00', 'success', NULL, 1, '2026-05-09 10:36:55'),
('007fd997-4bab-11f1-bc62-1ebe3fd493b5', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'ยกเลิกการจองแล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 9 พ.ค. 69 ถูกยกเลิกเรียบร้อย', 'warning', NULL, 1, '2026-05-09 13:28:44'),
('0200a765-4bab-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 9 พ.ค. 69 เวลา 20:00', 'success', NULL, 1, '2026-05-09 13:28:47'),
('0594fe70-4bab-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  20:00 – 22:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 13:28:53'),
('08e7d2c3-4b9d-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:48:45'),
('159e29bc-4b9e-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:56:16'),
('1ab73dd1-4b9c-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:42:06'),
('1d0baed7-4b93-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  16:00 – 18:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 10:37:44'),
('24b1d027-4bd1-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  00:00 – 02:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 18:01:46'),
('2d8a412a-4b9d-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:49:47'),
('318874bf-4b9f-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 9 พ.ค. 69 เวลา 18:00', 'success', NULL, 1, '2026-05-09 12:04:12'),
('37174dc1-4b9e-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:57:12'),
('3b3898b8-4b9f-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 12:04:29'),
('3c740166-4ba1-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 9 พ.ค. 69 เวลา 18:00', 'success', NULL, 1, '2026-05-09 12:18:50'),
('3e6e6499-4b9c-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:43:05'),
('3ea8d67b-4ba1-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 12:18:53'),
('45cb2d27-4bc9-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 10 พ.ค. 69 เวลา 00:00', 'success', NULL, 1, '2026-05-09 17:05:25'),
('48765344-4bd1-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  00:00 – 02:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 18:02:46'),
('514ab82a-4b9d-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:50:47'),
('539afe57-4bc9-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  00:00 – 02:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 17:05:48'),
('56b11a85-4ba4-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 9 พ.ค. 69 เวลา 18:00', 'success', NULL, 1, '2026-05-09 12:41:02'),
('570dbb1a-4b98-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 9 พ.ค. 69 เวลา 18:00', 'success', NULL, 1, '2026-05-09 11:15:09'),
('58a78130-4ba4-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 12:41:05'),
('5ad88a46-4b9e-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:58:12'),
('617ad98e-4b98-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:15:26'),
('67a6b9c2-4b9c-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:44:15'),
('6e6ca130-4d13-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 11 พ.ค. 69 เวลา 14:00', 'success', NULL, 1, '2026-05-11 08:28:47'),
('6e722ccd-4d13-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  14:00 – 16:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-11 08:28:47'),
('71bcd638-4ba0-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 9 พ.ค. 69 เวลา 18:00', 'success', NULL, 1, '2026-05-09 12:13:10'),
('73854719-4ba0-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 12:13:13'),
('750fd451-4b9d-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:51:47'),
('7a5531e5-4bd1-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  00:00 – 02:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 18:04:09'),
('7c39f6c6-4b9e-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:59:08'),
('7d5aed5b-4bd1-11f1-bc62-1ebe3fd493b5', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 10 พ.ค. 69 เวลา 04:00', 'success', NULL, 1, '2026-05-09 18:04:14'),
('8500b460-4bd1-11f1-bc62-1ebe3fd493b5', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 10 พ.ค. 69 เวลา 06:00', 'success', NULL, 1, '2026-05-09 18:04:27'),
('85b0b6b3-4b90-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 2026-05-09 เวลา 16:00', 'success', NULL, 1, '2026-05-09 10:19:11'),
('87aa5944-4b90-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  16:00 – 18:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 10:19:14'),
('8b69745c-4b9c-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:45:15'),
('962d52a1-4d13-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 11 พ.ค. 69 เวลา 14:00', 'success', NULL, 1, '2026-05-11 08:29:54'),
('9631dc7c-4d13-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  14:00 – 16:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-11 08:29:54'),
('9d172487-4bd1-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  00:00 – 02:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 18:05:08'),
('a12b299f-4b9d-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:53:01'),
('a8e31a5a-4d1a-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 11 พ.ค. 69 เวลา 16:00', 'success', NULL, 1, '2026-05-11 09:20:32'),
('a8e5f4bf-4d1a-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  16:00 – 18:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-11 09:20:32'),
('ab6dbeed-4b90-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  16:00 – 18:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 10:20:14'),
('aec42708-4b9c-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:46:14'),
('befc71e0-4bd1-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  00:00 – 02:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 18:06:04'),
('c2d5ad4a-4b9b-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 9 พ.ค. 69 เวลา 18:00', 'success', NULL, 1, '2026-05-09 11:39:38'),
('c4edaf15-4b9d-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:54:01'),
('c936a23c-4bd0-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 10 พ.ค. 69 เวลา 00:00', 'success', NULL, 1, '2026-05-09 17:59:12'),
('c939dbbe-4bd0-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  00:00 – 02:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 17:59:12'),
('cf326c3f-4b90-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  16:00 – 18:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 10:21:14'),
('cf7a7792-4b92-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  16:00 – 18:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 10:35:34'),
('d2d3cbb4-4baa-11f1-bc62-1ebe3fd493b5', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 9 พ.ค. 69 เวลา 20:00', 'success', NULL, 1, '2026-05-09 13:27:27'),
('d2f98662-4b9c-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:47:15'),
('d339fa27-4b9b-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:40:06'),
('d4e9e6c2-4baa-11f1-bc62-1ebe3fd493b5', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  20:00 – 22:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 13:27:31'),
('e2e013cc-4b9f-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 9 พ.ค. 69 เวลา 18:00', 'success', NULL, 1, '2026-05-09 12:09:10'),
('e4603912-4b9f-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 12:09:12'),
('e5b0e8cb-4ba9-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 9 พ.ค. 69 เวลา 20:00', 'success', NULL, 1, '2026-05-09 13:20:50'),
('e62c69bb-4d17-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 11 พ.ค. 69 เวลา 16:00', 'success', NULL, 1, '2026-05-11 09:00:46'),
('e630f2aa-4d17-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  16:00 – 18:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-11 09:00:46'),
('e84dc603-4bab-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 9 พ.ค. 69 เวลา 20:00', 'success', NULL, 1, '2026-05-09 13:35:13'),
('e88bc7ab-4bab-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  20:00 – 22:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 13:35:13'),
('eb3d7649-4bce-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 10 พ.ค. 69 เวลา 00:00', 'success', NULL, 1, '2026-05-09 17:45:50'),
('eb980296-4ba9-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  20:00 – 22:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 13:20:59'),
('ecdaaa79-4b9d-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:55:08'),
('ed4a8f23-4bce-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  00:00 – 02:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 17:45:54'),
('efaeb70b-4b92-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 10 พ.ค. 69 เวลา 10:00', 'success', NULL, 1, '2026-05-09 10:36:28'),
('f315b2be-4b90-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  16:00 – 18:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 10:22:15'),
('f3441b02-4b92-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  16:00 – 18:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 10:36:34'),
('f6a49688-4d15-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 11 พ.ค. 69 เวลา 14:00', 'success', NULL, 1, '2026-05-11 08:46:55'),
('f6ab431f-4d15-11f1-ab3a-025ad5b7e7c9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  14:00 – 16:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-11 08:46:55'),
('f6dd5a97-4b9b-11f1-92c8-daabbe1b5418', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  18:00 – 20:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 11:41:05'),
('f9163962-4bd0-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 10 พ.ค. 69 เวลา 00:00', 'success', NULL, 1, '2026-05-09 18:00:32'),
('f919d8b7-4bd0-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  00:00 – 02:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 18:00:32'),
('f9ae85cf-4baa-11f1-bc62-1ebe3fd493b5', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 9 พ.ค. 69 เวลา 20:00', 'success', NULL, 1, '2026-05-09 13:28:33'),
('fcf1c790-4bd0-11f1-bc62-1ebe3fd493b5', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'จองสำเร็จ — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก วันที่ 10 พ.ค. 69 เวลา 02:00', 'success', NULL, 1, '2026-05-09 18:00:39'),
('fea2438e-4baa-11f1-bc62-1ebe3fd493b5', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'เข้าห้องแลปได้แล้ว — LAB8', 'กฎของ Biot-Savart และสนามแม่เหล็ก  ·  20:00 – 22:00  ·  กรุณาเข้าสู่ห้องปฏิบัติการ', 'success', '/lab', 1, '2026-05-09 13:28:41');

-- --------------------------------------------------------

--
-- Table structure for table `role_permissions`
--

CREATE TABLE `role_permissions` (
  `role` enum('student','researcher','instructor','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `max_days_ahead` int NOT NULL DEFAULT '7',
  `max_slots_per_day` int NOT NULL DEFAULT '2',
  `notes` text COLLATE utf8mb4_unicode_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `role_permissions`
--

INSERT INTO `role_permissions` (`role`, `max_days_ahead`, `max_slots_per_day`, `notes`) VALUES
('student', 7, 1, 'นักศึกษาสามารถจองล่วงหน้าได้ 7 วัน ไม่เกิน 1 slot/วัน'),
('researcher', 30, 4, 'นักวิจัยสามารถจองล่วงหน้าได้ 30 วัน'),
('instructor', 30, 8, 'อาจารย์มีสิทธิ์เต็ม'),
('other', 7, 1, 'ผู้ใช้ทั่วไป');

-- --------------------------------------------------------

--
-- Table structure for table `sessions`
--

CREATE TABLE `sessions` (
  `session_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lab_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `booking_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `end_time` datetime DEFAULT NULL,
  `duration_seconds` int DEFAULT NULL,
  `status` enum('active','paused','stopped','completed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `sessions`
--

INSERT INTO `sessions` (`session_id`, `user_id`, `lab_id`, `booking_id`, `start_time`, `end_time`, `duration_seconds`, `status`, `created_at`, `updated_at`) VALUES
('LAB8-02002525', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '02002525-4bab-11f1-bc62-1ebe3fd493b5', '2026-05-09 13:29:02', '2026-05-09 13:29:07', 5, 'completed', '2026-05-09 13:29:02', '2026-05-09 13:29:07'),
('LAB8-45c944db', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '45c944db-4bc9-11f1-bc62-1ebe3fd493b5', '2026-05-09 17:05:56', '2026-05-09 17:45:41', 2385, 'completed', '2026-05-09 17:05:56', '2026-05-09 17:45:41'),
('LAB8-6e6ab34f', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '6e6ab34f-4d13-11f1-ab3a-025ad5b7e7c9', '2026-05-11 08:28:53', '2026-05-11 08:29:16', 23, 'completed', '2026-05-11 08:28:53', '2026-05-11 08:29:16'),
('LAB8-962cae92', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', '962cae92-4d13-11f1-ab3a-025ad5b7e7c9', '2026-05-11 08:29:56', '2026-05-11 08:41:11', 675, 'completed', '2026-05-11 08:29:56', '2026-05-11 08:41:11'),
('LAB8-a8e23928', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', 'a8e23928-4d1a-11f1-ab3a-025ad5b7e7c9', '2026-05-11 09:20:33', NULL, NULL, 'active', '2026-05-11 09:20:33', '2026-05-11 09:20:33'),
('LAB8-c935b9d1', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', 'c935b9d1-4bd0-11f1-bc62-1ebe3fd493b5', '2026-05-09 17:59:48', '2026-05-09 18:00:18', 30, 'completed', '2026-05-09 17:59:48', '2026-05-09 18:00:18'),
('LAB8-d2d2be05', '8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', 'd2d2be05-4baa-11f1-bc62-1ebe3fd493b5', '2026-05-09 13:27:32', '2026-05-09 13:28:16', 44, 'completed', '2026-05-09 13:27:32', '2026-05-09 13:28:16'),
('LAB8-e5afbc62', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', 'e5afbc62-4ba9-11f1-bc62-1ebe3fd493b5', '2026-05-09 13:21:02', '2026-05-09 13:21:13', 11, 'completed', '2026-05-09 13:21:02', '2026-05-09 13:21:13'),
('LAB8-e62b656c', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', 'e62b656c-4d17-11f1-ab3a-025ad5b7e7c9', '2026-05-11 09:01:04', '2026-05-11 09:20:27', 1163, 'completed', '2026-05-11 09:01:04', '2026-05-11 09:20:27'),
('LAB8-e84cd3f2', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', 'e84cd3f2-4bab-11f1-bc62-1ebe3fd493b5', '2026-05-09 13:35:16', '2026-05-09 13:59:39', 1463, 'completed', '2026-05-09 13:35:16', '2026-05-09 13:59:39'),
('LAB8-eb3c43b9', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', 'eb3c43b9-4bce-11f1-bc62-1ebe3fd493b5', '2026-05-09 17:45:55', '2026-05-09 17:59:06', 791, 'completed', '2026-05-09 17:45:55', '2026-05-09 17:59:06'),
('LAB8-f6a39801', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', 'f6a39801-4d15-11f1-ab3a-025ad5b7e7c9', '2026-05-11 08:47:06', '2026-05-11 08:59:59', 773, 'completed', '2026-05-11 08:47:06', '2026-05-11 08:59:59'),
('LAB8-f9156806', '7f92ef78-4b90-11f1-92c8-daabbe1b5418', '4ac527b1-4b90-11f1-92c8-daabbe1b5418', 'f9156806-4bd0-11f1-bc62-1ebe3fd493b5', '2026-05-09 18:06:05', NULL, NULL, 'active', '2026-05-09 18:06:05', '2026-05-09 18:06:05');

-- --------------------------------------------------------

--
-- Table structure for table `session_logs`
--

CREATE TABLE `session_logs` (
  `log_id` bigint NOT NULL,
  `session_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logged_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `log_type` enum('info','warn','data','cmd','error') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `context_data` json NOT NULL DEFAULT (_utf8mb4'{}')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Stand-in structure for view `session_summary`
-- (See below for the actual view)
--
CREATE TABLE `session_summary` (
`session_id` varchar(30)
,`user_id` char(36)
,`user_name` varchar(255)
,`lab_code` varchar(20)
,`lab_name` varchar(255)
,`start_time` datetime
,`end_time` datetime
,`status` enum('active','paused','stopped','completed')
,`total_measurements` bigint
,`avg_error_percent` decimal(12,8)
,`first_measurement` datetime(3)
,`last_measurement` datetime(3)
);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` text COLLATE utf8mb4_unicode_ci,
  `role` enum('student','researcher','instructor','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'student',
  `email_verified` tinyint(1) NOT NULL DEFAULT '0',
  `remember_token` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`user_id`, `email`, `name`, `password_hash`, `role`, `email_verified`, `remember_token`, `created_at`, `updated_at`) VALUES
('7f92ef78-4b90-11f1-92c8-daabbe1b5418', 'tyrk0night@gmail.com', 'TyrK night', '$2b$12$dGyLHf0Jw7VsdesVfcYgr.D1Kbat03JEM3oweDhsVZ79QY5PKpjt6', 'student', 0, NULL, '2026-05-09 10:19:01', '2026-05-09 10:19:01'),
('8ac20a1c-4baa-11f1-bc62-1ebe3fd493b5', 'tttt@g.com', 'tttt', '$2b$12$wf6tGzCLANiKGiVX8o0v.uCAHrkAeQLgvQl4wW.KP77/yM8qqJjsu', 'instructor', 0, NULL, '2026-05-09 13:25:26', '2026-05-09 13:25:26');

-- --------------------------------------------------------

--
-- Table structure for table `user_social_accounts`
--

CREATE TABLE `user_social_accounts` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider_uid` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `access_token` text COLLATE utf8mb4_unicode_ci,
  `refresh_token` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `bookings`
--
ALTER TABLE `bookings`
  ADD PRIMARY KEY (`booking_id`),
  ADD UNIQUE KEY `idx_bookings_room_code` (`room_code`),
  ADD KEY `idx_bookings_user` (`user_id`),
  ADD KEY `idx_bookings_lab` (`lab_id`),
  ADD KEY `idx_bookings_time` (`start_time`,`end_time`);

--
-- Indexes for table `chat_messages`
--
ALTER TABLE `chat_messages`
  ADD PRIMARY KEY (`message_id`),
  ADD KEY `idx_chat_session` (`session_id`,`created_at`),
  ADD KEY `fk_chat_user` (`user_id`);

--
-- Indexes for table `labs`
--
ALTER TABLE `labs`
  ADD PRIMARY KEY (`lab_id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Indexes for table `lab_chat`
--
ALTER TABLE `lab_chat`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_lab_chat` (`lab_code`,`created_at` DESC);

--
-- Indexes for table `lab_rooms`
--
ALTER TABLE `lab_rooms`
  ADD PRIMARY KEY (`code`),
  ADD UNIQUE KEY `booking_id` (`booking_id`);

--
-- Indexes for table `measurements`
--
ALTER TABLE `measurements`
  ADD PRIMARY KEY (`measurement_id`),
  ADD KEY `idx_meas_session_time` (`session_id`,`measured_at` DESC),
  ADD KEY `idx_meas_lab` (`lab_id`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`notification_id`),
  ADD KEY `idx_notif_user` (`user_id`,`created_at` DESC);

--
-- Indexes for table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD PRIMARY KEY (`role`);

--
-- Indexes for table `sessions`
--
ALTER TABLE `sessions`
  ADD PRIMARY KEY (`session_id`),
  ADD UNIQUE KEY `booking_id` (`booking_id`),
  ADD KEY `idx_sessions_user` (`user_id`),
  ADD KEY `idx_sessions_lab` (`lab_id`),
  ADD KEY `idx_sessions_status` (`status`);

--
-- Indexes for table `session_logs`
--
ALTER TABLE `session_logs`
  ADD PRIMARY KEY (`log_id`),
  ADD KEY `idx_logs_session` (`session_id`,`logged_at` DESC);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `user_social_accounts`
--
ALTER TABLE `user_social_accounts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_provider_uid` (`provider`,`provider_uid`),
  ADD KEY `fk_social_user` (`user_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `chat_messages`
--
ALTER TABLE `chat_messages`
  MODIFY `message_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `lab_chat`
--
ALTER TABLE `lab_chat`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=30;

--
-- AUTO_INCREMENT for table `measurements`
--
ALTER TABLE `measurements`
  MODIFY `measurement_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `session_logs`
--
ALTER TABLE `session_logs`
  MODIFY `log_id` bigint NOT NULL AUTO_INCREMENT;

-- --------------------------------------------------------

--
-- Structure for view `session_summary`
--
DROP TABLE IF EXISTS `session_summary`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`%` SQL SECURITY DEFINER VIEW `session_summary`  AS SELECT `s`.`session_id` AS `session_id`, `s`.`user_id` AS `user_id`, `u`.`name` AS `user_name`, `l`.`code` AS `lab_code`, `l`.`name_th` AS `lab_name`, `s`.`start_time` AS `start_time`, `s`.`end_time` AS `end_time`, `s`.`status` AS `status`, count(`m`.`measurement_id`) AS `total_measurements`, avg(abs(`m`.`delta_b_percent`)) AS `avg_error_percent`, min(`m`.`measured_at`) AS `first_measurement`, max(`m`.`measured_at`) AS `last_measurement` FROM (((`sessions` `s` join `users` `u` on((`u`.`user_id` = `s`.`user_id`))) join `labs` `l` on((`l`.`lab_id` = `s`.`lab_id`))) left join `measurements` `m` on((`m`.`session_id` = `s`.`session_id`))) GROUP BY `s`.`session_id`, `u`.`name`, `l`.`code`, `l`.`name_th`, `s`.`start_time`, `s`.`end_time`, `s`.`status` ;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `bookings`
--
ALTER TABLE `bookings`
  ADD CONSTRAINT `fk_booking_lab` FOREIGN KEY (`lab_id`) REFERENCES `labs` (`lab_id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `fk_booking_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `chat_messages`
--
ALTER TABLE `chat_messages`
  ADD CONSTRAINT `fk_chat_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`session_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_chat_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL;

--
-- Constraints for table `measurements`
--
ALTER TABLE `measurements`
  ADD CONSTRAINT `fk_meas_lab` FOREIGN KEY (`lab_id`) REFERENCES `labs` (`lab_id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `fk_meas_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`session_id`) ON DELETE CASCADE;

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `sessions`
--
ALTER TABLE `sessions`
  ADD CONSTRAINT `fk_session_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_session_lab` FOREIGN KEY (`lab_id`) REFERENCES `labs` (`lab_id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `fk_session_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `session_logs`
--
ALTER TABLE `session_logs`
  ADD CONSTRAINT `fk_log_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`session_id`) ON DELETE CASCADE;

--
-- Constraints for table `user_social_accounts`
--
ALTER TABLE `user_social_accounts`
  ADD CONSTRAINT `fk_social_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
