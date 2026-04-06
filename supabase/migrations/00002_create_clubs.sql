CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  billing_day INTEGER NOT NULL DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28),
  platform_fee_fixed INTEGER NOT NULL DEFAULT 0,
  platform_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clubs_updated_at
  BEFORE UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
