CREATE TABLE `customer_segments` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `filter_json` JSON NOT NULL,
  `created_by` INTEGER UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `customer_segments_created_by_updated_at_idx` (`created_by`, `updated_at`),
  UNIQUE INDEX `customer_segments_name_key` (`name`),
  PRIMARY KEY (`id`),
  CONSTRAINT `customer_segments_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `campaign_sends` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `segment_id` INTEGER UNSIGNED NULL,
  `filter_json` JSON NOT NULL,
  `channel` ENUM('EMAIL', 'WHATSAPP') NOT NULL,
  `template_key` VARCHAR(60) NOT NULL,
  `status` ENUM('DRAFT', 'QUEUED', 'READY', 'COMPLETED', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'DRAFT',
  `created_by` INTEGER UNSIGNED NOT NULL,
  `sent_count` INTEGER NOT NULL DEFAULT 0,
  `skipped_count` INTEGER NOT NULL DEFAULT 0,
  `failed_count` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `confirmed_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  INDEX `campaign_sends_created_at_id_idx` (`created_at`, `id`),
  INDEX `campaign_sends_status_created_at_idx` (`status`, `created_at`),
  INDEX `campaign_sends_segment_id_idx` (`segment_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `campaign_sends_segment_id_fkey` FOREIGN KEY (`segment_id`) REFERENCES `customer_segments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `campaign_sends_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `campaign_recipients` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `campaign_id` INTEGER UNSIGNED NOT NULL,
  `customer_id` INTEGER UNSIGNED NOT NULL,
  `status` ENUM('QUEUED', 'READY', 'SENT', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'QUEUED',
  `destination` VARCHAR(190) NULL,
  `body_snapshot` TEXT NULL,
  `email_log_id` INTEGER UNSIGNED NULL,
  `error` VARCHAR(500) NULL,
  `sent_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `campaign_recipients_email_log_id_key` (`email_log_id`),
  INDEX `campaign_recipients_customer_id_created_at_idx` (`customer_id`, `created_at`),
  INDEX `campaign_recipients_campaign_id_status_id_idx` (`campaign_id`, `status`, `id`),
  INDEX `campaign_recipients_campaign_id_customer_id_idx` (`campaign_id`, `customer_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `campaign_recipients_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaign_sends` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `campaign_recipients_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `campaign_recipients_email_log_id_fkey` FOREIGN KEY (`email_log_id`) REFERENCES `email_log` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
