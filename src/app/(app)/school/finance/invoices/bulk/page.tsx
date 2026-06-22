import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BulkInvoiceForm } from './_form'

// ─── Page ─────────────────────────────────────────────────────────────────────
// Two-step:
// Step 1 (no ?class_id): class selection via GET form
// Step 2 (?class_id=xxx): show confirmation form with enrolled count + fee items

type Props = {
  searchParams: { class_id?: string }
}

export default async function BulkInvoicePage({ searchParams }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/school')

  const schoolId = (membership as { school_id: string }).school_id

  // ── Step 1: class selection ─────────────────────────────────────────────────

  if (!searchParams.class_id) {
    // Fetch classes grouped by academic year
    const { data: classesRaw } = await supabase
      .from('classes')
      .select('id, name, section, academic_years!academic_year_id(id, name)')
      .eq('school_id', schoolId)
      .order('name')

    type ClassOption = {
      id: string
      name: string
      section: string | null
      academic_years: { id: string; name: string }
    }
    const classes = (classesRaw ?? []) as unknown as ClassOption[]

    // Group by academic year for <optgroup>
    const yearMap = new Map<string, { yearName: string; classes: ClassOption[] }>()
    for (const cls of classes) {
      const yr = cls.academic_years
      if (!yearMap.has(yr.id)) yearMap.set(yr.id, { yearName: yr.name, classes: [] })
      yearMap.get(yr.id)!.classes.push(cls)
    }
    const years = Array.from(yearMap.values())

    return (
      <div className="space-y-6">
        <div className="rounded-xl bg-primary-800 px-6 py-5">
          <div className="mb-1">
            <a href="/school/finance/invoices" className="text-primary-300 hover:text-white text-sm">
              ← Factures
            </a>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Facturation par classe</h1>
          <p className="text-primary-300 text-sm mt-0.5">
            Générez des factures pour tous les élèves actifs d&apos;une classe
          </p>
        </div>

        <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
          {classes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-base font-semibold text-gray-700">Aucune classe disponible</p>
              <p className="mt-1 text-sm text-gray-500">
                Créez des classes et inscrivez des élèves avant de lancer la facturation groupée.
              </p>
              <a
                href="/school/classes/new"
                className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
              >
                Créer une classe
              </a>
            </div>
          ) : (
            <form method="GET" action="/school/finance/invoices/bulk" className="space-y-5">
              <div>
                <label htmlFor="class_id" className="block text-sm font-medium text-gray-700 mb-1">
                  Sélectionnez une classe <span className="text-red-500">*</span>
                </label>
                <select
                  id="class_id"
                  name="class_id"
                  defaultValue=""
                  required
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                >
                  <option value="">— Choisir une classe —</option>
                  {years.map((yr) => (
                    <optgroup key={yr.yearName} label={yr.yearName}>
                      {yr.classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {[cls.name, cls.section].filter(Boolean).join(' — ')}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="inline-flex justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 transition-colors"
              >
                Continuer →
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  // ── Step 2: confirmation form ───────────────────────────────────────────────

  // Fetch class info + academic year
  const { data: classRaw } = await supabase
    .from('classes')
    .select('id, name, section, academic_year_id, academic_years!academic_year_id(name)')
    .eq('id', searchParams.class_id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!classRaw) redirect('/school/finance/invoices/bulk')

  type ClassDetail = {
    id: string
    name: string
    section: string | null
    academic_year_id: string
    academic_years: { name: string }
  }
  const cls = classRaw as unknown as ClassDetail

  // Enrolled active student count
  const { count: enrolledCount } = await supabase
    .from('student_class_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', cls.id)
    .eq('school_id', schoolId)
    .eq('academic_year_id', cls.academic_year_id)
    .eq('status', 'active')

  // Active fee items for this school
  const { data: feeItemsRaw } = await supabase
    .from('fee_items')
    .select('id, name, amount, description')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .order('name')

  const feeItems = (feeItemsRaw ?? []) as { id: string; name: string; amount: number; description: string | null }[]

  const className      = [cls.name, cls.section].filter(Boolean).join(' — ')
  const academicYearName = cls.academic_years.name
  const defaultTitle   = `Frais – ${className}`
  const count          = enrolledCount ?? 0

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/finance/invoices/bulk" className="text-primary-300 hover:text-white text-sm">
            ← Changer de classe
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Facturation par classe</h1>
        <p className="text-primary-300 text-sm mt-0.5">
          {className} · {academicYearName}
        </p>
      </div>

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <BulkInvoiceForm
          classId={cls.id}
          className={className}
          academicYearName={academicYearName}
          enrolledCount={count}
          feeItems={feeItems}
          defaultTitle={defaultTitle}
        />
      </div>

    </div>
  )
}
