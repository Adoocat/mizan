-- Reference data: currencies Mizan can represent. The MVP uses TRY only (decision D7);
-- the others exist so currency columns and composite keys work from day one.
INSERT INTO "currencies" ("code", "minor_units", "symbol") VALUES
  ('TRY', 2, '₺'),
  ('USD', 2, '$'),
  ('EUR', 2, '€'),
  ('GBP', 2, '£')
ON CONFLICT ("code") DO NOTHING;
