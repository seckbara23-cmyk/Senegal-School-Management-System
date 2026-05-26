-- Migration 015: add cancellation metadata columns to student_invoices
ALTER TABLE public.student_invoices
  ADD COLUMN IF NOT EXISTS cancelled_at        TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cancelled_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
