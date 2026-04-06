CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL DEFAULT 'email',
  type notification_type NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  status notification_status NOT NULL DEFAULT 'scheduled',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_parent_id ON notifications(parent_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_scheduled_at ON notifications(scheduled_at)
  WHERE status = 'scheduled';
