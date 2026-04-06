-- Change invitation expiry default from 30 days to 10 days
ALTER TABLE invitations
  ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '10 days');
