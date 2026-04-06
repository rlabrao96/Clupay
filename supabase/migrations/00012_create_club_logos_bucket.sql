-- Create a public storage bucket for club logos
INSERT INTO storage.buckets (id, name, public) VALUES ('club-logos', 'club-logos', true);

-- Allow authenticated users to upload/update/delete
CREATE POLICY "Club admins can upload logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'club-logos');

CREATE POLICY "Public read access for logos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'club-logos');

CREATE POLICY "Club admins can update logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'club-logos');

CREATE POLICY "Club admins can delete logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'club-logos');
