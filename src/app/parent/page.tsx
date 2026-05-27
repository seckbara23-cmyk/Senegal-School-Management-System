import { requireParentCtx } from './_auth'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return n.toLocaleString('fr-SN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' FCFA'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-SN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const AUDIENCE_LABELS: Record<string, string> = {
  all_school: 'École',
  parents:    'Parents',
  students:   'Élèves',
  staff:      'Personnel',
  class:      'Classe',
}

const AUDIENCE_COLORS: Record<string, string> = {
  all_school: 'bg-primary-100 text-primary-700',
  parents:    'bg-accent-100 text-accent-700',
  students:   'bg-emerald-100 text-emerald-700',
  staff:      'bg-gray-100 text-gray-600',
  class:      'bg-sky-100 text-sky-700',
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ParentDashboard() {
  const { supabase, schoolId, schoolName, parent } = await requireParentCtx()

  // Linked children
  const { data: linksData } = await supabase
    .from('parent_student_links')
    .select('student_id, relationship, students!student_id(id, first_name, last_name, admission_number, status)')
    .eq('parent_id', parent.id)

  type ChildRow = {
    student_id: string
    relationship: string
    students: { id: string; first_name: string; last_name: string; admission_number: string; status: string }
  }
  const links = (linksData ?? []) as unknown as ChildRow[]
  const childIds = links.map((l) => l.student_id)

  // Finance summary per child: outstanding balance
  type InvoiceRow = { student_id: string; total_amount: number; amount_paid: number; status: string }
  let invoices: InvoiceRow[] = []
  if (childIds.length > 0) {
    const { data } = await supabase
      .from('student_invoices')
      .select('student_id, total_amount, amount_paid, status')
      .eq('school_id', schoolId)
      .in('student_id', childIds)
      .in('status', ['unpaid', 'partial'])
    invoices = (data ?? []) as InvoiceRow[]
  }

  // Outstanding per student_id
  const outstanding = new Map<string, number>()
  for (const inv of invoices) {
    const due = inv.total_amount - inv.amount_paid
    outstanding.set(inv.student_id, (outstanding.get(inv.student_id) ?? 0) + due)
  }

  // Recent announcements (all_school + parents)
  const { data: announcements } = await supabase
    .from('announcements')
    .select('id, title, body, audience_type, created_at')
    .eq('school_id', schoolId)
    .in('audience_type', ['all_school', 'parents'])
    .order('created_at', { ascending: false })
    .limit(3)

  return (
    <div className="space-y-6 pb-8">

      {/* ── Greeting header ──────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <p className="text-sm text-primary-300">Portail Parent · {schoolName}</p>
        <h1 className="mt-1 text-2xl font-bold text-white">
          Bonjour, {parent.first_name} 👋
        </h1>
        <p className="mt-0.5 text-sm text-primary-200">
          {links.length} enfant{links.length !== 1 ? 's' : ''} lié{links.length !== 1 ? 's' : ''} à votre compte
        </p>
      </div>

      {/* ── Children cards ───────────────────────────────────────────────────── */}
      {links.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun enfant lié</p>
          <p className="mt-1 text-sm text-gray-400">Contactez l&apos;administrateur de l&apos;école.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {links.map((link) => {
            const s = link.students
            const due = outstanding.get(link.student_id) ?? 0
            return (
              <div key={link.student_id} className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
                <div className="h-1.5 bg-primary-600" />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-gray-900">{s.last_name} {s.first_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">N° {s.admission_number}</p>
                    </div>
                    {due > 0 && (
                      <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                        {fmtCurrency(due)}
                      </span>
                    )}
                    {due === 0 && invoices.length > 0 && (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        À jour
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a href={`/parent/bulletins?child=${s.id}`}
                      className="rounded-md bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100 transition-colors">
                      Bulletins
                    </a>
                    <a href={`/parent/attendance?child=${s.id}`}
                      className="rounded-md bg-sand-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-sand-200 transition-colors">
                      Présences
                    </a>
                    <a href={`/parent/finance?child=${s.id}`}
                      className="rounded-md bg-sand-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-sand-200 transition-colors">
                      Finance
                    </a>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Recent announcements ─────────────────────────────────────────────── */}
      {announcements && announcements.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Annonces récentes
            </h2>
            <a href="/parent/announcements" className="text-xs font-medium text-primary-600 hover:underline">
              Toutes les annonces →
            </a>
          </div>
          <div className="space-y-3">
            {announcements.map((ann) => (
              <div key={ann.id} className="rounded-xl border border-sand-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${AUDIENCE_COLORS[ann.audience_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {AUDIENCE_LABELS[ann.audience_type] ?? ann.audience_type}
                      </span>
                      <span className="text-xs text-gray-400">{fmtDate(ann.created_at)}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 truncate">{ann.title}</p>
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">{ann.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}
