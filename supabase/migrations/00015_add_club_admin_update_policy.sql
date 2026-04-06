-- Allow club admins to update their own club
CREATE POLICY "club_admin_clubs_update"
ON clubs FOR UPDATE TO authenticated
USING (is_club_admin(id))
WITH CHECK (is_club_admin(id));
