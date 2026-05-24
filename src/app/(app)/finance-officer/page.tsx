import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ─── Types ───────────────────────────────────────────────────────────────────

type StudentRow = {
  id: string
  first_name: string
  last_name: string
  admission_number: string
  status: string
}

// ─── Display helpers ──────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-700',
  graduated: 'bg-blue-100 text-blue-800',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  inactive: 'Inactif',
  graduated: 'Diplômé',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-4">
      <p className="text-sm text-red-700">{message}</p>
    </div>
  )
}

function StatCard({
  label,
  value,
  missingTable,
}: {
  label: string
  value?: number | null
  missingTable?: string
}) {
  return (
    <div className="bg-white shadow rounded-xl p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
      {missingTable ? (
        <div className="mt-3">
          <p className="text-3xl font-bold text-gray-200">—</p>
          <span className="mt-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            Table manquante&nbsp;: {missingTable}
          </span>
        </div>
      ) : (
        <p className="mt-3 text-3xl font-bold text-indigo-600">{value ?? '—'}</p>
      )}
    </div>
  )
}

function FinanceModuleCard({
  title,
  description,
  missingTable,
}: {
  title: string
  description: string
  missingTable: string
}) {
  return (
    <div className="bg-white shadow rounded-xl p-5 flex flex-col min-h-[9rem]">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1.5 text-sm text-gray-500 flex-1 leading-relaxed">{description}</p>
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          Prochainement
        </span>
        <span className="text-xs text-gray-400">Table manquante&nbsp;: {missingTable}</span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function FinanceOfficerPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Resolve profile + active finance_officer membership in parallel.
  const [profileResult, membershipResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single(),
    supabase
      .from('school_memberships')
      .select('school_id, schools(id, name, slug)')
      .eq('user_id', user.id)
      .eq('role', 'finance_officer')
      .eq('status', 'active'),
  ])

  const { data: memberships } = membershipResult

  // No active finance_officer membership → not authorised for this portal.
  if (!memberships || memberships.length === 0) {
    redirect('/dashboard')
  }

  // First active school. Multi-school support can be added later via a switcher.
  const school = memberships[0].schools as unknown as {
    id: string
    name: string
    slug: string
  }

  const displayName = profileResult.data?.full_name ?? user.email ?? 'Responsable Finance'

  // Fetch student counts and a short student list for this school in parallel.
  // Finance officers are school members, so is_school_member() RLS allows SELECT
  // on the students table (policy established in migration 002).
  const [totalResult, activeResult, studentsResult] = await Promise.all([
    supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', school.id),
    supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', school.id)
      .eq('status', 'active'),
    supabase
      .from('students')
      .select('id, first_name, last_name, admission_number, status')
      .eq('school_id', school.id)
      .order('last_name')
      .limit(8),
  ])

  const totalStudents = totalResult.count
  const activeStudents = activeResult.count
  const students = studentsResult.data as StudentRow[] | null
  const hasQueryError =
    !!totalResult.error || !!activeResult.error || !!studentsResult.error

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portail Finance</h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            {school.name} · {displayName}
          </p>
        </div>
        <span className="self-start shrink-0 inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
          Finance
        </span>
      </div>

      {/* ── Query error banner ───────────────────────────────────────────── */}
      {hasQueryError && (
        <ErrorBanner message="Impossible de charger les données. Veuillez actualiser la page ou contacter l'administrateur." />
      )}

      {/* ── Overview stats ───────────────────────────────────────────────── */}
      <section aria-labelledby="stats-heading">
        <h2
          id="stats-heading"
          className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3"
        >
          Vue d&apos;ensemble
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total étudiants" value={totalStudents} />
          <StatCard label="Étudiants actifs" value={activeStudents} />
          <StatCard label="Paiements en attente" missingTable="payments" />
          <StatCard label="Revenus ce mois" missingTable="payments" />
        </div>
      </section>

      {/* ── Finance modules grid ─────────────────────────────────────────── */}
      <section aria-labelledby="modules-heading">
        <h2
          id="modules-heading"
          className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3"
        >
          Modules financiers
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FinanceModuleCard
            title="Paiements"
            description="Suivi des paiements reçus, en attente et en retard par élève."
            missingTable="payments"
          />
          <FinanceModuleCard
            title="Factures"
            description="Émission et gestion des factures de scolarité et autres frais."
            missingTable="invoices"
          />
          <FinanceModuleCard
            title="Frais scolaires"
            description="Configuration des frais par niveau, classe et type de dépense."
            missingTable="fees"
          />
          <FinanceModuleCard
            title="Rapports financiers"
            description="Bilans mensuels et annuels, exports comptables."
            missingTable="financial_reports"
          />
        </div>
      </section>

      {/* ── Student billing preview ──────────────────────────────────────── */}
      <section
        aria-labelledby="students-heading"
        className="bg-white shadow rounded-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <h2 id="students-heading" className="text-base font-semibold text-gray-900">
            Étudiants — aperçu facturation
          </h2>
          <span className="text-xs text-gray-400 shrink-0">8 premiers · ordre alphabétique</span>
        </div>

        <div className="p-5">
          {!hasQueryError && (!students || students.length === 0) && (
            <p className="text-sm text-gray-500">
              Aucun étudiant enregistré dans cet établissement pour le moment.
            </p>
          )}

          {!hasQueryError && students && students.length > 0 && (
            <ul className="divide-y divide-gray-100 -mx-5 px-5">
              {students.map((student) => {
                const badgeClass = STATUS_BADGE[student.status] ?? 'bg-gray-100 text-gray-700'
                const badgeLabel = STATUS_LABELS[student.status] ?? student.status

                return (
                  <li key={student.id} className="py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {student.first_name} {student.last_name}
                      </p>
                      <p className="text-xs font-mono text-indigo-600 mt-0.5">
                        {student.admission_number}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeClass}`}
                      >
                        {badgeLabel}
                      </span>
                      {/* Placeholder CTA — links to individual billing page once payments table exists */}
                      <span className="text-xs text-gray-400 hidden sm:inline">
                        Voir dossier →
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
