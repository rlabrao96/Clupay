-- Fix infinite recursion: kids -> enrollments -> kids
-- Replace the club_admin_kids_select policy with a SECURITY DEFINER function
-- that bypasses RLS on the inner query, breaking the cycle.

CREATE OR REPLACE FUNCTION is_club_admin_for_kid(kid_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM enrollments e
    JOIN club_admins ca ON ca.club_id = e.club_id
    WHERE e.kid_id = is_club_admin_for_kid.kid_id
    AND ca.profile_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Drop the old policy that causes recursion
DROP POLICY IF EXISTS "club_admin_kids_select" ON kids;

-- Recreate using the SECURITY DEFINER function
CREATE POLICY "club_admin_kids_select" ON kids
  FOR SELECT USING (is_club_admin_for_kid(id));
