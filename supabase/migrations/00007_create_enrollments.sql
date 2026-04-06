CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id UUID NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  status enrollment_status NOT NULL DEFAULT 'active',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER enrollments_updated_at
  BEFORE UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_enrollments_kid_id ON enrollments(kid_id);
CREATE INDEX idx_enrollments_club_id ON enrollments(club_id);
CREATE INDEX idx_enrollments_sport_id ON enrollments(sport_id);
CREATE INDEX idx_enrollments_plan_id ON enrollments(plan_id);

CREATE UNIQUE INDEX idx_enrollments_unique
  ON enrollments(kid_id, sport_id, plan_id)
  WHERE status = 'active';
