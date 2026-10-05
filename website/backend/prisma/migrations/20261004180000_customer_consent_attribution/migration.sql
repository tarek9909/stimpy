ALTER TABLE `customers`
  ADD COLUMN `email_consent` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `whatsapp_consent` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `consent_updated_at` DATETIME(3) NULL,
  ADD COLUMN `unsubscribed_at` DATETIME(3) NULL,
  ADD COLUMN `unsubscribe_token` CHAR(64) NULL,
  ADD COLUMN `first_source` VARCHAR(80) NULL,
  ADD COLUMN `first_utm_source` VARCHAR(80) NULL,
  ADD COLUMN `first_utm_medium` VARCHAR(80) NULL,
  ADD COLUMN `first_utm_campaign` VARCHAR(80) NULL,
  ADD COLUMN `first_utm_content` VARCHAR(80) NULL,
  ADD COLUMN `first_utm_term` VARCHAR(80) NULL,
  ADD COLUMN `first_referrer` VARCHAR(500) NULL,
  ADD COLUMN `first_touch_at` DATETIME(3) NULL;

ALTER TABLE `orders`
  ADD COLUMN `utm_content` VARCHAR(80) NULL,
  ADD COLUMN `utm_term` VARCHAR(80) NULL,
  ADD COLUMN `referrer` VARCHAR(500) NULL;

ALTER TABLE `subscribers`
  ADD COLUMN `customer_id` INTEGER UNSIGNED NULL,
  ADD INDEX `subscribers_customer_id_idx` (`customer_id`),
  ADD CONSTRAINT `subscribers_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE `customers` SET `unsubscribe_token` = LOWER(SHA2(UUID(), 256)) WHERE `unsubscribe_token` IS NULL;
UPDATE `subscribers` s JOIN `customers` c ON
  (s.type = 'EMAIL' AND LOWER(s.contact) = LOWER(c.email)) OR
  (s.type = 'WHATSAPP' AND s.contact = c.phone)
SET s.customer_id = c.id
WHERE s.customer_id IS NULL;
UPDATE `customers` c SET
  `email_consent` = EXISTS (SELECT 1 FROM `subscribers` s WHERE s.customer_id = c.id AND s.type = 'EMAIL'),
  `whatsapp_consent` = EXISTS (SELECT 1 FROM `subscribers` s WHERE s.customer_id = c.id AND s.type = 'WHATSAPP'),
  `consent_updated_at` = CASE WHEN EXISTS (SELECT 1 FROM `subscribers` s WHERE s.customer_id = c.id) THEN CURRENT_TIMESTAMP(3) ELSE NULL END;

CREATE UNIQUE INDEX `customers_unsubscribe_token_key` ON `customers` (`unsubscribe_token`);
CREATE INDEX `customers_first_source_first_utm_campaign_idx` ON `customers` (`first_source`, `first_utm_campaign`);
CREATE INDEX `orders_utm_source_utm_campaign_idx` ON `orders` (`utm_source`, `utm_campaign`);
