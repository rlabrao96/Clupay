CREATE TYPE import_batch_status AS ENUM ('pending', 'completed');

CREATE TABLE import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  status import_batch_status NOT NULL DEFAULT 'pending',
  rows_total INT NOT NULL DEFAULT 0,
  rows_imported INT NOT NULL DEFAULT 0,
  rows_skipped INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_import_batches_club_id ON import_batches(club_id);

CREATE TABLE import_batch_kids (
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  kid_id UUID NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, kid_id)
);

CREATE INDEX idx_import_batch_kids_kid_id ON import_batch_kids(kid_id);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batch_kids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_admin_import_batches_all" ON import_batches
  FOR ALL USING (is_club_admin(club_id));

CREATE POLICY "super_admin_import_batches_all" ON import_batches
  FOR ALL USING (is_super_admin());

CREATE POLICY "club_admin_import_batch_kids_all" ON import_batch_kids
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM import_batches ib
      WHERE ib.id = batch_id AND is_club_admin(ib.club_id)
    )
  );

CREATE POLICY "super_admin_import_batch_kids_all" ON import_batch_kids
  FOR ALL USING (is_super_admin());
