-- ─── Migration 012: school finance — fee items, invoices, payments ───────────
--
-- Four tables forming the core finance workflow:
--   fee_items         → reusable fee catalog for the school
--   student_invoices  → one invoice per student (tracks amount_paid + status)
--   invoice_lines     → line items on an invoice (linked to fee_items or ad-hoc)
--   student_payments  → manual payment records; each updates the parent invoice

-- ─── fee_items ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fee_items (
  id               UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        UUID    REFERENCES public.schools(id)        ON DELETE CASCADE NOT NULL,
  academic_year_id UUID    REFERENCES public.academic_years(id) ON DELETE SET NULL,
  name             TEXT    NOT NULL,
  description      TEXT,
  amount           NUMERIC(12, 0) NOT NULL CHECK (amount >= 0),
  due_date         DATE,
  is_active        BOOLEAN DEFAULT true NOT NULL,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.fee_items ENABLE ROW LEVEL SECURITY;

-- ─── student_invoices ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_invoices (
  id               UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        UUID    REFERENCES public.schools(id)        ON DELETE CASCADE NOT NULL,
  student_id       UUID    REFERENCES public.students(id)       ON DELETE CASCADE NOT NULL,
  academic_year_id UUID    REFERENCES public.academic_years(id) ON DELETE SET NULL,
  invoice_number   TEXT    NOT NULL,
  title            TEXT    NOT NULL,
  total_amount     NUMERIC(12, 0) NOT NULL CHECK (total_amount >= 0),
  amount_paid      NUMERIC(12, 0) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status           TEXT    NOT NULL DEFAULT 'unpaid'
                     CHECK (status IN ('unpaid', 'partial', 'paid', 'cancelled')),
  due_date         DATE,
  created_by       UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT student_invoices_number_school_unique UNIQUE(school_id, invoice_number)
);

ALTER TABLE public.student_invoices ENABLE ROW LEVEL SECURITY;

-- ─── invoice_lines ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id   UUID    REFERENCES public.schools(id)         ON DELETE CASCADE NOT NULL,
  invoice_id  UUID    REFERENCES public.student_invoices(id) ON DELETE CASCADE NOT NULL,
  fee_item_id UUID    REFERENCES public.fee_items(id)        ON DELETE SET NULL,
  description TEXT    NOT NULL,
  amount      NUMERIC(12, 0) NOT NULL CHECK (amount >= 0),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

-- ─── student_payments ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_payments (
  id             UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id      UUID    REFERENCES public.schools(id)         ON DELETE CASCADE NOT NULL,
  student_id     UUID    REFERENCES public.students(id)        ON DELETE CASCADE NOT NULL,
  invoice_id     UUID    REFERENCES public.student_invoices(id) ON DELETE SET NULL,
  amount         NUMERIC(12, 0) NOT NULL CHECK (amount > 0),
  payment_method TEXT    NOT NULL DEFAULT 'cash'
                   CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'wave_manual', 'orange_money_manual', 'other')),
  reference      TEXT,
  paid_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes          TEXT,
  created_by     UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.student_payments ENABLE ROW LEVEL SECURITY;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fee_items_school_id
  ON public.fee_items(school_id);

CREATE INDEX IF NOT EXISTS idx_student_invoices_school_id
  ON public.student_invoices(school_id);

CREATE INDEX IF NOT EXISTS idx_student_invoices_student_id
  ON public.student_invoices(student_id);

CREATE INDEX IF NOT EXISTS idx_student_invoices_status
  ON public.student_invoices(school_id, status);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id
  ON public.invoice_lines(invoice_id);

CREATE INDEX IF NOT EXISTS idx_student_payments_school_id
  ON public.student_payments(school_id);

CREATE INDEX IF NOT EXISTS idx_student_payments_invoice_id
  ON public.student_payments(invoice_id);

CREATE INDEX IF NOT EXISTS idx_student_payments_student_id
  ON public.student_payments(student_id);

-- ─── updated_at triggers ──────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_fee_items_updated_at ON public.fee_items;
CREATE TRIGGER trg_fee_items_updated_at
  BEFORE UPDATE ON public.fee_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_student_invoices_updated_at ON public.student_invoices;
CREATE TRIGGER trg_student_invoices_updated_at
  BEFORE UPDATE ON public.student_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── RLS: fee_items ───────────────────────────────────────────────────────────

CREATE POLICY "School members can view fee items"
  ON public.fee_items FOR SELECT USING (
    public.is_school_member(school_id) OR public.is_super_admin()
  );

CREATE POLICY "School admins can manage fee items"
  ON public.fee_items FOR ALL USING (
    public.has_school_role(school_id, ARRAY['school_admin'])
  );

CREATE POLICY "Super admin can manage all fee items"
  ON public.fee_items FOR ALL USING (public.is_super_admin());

-- ─── RLS: student_invoices ────────────────────────────────────────────────────

CREATE POLICY "School members can view invoices"
  ON public.student_invoices FOR SELECT USING (
    public.is_school_member(school_id) OR public.is_super_admin()
  );

CREATE POLICY "School admins can manage invoices"
  ON public.student_invoices FOR ALL USING (
    public.has_school_role(school_id, ARRAY['school_admin'])
  );

CREATE POLICY "Super admin can manage all invoices"
  ON public.student_invoices FOR ALL USING (public.is_super_admin());

-- ─── RLS: invoice_lines ───────────────────────────────────────────────────────

CREATE POLICY "School members can view invoice lines"
  ON public.invoice_lines FOR SELECT USING (
    public.is_school_member(school_id) OR public.is_super_admin()
  );

CREATE POLICY "School admins can manage invoice lines"
  ON public.invoice_lines FOR ALL USING (
    public.has_school_role(school_id, ARRAY['school_admin'])
  );

CREATE POLICY "Super admin can manage all invoice lines"
  ON public.invoice_lines FOR ALL USING (public.is_super_admin());

-- ─── RLS: student_payments ────────────────────────────────────────────────────

CREATE POLICY "School members can view payments"
  ON public.student_payments FOR SELECT USING (
    public.is_school_member(school_id) OR public.is_super_admin()
  );

CREATE POLICY "School admins can manage payments"
  ON public.student_payments FOR ALL USING (
    public.has_school_role(school_id, ARRAY['school_admin'])
  );

CREATE POLICY "Super admin can manage all payments"
  ON public.student_payments FOR ALL USING (public.is_super_admin());
