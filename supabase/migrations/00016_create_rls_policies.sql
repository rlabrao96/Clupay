-- Enable RLS on all tables
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kids ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_club_admin(check_club_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM club_admins
    WHERE club_id = check_club_id AND profile_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- CLUBS
CREATE POLICY "super_admin_clubs_all" ON clubs FOR ALL USING (is_super_admin());
CREATE POLICY "club_admin_clubs_select" ON clubs FOR SELECT USING (is_club_admin(id));
CREATE POLICY "parent_clubs_select" ON clubs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM enrollments e JOIN kids k ON k.id = e.kid_id
    WHERE e.club_id = clubs.id AND k.parent_id = auth.uid()
  )
);

-- PROFILES
CREATE POLICY "own_profile_select" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "own_profile_update" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "super_admin_profiles_select" ON profiles FOR SELECT USING (is_super_admin());
CREATE POLICY "club_admin_profiles_select" ON profiles FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM kids k JOIN enrollments e ON e.kid_id = k.id
    JOIN club_admins ca ON ca.club_id = e.club_id
    WHERE k.parent_id = profiles.id AND ca.profile_id = auth.uid()
  )
);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (id = auth.uid());

-- KIDS
CREATE POLICY "parent_kids_all" ON kids FOR ALL USING (parent_id = auth.uid());
CREATE POLICY "club_admin_kids_select" ON kids FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM enrollments e JOIN club_admins ca ON ca.club_id = e.club_id
    WHERE e.kid_id = kids.id AND ca.profile_id = auth.uid()
  )
);
CREATE POLICY "super_admin_kids_select" ON kids FOR SELECT USING (is_super_admin());

-- SPORTS
CREATE POLICY "club_admin_sports_all" ON sports FOR ALL USING (is_club_admin(club_id));
CREATE POLICY "parent_sports_select" ON sports FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM enrollments e JOIN kids k ON k.id = e.kid_id
    WHERE e.club_id = sports.club_id AND k.parent_id = auth.uid()
  )
);
CREATE POLICY "super_admin_sports_select" ON sports FOR SELECT USING (is_super_admin());

-- PLANS
CREATE POLICY "club_admin_plans_all" ON plans FOR ALL USING (
  EXISTS (SELECT 1 FROM sports s WHERE s.id = plans.sport_id AND is_club_admin(s.club_id))
);
CREATE POLICY "parent_plans_select" ON plans FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM sports s JOIN enrollments e ON e.club_id = s.club_id
    JOIN kids k ON k.id = e.kid_id
    WHERE s.id = plans.sport_id AND k.parent_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM sports s JOIN invitations i ON i.club_id = s.club_id
    WHERE s.id = plans.sport_id AND (i.email = (SELECT email FROM profiles WHERE id = auth.uid()))
  )
);
CREATE POLICY "super_admin_plans_select" ON plans FOR SELECT USING (is_super_admin());

-- ENROLLMENTS
CREATE POLICY "parent_enrollments_select" ON enrollments FOR SELECT USING (
  EXISTS (SELECT 1 FROM kids WHERE id = enrollments.kid_id AND parent_id = auth.uid())
);
CREATE POLICY "parent_enrollments_insert" ON enrollments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM kids WHERE id = enrollments.kid_id AND parent_id = auth.uid())
);
CREATE POLICY "club_admin_enrollments_all" ON enrollments FOR ALL USING (is_club_admin(club_id));
CREATE POLICY "super_admin_enrollments_select" ON enrollments FOR SELECT USING (is_super_admin());

-- INVOICES
CREATE POLICY "parent_invoices_select" ON invoices FOR SELECT USING (parent_id = auth.uid());
CREATE POLICY "club_admin_invoices_all" ON invoices FOR ALL USING (is_club_admin(club_id));
CREATE POLICY "super_admin_invoices_select" ON invoices FOR SELECT USING (is_super_admin());

-- INVOICE ITEMS
CREATE POLICY "parent_invoice_items_select" ON invoice_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM invoices WHERE id = invoice_items.invoice_id AND parent_id = auth.uid())
);
CREATE POLICY "club_admin_invoice_items_select" ON invoice_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND is_club_admin(i.club_id))
);
CREATE POLICY "super_admin_invoice_items_select" ON invoice_items FOR SELECT USING (is_super_admin());

-- PAYMENTS
CREATE POLICY "parent_payments_select" ON payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM invoices WHERE id = payments.invoice_id AND parent_id = auth.uid())
);
CREATE POLICY "club_admin_payments_all" ON payments FOR ALL USING (
  EXISTS (SELECT 1 FROM invoices i WHERE i.id = payments.invoice_id AND is_club_admin(i.club_id))
);
CREATE POLICY "super_admin_payments_select" ON payments FOR SELECT USING (is_super_admin());

-- DISCOUNTS
CREATE POLICY "club_admin_discounts_all" ON discounts FOR ALL USING (is_club_admin(club_id));
CREATE POLICY "parent_discounts_select" ON discounts FOR SELECT USING (
  parent_id = auth.uid()
  OR EXISTS (SELECT 1 FROM kids WHERE id = discounts.kid_id AND parent_id = auth.uid())
);
CREATE POLICY "super_admin_discounts_select" ON discounts FOR SELECT USING (is_super_admin());

-- NOTIFICATIONS
CREATE POLICY "parent_notifications_select" ON notifications FOR SELECT USING (parent_id = auth.uid());
CREATE POLICY "super_admin_notifications_select" ON notifications FOR SELECT USING (is_super_admin());

-- PLATFORM BILLING
CREATE POLICY "super_admin_platform_billing_all" ON platform_billing FOR ALL USING (is_super_admin());
CREATE POLICY "club_admin_platform_billing_select" ON platform_billing FOR SELECT USING (is_club_admin(club_id));

-- INVITATIONS
CREATE POLICY "club_admin_invitations_all" ON invitations FOR ALL USING (is_club_admin(club_id));
CREATE POLICY "parent_invitations_select" ON invitations FOR SELECT USING (
  email = (SELECT email FROM profiles WHERE id = auth.uid())
  OR phone = (SELECT phone FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "super_admin_invitations_select" ON invitations FOR SELECT USING (is_super_admin());

-- CLUB ADMINS
CREATE POLICY "super_admin_club_admins_all" ON club_admins FOR ALL USING (is_super_admin());
CREATE POLICY "club_admin_club_admins_select" ON club_admins FOR SELECT USING (is_club_admin(club_id));
