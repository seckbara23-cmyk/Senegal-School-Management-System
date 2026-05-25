-- ─── Migration 010: add missing columns to parents & parent_student_links ─────
--
-- Both tables exist from migration 001 with full RLS (fixed in 002).
-- This migration adds the columns required for the Phase 1 parent UI:
--   parents.address, parents.occupation
--   parent_student_links.is_primary_contact

ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS address    TEXT,
  ADD COLUMN IF NOT EXISTS occupation TEXT;

ALTER TABLE public.parent_student_links
  ADD COLUMN IF NOT EXISTS is_primary_contact BOOLEAN DEFAULT false NOT NULL;
