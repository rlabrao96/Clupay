CREATE TABLE sports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER sports_updated_at
  BEFORE UPDATE ON sports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_sports_club_id ON sports(club_id);
