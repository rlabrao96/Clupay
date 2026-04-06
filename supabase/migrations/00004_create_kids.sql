CREATE TABLE kids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  last_names TEXT NOT NULL,
  rut TEXT NOT NULL UNIQUE,
  date_of_birth DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER kids_updated_at
  BEFORE UPDATE ON kids
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_kids_parent_id ON kids(parent_id);
CREATE INDEX idx_kids_rut ON kids(rut);
