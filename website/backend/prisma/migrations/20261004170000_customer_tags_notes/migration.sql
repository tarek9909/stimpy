CREATE TABLE `customer_tags` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(80) NOT NULL,
  `color` VARCHAR(20) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `customer_tags_name_key` (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_tag_links` (
  `customer_id` INTEGER UNSIGNED NOT NULL,
  `tag_id` INTEGER UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`customer_id`, `tag_id`),
  INDEX `customer_tag_links_tag_id_customer_id_idx` (`tag_id`, `customer_id`),
  CONSTRAINT `customer_tag_links_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `customer_tag_links_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `customer_tags` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_notes` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INTEGER UNSIGNED NOT NULL,
  `user_id` INTEGER UNSIGNED NOT NULL,
  `body` VARCHAR(2000) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `customer_notes_customer_id_created_at_idx` (`customer_id`, `created_at`),
  CONSTRAINT `customer_notes_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `customer_notes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `admin_users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
