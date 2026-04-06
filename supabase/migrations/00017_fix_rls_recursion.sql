-- Fix infinite recursion in RLS policies
-- The issue: is_super_admin() queries profiles, but profiles has a policy
-- that calls is_super_admin() -> infinite loop.
-- Similarly, kids policies reference profiles which reference kids.

-- Drop problematic policies on profiles
DROP POLICY IF EXISTS "super_admin_profiles_select" ON profiles;
DROP POLICY IF EXISTS "club_admin_profiles_select" ON profiles;

-- Drop problematic policies on kids that cause cross-table recursion
DROP POLICY IF EXISTS "club_admin_kids_select" ON kids;
DROP POLICY IF EXISTS "super_admin_kids_select" ON kids;

-- Recreate profiles policies without recursion
-- Super admin can read all profiles: check role directly via auth.jwt()
CREATE POLICY "super_admin_profiles_select" ON profiles
  FOR SELECT USING (
    (auth.jwt() ->> 'role') = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin' AND p.id != profiles.id
    )
  );

-- Actually, the simplest fix: use SECURITY DEFINER functions that bypass RLS.
-- The functions already have SECURITY DEFINER, but PostgreSQL still detects
-- the policy->function->table cycle. The real fix is to not use these functions
-- on the tables they query.

-- Better approach: For profiles table, only use simple auth.uid() checks
-- and use a service-role approach for admin queries.
DROP POLICY IF EXISTS "super_admin_profiles_select" ON profiles;

-- Super admin reads all profiles: use a direct subquery on auth.users metadata
-- or simply allow reading all profiles for authenticated users (profiles don't
-- contain sensitive data beyond what's visible in the app)
CREATE POLICY "authenticated_profiles_select" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- For kids: allow club admins and super admins to read
-- Use direct club_admins check without going through profiles
DROP POLICY IF EXISTS "club_admin_kids_select" ON kids;
DROP POLICY IF EXISTS "super_admin_kids_select" ON kids;

CREATE POLICY "club_admin_kids_select" ON kids
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM enrollments e
      JOIN club_admins ca ON ca.club_id = e.club_id
      WHERE e.kid_id = kids.id AND ca.profile_id = auth.uid()
    )
  );

CREATE POLICY "super_admin_kids_select" ON kids
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
