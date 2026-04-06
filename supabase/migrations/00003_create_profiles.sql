CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  last_names TEXT NOT NULL,
  rut TEXT NOT NULL UNIQUE,
  date_of_birth DATE NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'parent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_profiles_rut ON profiles(rut);
CREATE INDEX idx_profiles_role ON profiles(role);
