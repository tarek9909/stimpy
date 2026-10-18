-- Variants can be independently enabled for each hoodie. Existing combinations stay enabled.
ALTER TABLE `hoodie_variants`
  ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true;
