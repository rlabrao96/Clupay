-- ============================================================
-- SEED DATA: Test accounts + sample club/sport/plan/enrollment
-- Run with: npx supabase db execute --file supabase/seed.sql
-- ============================================================

-- 1. Create test users in auth.users
-- Passwords are all: test1234
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'admin@clupay.test',
    crypt('test1234', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{}', 'authenticated', 'authenticated'
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'club@clupay.test',
    crypt('test1234', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{}', 'authenticated', 'authenticated'
  ),
  (
    'c0000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'parent@clupay.test',
    crypt('test1234', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{}', 'authenticated', 'authenticated'
  )
ON CONFLICT (id) DO NOTHING;

-- Insert identities (required for email auth to work)
INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'admin@clupay.test',
    'email',
    jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'email', 'admin@clupay.test'),
    now(), now(), now()
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000002',
    'club@clupay.test',
    'email',
    jsonb_build_object('sub', 'b0000000-0000-0000-0000-000000000002', 'email', 'club@clupay.test'),
    now(), now(), now()
  ),
  (
    'c0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000003',
    'parent@clupay.test',
    'email',
    jsonb_build_object('sub', 'c0000000-0000-0000-0000-000000000003', 'email', 'parent@clupay.test'),
    now(), now(), now()
  )
ON CONFLICT (id) DO NOTHING;

-- 2. Create profiles
INSERT INTO profiles (id, name, last_names, rut, date_of_birth, email, phone, role)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Admin', 'CluPay', '111111111', '1990-01-01', 'admin@clupay.test', '+56912345678', 'super_admin'),
  ('b0000000-0000-0000-0000-000000000002', 'Carlos', 'González Muñoz', '123456785', '1985-06-15', 'club@clupay.test', '+56987654321', 'club_admin'),
  ('c0000000-0000-0000-0000-000000000003', 'María', 'Pérez López', '76543216', '1988-03-22', 'parent@clupay.test', '+56911223344', 'parent')
ON CONFLICT (id) DO NOTHING;

-- 3. Create a sample club
INSERT INTO clubs (id, name, contact_email, contact_phone, billing_day, platform_fee_fixed, platform_fee_percent)
VALUES
  ('d0000000-0000-0000-0000-000000000004', 'Academia Deportiva Santiago', 'contacto@academiadep.cl', '+56922334455', 1, 50000, 2.50)
ON CONFLICT (id) DO NOTHING;

-- 4. Assign club admin
INSERT INTO club_admins (club_id, profile_id)
VALUES ('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002')
ON CONFLICT (club_id, profile_id) DO NOTHING;

-- 5. Create sample sports
INSERT INTO sports (id, club_id, name, description)
VALUES
  ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000004', 'Fútbol', 'Escuela de fútbol para niños y jóvenes'),
  ('e0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000004', 'Natación', 'Clases de natación todos los niveles')
ON CONFLICT (id) DO NOTHING;

-- 6. Create sample plans
INSERT INTO plans (id, sport_id, name, description, price, frequency)
VALUES
  ('f0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000005', 'Fútbol 3x/semana', 'Entrena 3 veces por semana', 45000, '3x/semana'),
  ('f0000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000005', 'Fútbol 5x/semana', 'Entrena 5 veces por semana', 60000, '5x/semana'),
  ('f0000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000006', 'Natación 2x/semana', 'Clases 2 veces por semana', 30000, '2x/semana')
ON CONFLICT (id) DO NOTHING;

-- 7. Create sample kids
INSERT INTO kids (id, parent_id, name, last_names, rut, date_of_birth)
VALUES
  ('10000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000003', 'Juan', 'Pérez López', '223344556', '2015-08-10'),
  ('10000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000003', 'Sofía', 'Pérez López', '334455667', '2017-11-25')
ON CONFLICT (id) DO NOTHING;

-- 8. Create enrollments
INSERT INTO enrollments (kid_id, club_id, sport_id, plan_id, status)
VALUES
  ('10000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000007', 'active'),
  ('10000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000009', 'active'),
  ('10000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000008', 'active')
ON CONFLICT DO NOTHING;
