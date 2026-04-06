CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  frequency TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_plans_sport_id ON plans(sport_id);
