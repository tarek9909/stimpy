-- Configurable packs that contain Stimpies without a hoodie.
ALTER TABLE `order_items`
  MODIFY `kind` ENUM('PACK', 'STIMPIE_PACK', 'HOODIE', 'STIMPIE') NOT NULL;

ALTER TABLE `packs`
  ADD COLUMN `type` ENUM('HOODIE_SET', 'STIMPIE_ONLY') NOT NULL DEFAULT 'HOODIE_SET' AFTER `id`,
  ADD COLUMN `eligible_stimpie_ids` JSON NULL AFTER `stimpie_count`,
  DROP CHECK `chk_packs_stimpie_count`,
  ADD CONSTRAINT `chk_packs_stimpie_count` CHECK (`stimpie_count` BETWEEN 1 AND 1000000);

-- Keep existing pack prices and owner edits intact. Existing matching slugs are left untouched.
INSERT INTO `packs` (`type`, `name`, `slug`, `description`, `stimpie_count`, `eligible_stimpie_ids`, `price_cents`, `badge`, `active`, `position`, `created_at`, `updated_at`)
VALUES
  ('STIMPIE_ONLY', '1 Stimpie', 'stimpie-only-1', 'Choose one Stimpie design.', 1, NULL, 1200, NULL, true, 3, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('STIMPIE_ONLY', '2 Stimpies', 'stimpie-only-2', 'Choose two Stimpies. Repeats are allowed.', 2, NULL, 2000, NULL, true, 4, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('STIMPIE_ONLY', '3 Stimpies', 'stimpie-only-3', 'Choose three Stimpies. Repeats are allowed.', 3, NULL, 2700, NULL, true, 5, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('STIMPIE_ONLY', '4 Stimpies', 'stimpie-only-4', 'Choose four Stimpies. Repeats are allowed.', 4, NULL, 3200, NULL, true, 6, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('STIMPIE_ONLY', '5 Stimpies', 'stimpie-only-5', 'Choose five Stimpies. Repeats are allowed.', 5, NULL, 3800, NULL, true, 7, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `id` = `id`;
