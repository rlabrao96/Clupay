-- Create club_parents table
CREATE TABLE club_parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_club_parents_unique ON club_parents(club_id, parent_id);
CREATE INDEX idx_club_parents_club_id ON club_parents(club_id);
CREATE INDEX idx_club_parents_parent_id ON club_parents(parent_id);

-- Enable RLS
ALTER TABLE club_parents ENABLE ROW LEVEL SECURITY;

-- Parents can read their own club associations
CREATE POLICY "parent_club_parents_select" ON club_parents
  FOR SELECT USING (parent_id = auth.uid());

-- Parents can insert their own club association (for invitation acceptance)
CREATE POLICY "parent_club_parents_insert" ON club_parents
  FOR INSERT WITH CHECK (parent_id = auth.uid());

-- Club admins can read club_parents for their club
CREATE POLICY "club_admin_club_parents_select" ON club_parents
  FOR SELECT USING (is_club_admin(club_id));

-- Super admins can do everything
CREATE POLICY "super_admin_club_parents_all" ON club_parents
  FOR ALL USING (is_super_admin());
