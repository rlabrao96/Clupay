CREATE TABLE club_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_club_admins_unique ON club_admins(club_id, profile_id);
CREATE INDEX idx_club_admins_club_id ON club_admins(club_id);
CREATE INDEX idx_club_admins_profile_id ON club_admins(profile_id);
