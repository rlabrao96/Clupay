-- Allow parents to view sports for clubs where they have a pending invitation
CREATE POLICY "parent_sports_select_invitation" ON sports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM invitations i
      WHERE i.club_id = sports.club_id
      AND i.email = (SELECT email FROM profiles WHERE id = auth.uid())
      AND i.status = 'pending'
    )
  );

-- Allow parents to view clubs they're associated with via club_parents
CREATE POLICY "parent_clubs_select_member" ON clubs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM club_parents cp
      WHERE cp.club_id = clubs.id AND cp.parent_id = auth.uid()
    )
  );

-- Allow parents with invitations to also view the club
CREATE POLICY "parent_clubs_select_invitation" ON clubs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM invitations i
      WHERE i.club_id = clubs.id
      AND i.email = (SELECT email FROM profiles WHERE id = auth.uid())
      AND i.status = 'pending'
    )
  );

-- Allow parents who are club members to view sports
CREATE POLICY "parent_sports_select_member" ON sports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM club_parents cp
      WHERE cp.club_id = sports.club_id AND cp.parent_id = auth.uid()
    )
  );

-- Allow parents who are club members to view plans
CREATE POLICY "parent_plans_select_member" ON plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sports s
      JOIN club_parents cp ON cp.club_id = s.club_id
      WHERE s.id = plans.sport_id AND cp.parent_id = auth.uid()
    )
  );

-- Allow parents to update invitations they're accepting (matching their email)
CREATE POLICY "parent_invitations_update" ON invitations
  FOR UPDATE USING (
    email = (SELECT email FROM profiles WHERE id = auth.uid())
  );
