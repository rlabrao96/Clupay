CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES profiles(id),
  email TEXT,
  phone TEXT,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status invitation_status NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invitation_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX idx_invitations_club_id ON invitations(club_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_phone ON invitations(phone);
