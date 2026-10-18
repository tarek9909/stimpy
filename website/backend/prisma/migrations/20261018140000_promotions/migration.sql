CREATE TABLE `promotions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `discount_type` ENUM('PERCENTAGE', 'FIXED') NOT NULL,
  `discount_value` INT NOT NULL,
  `all_products` BOOLEAN NOT NULL DEFAULT false,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `starts_at` DATETIME(3) NULL,
  `ends_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `promotions_enabled_starts_at_ends_at_idx` (`enabled`, `starts_at`, `ends_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `promotion_items` (
  `promotion_id` INT UNSIGNED NOT NULL,
  `product_type` ENUM('HOODIE', 'STIMPIE', 'PACK') NOT NULL,
  `product_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`promotion_id`, `product_type`, `product_id`),
  INDEX `promotion_items_product_type_product_id_idx` (`product_type`, `product_id`),
  CONSTRAINT `promotion_items_promotion_id_fkey`
    FOREIGN KEY (`promotion_id`) REFERENCES `promotions` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
