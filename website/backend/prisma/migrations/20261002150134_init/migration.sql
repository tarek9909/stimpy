-- CreateTable
CREATE TABLE `admin_users` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(190) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `role` ENUM('OWNER', 'PACKER') NOT NULL DEFAULT 'OWNER',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_sessions` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `absolute_expires_at` DATETIME(3) NOT NULL,
    `last_used_at` DATETIME(3) NOT NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `admin_sessions_token_hash_key`(`token_hash`),
    INDEX `admin_sessions_expires_at_idx`(`expires_at`),
    INDEX `admin_sessions_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `colors` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(60) NOT NULL,
    `hex` CHAR(7) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `images` JSON NOT NULL,
    `builder_tint` CHAR(7) NULL,
    `builder_texture` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `colors_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sizes` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `label` VARCHAR(20) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sizes_label_key`(`label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `size_chart_columns` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `label` VARCHAR(40) NOT NULL,
    `unit` VARCHAR(10) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `size_chart_values` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `size_id` INTEGER UNSIGNED NOT NULL,
    `column_id` INTEGER UNSIGNED NOT NULL,
    `value` VARCHAR(30) NOT NULL,

    INDEX `size_chart_values_column_id_idx`(`column_id`),
    UNIQUE INDEX `size_chart_values_size_id_column_id_key`(`size_id`, `column_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hoodies` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(140) NOT NULL,
    `description` TEXT NOT NULL,
    `details` JSON NOT NULL,
    `price_cents` INTEGER NOT NULL,
    `cost_cents` INTEGER NOT NULL DEFAULT 1000,
    `images` JSON NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `hoodies_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hoodie_variants` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `hoodie_id` INTEGER UNSIGNED NOT NULL,
    `color_id` INTEGER UNSIGNED NOT NULL,
    `size_id` INTEGER UNSIGNED NOT NULL,
    `sku` VARCHAR(60) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `reserved` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `hoodie_variants_sku_key`(`sku`),
    INDEX `hoodie_variants_color_id_idx`(`color_id`),
    INDEX `hoodie_variants_size_id_idx`(`size_id`),
    UNIQUE INDEX `hoodie_variants_hoodie_id_color_id_size_id_key`(`hoodie_id`, `color_id`, `size_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `drops` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(140) NOT NULL,
    `story` TEXT NOT NULL,
    `accent_color` ENUM('BUTTER', 'SKY', 'LILAC') NOT NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NULL,
    `ended_at` DATETIME(3) NULL,
    `teaser_image` VARCHAR(500) NULL,
    `teaser_video` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `drops_slug_key`(`slug`),
    INDEX `drops_starts_at_idx`(`starts_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stimpies` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(140) NOT NULL,
    `type` ENUM('CORE', 'LIMITED') NOT NULL,
    `drop_id` INTEGER UNSIGNED NULL,
    `price_cents` INTEGER NOT NULL,
    `cost_cents` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `reserved` INTEGER NOT NULL DEFAULT 0,
    `story` TEXT NOT NULL,
    `images` JSON NOT NULL,
    `artwork_url` VARCHAR(500) NOT NULL,
    `artwork_width` INTEGER NULL,
    `artwork_height` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stimpies_slug_key`(`slug`),
    INDEX `stimpies_drop_id_idx`(`drop_id`),
    INDEX `stimpies_type_active_position_idx`(`type`, `active`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `packs` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(140) NOT NULL,
    `description` TEXT NOT NULL,
    `stimpie_count` INTEGER NOT NULL,
    `price_cents` INTEGER NOT NULL,
    `badge` VARCHAR(40) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `packs_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `areas` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `fee_cents` INTEGER NULL,
    `est_days` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `areas_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `uploads` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `path` VARCHAR(300) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `mime` VARCHAR(80) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `original_name` VARCHAR(200) NOT NULL,
    `created_by` INTEGER UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uploads_path_key`(`path`),
    INDEX `uploads_created_by_idx`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `phone` VARCHAR(20) NOT NULL,
    `whatsapp` VARCHAR(20) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(190) NULL,
    `area_id` INTEGER UNSIGNED NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customers_phone_key`(`phone`),
    INDEX `customers_email_idx`(`email`),
    INDEX `customers_area_id_idx`(`area_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `number` VARCHAR(30) NOT NULL,
    `customer_id` INTEGER UNSIGNED NOT NULL,
    `status` ENUM('NEW', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED') NOT NULL,
    `source` ENUM('WEBSITE', 'INSTAGRAM', 'WHATSAPP', 'MANUAL') NOT NULL,
    `customer_name` VARCHAR(120) NOT NULL,
    `contact_email` VARCHAR(190) NULL,
    `contact_phone` VARCHAR(20) NOT NULL,
    `contact_whatsapp` VARCHAR(20) NOT NULL,
    `area_id` INTEGER UNSIGNED NULL,
    `area_name` VARCHAR(120) NOT NULL,
    `address` TEXT NOT NULL,
    `notes` TEXT NULL,
    `subtotal_cents` INTEGER NOT NULL,
    `delivery_fee_cents` INTEGER NOT NULL,
    `total_cents` INTEGER NOT NULL,
    `cost_cents` INTEGER NOT NULL,
    `cash_collected` BOOLEAN NOT NULL DEFAULT false,
    `cash_settled` BOOLEAN NOT NULL DEFAULT false,
    `delivery_number` VARCHAR(60) NULL,
    `placed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `hold_expires_at` DATETIME(3) NULL,
    `confirmed_at` DATETIME(3) NULL,
    `out_for_delivery_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancel_reason` VARCHAR(255) NULL,
    `idempotency_key` VARCHAR(80) NULL,
    `idempotency_hash` CHAR(64) NULL,
    `request_fingerprint` VARCHAR(64) NULL,
    `utm_source` VARCHAR(80) NULL,
    `utm_medium` VARCHAR(80) NULL,
    `utm_campaign` VARCHAR(80) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `orders_number_key`(`number`),
    UNIQUE INDEX `orders_idempotency_key_key`(`idempotency_key`),
    INDEX `orders_status_placed_at_idx`(`status`, `placed_at`),
    INDEX `orders_customer_id_idx`(`customer_id`),
    INDEX `orders_contact_phone_idx`(`contact_phone`),
    INDEX `orders_contact_email_idx`(`contact_email`),
    INDEX `orders_delivery_number_idx`(`delivery_number`),
    INDEX `orders_area_id_idx`(`area_id`),
    INDEX `orders_delivered_at_idx`(`delivered_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER UNSIGNED NOT NULL,
    `kind` ENUM('PACK', 'HOODIE', 'STIMPIE') NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `qty` INTEGER NOT NULL,
    `unit_price_cents` INTEGER NOT NULL,
    `unit_cost_cents` INTEGER NOT NULL,
    `detail` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_items_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_stock_lines` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER UNSIGNED NOT NULL,
    `order_item_id` INTEGER UNSIGNED NOT NULL,
    `item_type` ENUM('HOODIE_VARIANT', 'STIMPIE') NOT NULL,
    `variant_id` INTEGER UNSIGNED NULL,
    `stimpie_id` INTEGER UNSIGNED NULL,
    `qty` INTEGER NOT NULL,
    `state` ENUM('RESERVED', 'SOLD', 'RELEASED', 'RESTOCKED', 'WRITTEN_OFF') NOT NULL DEFAULT 'RESERVED',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_stock_lines_order_id_idx`(`order_id`),
    INDEX `order_stock_lines_order_item_id_idx`(`order_item_id`),
    INDEX `order_stock_lines_variant_id_idx`(`variant_id`),
    INDEX `order_stock_lines_stimpie_id_idx`(`stimpie_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_events` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER UNSIGNED NOT NULL,
    `from_status` ENUM('NEW', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED') NULL,
    `to_status` ENUM('NEW', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED') NOT NULL,
    `user_id` INTEGER UNSIGNED NULL,
    `note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_events_order_id_created_at_idx`(`order_id`, `created_at`),
    INDEX `order_events_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_notes` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER UNSIGNED NOT NULL,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `body` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_notes_order_id_idx`(`order_id`),
    INDEX `order_notes_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_movements` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `item_type` ENUM('HOODIE_VARIANT', 'STIMPIE') NOT NULL,
    `variant_id` INTEGER UNSIGNED NULL,
    `stimpie_id` INTEGER UNSIGNED NULL,
    `field` ENUM('QUANTITY', 'RESERVED') NOT NULL,
    `delta` INTEGER NOT NULL,
    `reason` ENUM('INITIAL', 'RESTOCK', 'CORRECTION', 'DAMAGED', 'ORDER_RESERVED', 'ORDER_RELEASED', 'ORDER_SOLD', 'ORDER_RETURNED', 'ORDER_WRITTEN_OFF') NOT NULL,
    `order_id` INTEGER UNSIGNED NULL,
    `user_id` INTEGER UNSIGNED NULL,
    `note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `stock_movements_variant_id_created_at_idx`(`variant_id`, `created_at`),
    INDEX `stock_movements_stimpie_id_created_at_idx`(`stimpie_id`, `created_at`),
    INDEX `stock_movements_order_id_idx`(`order_id`),
    INDEX `stock_movements_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `counters` (
    `name` VARCHAR(40) NOT NULL,
    `value` INTEGER NOT NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscribers` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `contact` VARCHAR(190) NOT NULL,
    `type` ENUM('EMAIL', 'WHATSAPP') NOT NULL,
    `drop_id` INTEGER UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `subscribers_contact_drop_id_idx`(`contact`, `drop_id`),
    INDEX `subscribers_drop_id_idx`(`drop_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expenses` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `category` VARCHAR(60) NOT NULL,
    `amount_cents` INTEGER NOT NULL,
    `note` VARCHAR(255) NULL,
    `spent_on` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `expenses_spent_on_idx`(`spent_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ad_spend` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `channel` VARCHAR(60) NOT NULL,
    `amount_cents` INTEGER NOT NULL,
    `note` VARCHAR(255) NULL,
    `spent_on` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ad_spend_spent_on_idx`(`spent_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_templates` (
    `key` VARCHAR(60) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `subject` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_templates` (
    `key` VARCHAR(60) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `body` TEXT NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_log` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER UNSIGNED NULL,
    `to_email` VARCHAR(190) NOT NULL,
    `template_key` VARCHAR(60) NOT NULL,
    `subject` VARCHAR(250) NOT NULL,
    `body_text` MEDIUMTEXT NOT NULL,
    `body_html` MEDIUMTEXT NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `next_attempt_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `error` VARCHAR(500) NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `email_log_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
    INDEX `email_log_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `faqs` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `question` VARCHAR(200) NOT NULL,
    `answer` TEXT NOT NULL,
    `group` VARCHAR(60) NULL,
    `show_on_home` BOOLEAN NOT NULL DEFAULT false,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reviews` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `text` TEXT NOT NULL,
    `media_url` VARCHAR(500) NULL,
    `visible` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_blocks` (
    `key` VARCHAR(60) NOT NULL,
    `value` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(60) NOT NULL,
    `value` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `builder_config` (
    `key` VARCHAR(40) NOT NULL,
    `value` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `admin_sessions` ADD CONSTRAINT `admin_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `size_chart_values` ADD CONSTRAINT `size_chart_values_size_id_fkey` FOREIGN KEY (`size_id`) REFERENCES `sizes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `size_chart_values` ADD CONSTRAINT `size_chart_values_column_id_fkey` FOREIGN KEY (`column_id`) REFERENCES `size_chart_columns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hoodie_variants` ADD CONSTRAINT `hoodie_variants_hoodie_id_fkey` FOREIGN KEY (`hoodie_id`) REFERENCES `hoodies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hoodie_variants` ADD CONSTRAINT `hoodie_variants_color_id_fkey` FOREIGN KEY (`color_id`) REFERENCES `colors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hoodie_variants` ADD CONSTRAINT `hoodie_variants_size_id_fkey` FOREIGN KEY (`size_id`) REFERENCES `sizes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stimpies` ADD CONSTRAINT `stimpies_drop_id_fkey` FOREIGN KEY (`drop_id`) REFERENCES `drops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `uploads` ADD CONSTRAINT `uploads_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_area_id_fkey` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_area_id_fkey` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_stock_lines` ADD CONSTRAINT `order_stock_lines_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_stock_lines` ADD CONSTRAINT `order_stock_lines_order_item_id_fkey` FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_stock_lines` ADD CONSTRAINT `order_stock_lines_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `hoodie_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_stock_lines` ADD CONSTRAINT `order_stock_lines_stimpie_id_fkey` FOREIGN KEY (`stimpie_id`) REFERENCES `stimpies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_events` ADD CONSTRAINT `order_events_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_events` ADD CONSTRAINT `order_events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_notes` ADD CONSTRAINT `order_notes_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_notes` ADD CONSTRAINT `order_notes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `hoodie_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_stimpie_id_fkey` FOREIGN KEY (`stimpie_id`) REFERENCES `stimpies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscribers` ADD CONSTRAINT `subscribers_drop_id_fkey` FOREIGN KEY (`drop_id`) REFERENCES `drops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_log` ADD CONSTRAINT `email_log_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECK constraints (not expressible in Prisma). Last line of defence behind the
-- atomic conditional UPDATE: the database itself refuses negative or over-reserved stock.
-- ---------------------------------------------------------------------------
ALTER TABLE `hoodie_variants`
    ADD CONSTRAINT `chk_hoodie_variants_quantity` CHECK (`quantity` >= 0),
    ADD CONSTRAINT `chk_hoodie_variants_reserved` CHECK (`reserved` >= 0 AND `reserved` <= `quantity`);

ALTER TABLE `stimpies`
    ADD CONSTRAINT `chk_stimpies_quantity` CHECK (`quantity` >= 0),
    ADD CONSTRAINT `chk_stimpies_reserved` CHECK (`reserved` >= 0 AND `reserved` <= `quantity`);

ALTER TABLE `packs`
    ADD CONSTRAINT `chk_packs_stimpie_count` CHECK (`stimpie_count` BETWEEN 1 AND 5);

-- A stock line must hold a positive quantity. (MySQL refuses CHECKs that mention foreign-key columns,
-- so 'exactly one of variant_id / stimpie_id' is enforced in the stock service instead.)
ALTER TABLE `order_stock_lines`
    ADD CONSTRAINT `chk_order_stock_lines_qty` CHECK (`qty` > 0);
