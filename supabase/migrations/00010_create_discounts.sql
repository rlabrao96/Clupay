CREATE TABLE discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES profiles(id),
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type discount_type NOT NULL,
  value NUMERIC(10,2) NOT NULL,
  duration discount_duration NOT NULL DEFAULT 'until_removed',
  remaining_months INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT discount_target CHECK (kid_id IS NOT NULL OR parent_id IS NOT NULL)
);

CREATE TRIGGER discounts_updated_at
  BEFORE UPDATE ON discounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_discounts_club_id ON discounts(club_id);
CREATE INDEX idx_discounts_kid_id ON discounts(kid_id);
CREATE INDEX idx_discounts_parent_id ON discounts(parent_id);
CREATE INDEX idx_discounts_is_active ON discounts(is_active) WHERE is_active = true;
