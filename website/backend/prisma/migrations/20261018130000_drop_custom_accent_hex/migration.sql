-- Store exact user-selected drop accents while preserving the legacy enum field.
ALTER TABLE `drops`
  ADD COLUMN `accent_hex` VARCHAR(7) NOT NULL DEFAULT '#FFE45C';

UPDATE `drops`
SET `accent_hex` = CASE `accent_color`
  WHEN 'SKY' THEN '#5CC8FF'
  WHEN 'LILAC' THEN '#C9B6FF'
  ELSE '#FFE45C'
END;
