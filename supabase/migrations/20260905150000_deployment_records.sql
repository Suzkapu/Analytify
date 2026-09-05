-- Migration: Add deployment_records table to track component release revisions
CREATE TABLE IF NOT EXISTS public.deployment_records (
  component TEXT PRIMARY KEY,
  commit_sha TEXT NOT NULL,
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.deployment_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to deployment records" ON public.deployment_records;
CREATE POLICY "Allow public read access to deployment records"
  ON public.deployment_records FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow service role management of deployment records" ON public.deployment_records;
CREATE POLICY "Allow service role management of deployment records"
  ON public.deployment_records FOR ALL TO service_role USING (true) WITH CHECK (true);
