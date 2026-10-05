CREATE TABLE `customer_follow_ups` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INTEGER UNSIGNED NOT NULL,
  `user_id` INTEGER UNSIGNED NOT NULL,
  `due_at` DATETIME(3) NOT NULL,
  `note` VARCHAR(1000) NOT NULL,
  `done_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `customer_follow_ups_done_at_due_at_idx` (`done_at`, `due_at`),
  INDEX `customer_follow_ups_customer_id_created_at_idx` (`customer_id`, `created_at`),
  CONSTRAINT `customer_follow_ups_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_follow_ups_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `admin_users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
