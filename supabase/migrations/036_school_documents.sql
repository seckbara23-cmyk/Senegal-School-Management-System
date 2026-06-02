-- =============================================================================
-- Migration 036: School documents (Phase 47)
--
-- Secure document/file management for student / teacher / admission records.
--
-- Security model (important):
--   * Files live in a PRIVATE storage bucket 'school-documents'. A private
--     bucket with no storage.objects policies denies all access via anon /
--     authenticated JWTs by default — only the service_role can read/write.
--   * ALL file operations go through server actions that first verify the caller
--     is an active school_admin of the owning school, then use the service-role
--     client to upload / sign / delete. Viewing is via short-lived signed URLs.
--   * This metadata table holds the row-level record. Its RLS is admin-only
--     (applicant/student/teacher PII), mirroring admissions (035).
--
-- owner_type/owner_id is polymorphic (students | teachers | admission_
-- applications); no FK is possible, so ownership is validated in the action.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.school_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('student', 'teacher', 'admission')),
  owner_id      UUID NOT NULL,
  document_type TEXT NOT NULL,
  filename      TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT,
  uploaded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE public.school_documents ENABLE ROW LEVEL SECURITY;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_school_documents_school_id ON public.school_documents(school_id);
CREATE INDEX IF NOT EXISTS idx_school_documents_owner     ON public.school_documents(school_id, owner_type, owner_id);

-- ─── RLS: admin-only (manage policies also grant read) ─────────────────────────
DROP POLICY IF EXISTS "School admins can manage documents" ON public.school_documents;
CREATE POLICY "School admins can manage documents" ON public.school_documents
  FOR ALL USING (
    public.has_school_role(school_id, ARRAY['school_admin'])
  );

DROP POLICY IF EXISTS "Super admin can manage all documents" ON public.school_documents;
CREATE POLICY "Super admin can manage all documents" ON public.school_documents
  FOR ALL USING (public.is_super_admin());

-- ─── RESTRICTIVE active-school write gate (consistent with migration 025/032) ──
DROP POLICY IF EXISTS active_school_required_insert ON public.school_documents;
CREATE POLICY active_school_required_insert ON public.school_documents
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_update ON public.school_documents;
CREATE POLICY active_school_required_update ON public.school_documents
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_school_active(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_delete ON public.school_documents;
CREATE POLICY active_school_required_delete ON public.school_documents
  AS RESTRICTIVE FOR DELETE
  USING (public.is_school_active(school_id) OR public.is_super_admin());

-- ─── Private storage bucket ────────────────────────────────────────────────────
-- Created here for convenience; you can also create it via the Storage UI
-- (name: school-documents, Public: OFF). file_size_limit + allowed_mime_types
-- add a storage-layer cap on top of the in-action validation.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'school-documents',
  'school-documents',
  false,
  10485760, -- 10 MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- No storage.objects policies are created: a private bucket denies all
-- anon/authenticated access by default, and every file op runs through the
-- service-role client behind an app-layer school_admin check.
