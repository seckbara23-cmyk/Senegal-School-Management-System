import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { DocumentsSection, type DocumentRow } from '@/components/DocumentsSection'
import { isSchoolWritable } from '@/lib/tenant'
import { StudentTransportPanel, type CurrentAssignment, type RouteOption } from '../../transport/_StudentTransportPanel'
import { loadSchoolRisk } from '@/lib/academic/risk-data'

const RISK_META: Record<string, { label: string; badge: string }> = {
  high:   { label: 'Risque élevé', badge: 'border-red-200 bg-red-50 text-red-700' },
  medium: { label: 'Risque moyen', badge: 'border-amber-200 bg-amber-50 text-amber-700' },
  low:    { label: 'Risque faible', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
}

// ─── Types ────────────────────────────────────────────────────────────────────

type StudentRow = {
  id: string
  admission_number: string
  first_name: string
  last_name: string
  gender: string | null
  date_of_birth: string | null
  status: string
  created_at: string
  updated_at: string
}

type InvoiceRow = {
  id: string
  invoice_number: string
  title: string
  total_amount: number
  amount_paid: number
  status: string
  due_date: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = {
  active:    'Actif',
  inactive:  'Inactif',
  graduated: 'Diplômé',
}

const STATUS_CLASS: Record<string, string> = {
  active:    'bg-primary-50 text-primary-700',
  inactive:  'bg-stone-100 text-stone-500',
  graduated: 'bg-sky-50 text-sky-700',
}

const GENDER_LABEL: Record<string, string> = {
  male:   'Masculin',
  female: 'Féminin',
  other:  'Autre',
}

const INV_STATUS_LABEL: Record<string, string> = {
  unpaid:    'Impayée',
  partial:   'Partielle',
  paid:      'Réglée',
  cancelled: 'Annulée',
}

const INV_STATUS_CLASS: Record<string, string> = {
  unpaid:    'border-red-200 bg-red-50 text-red-700',
  partial:   'border-amber-200 bg-amber-50 text-amber-700',
  paid:      'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-gray-200 bg-gray-100 text-gray-500',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  const hasValue = value !== null && value !== undefined && value !== ''
  return (
    <div className="px-5 py-3.5 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className={`mt-1 sm:col-span-2 sm:mt-0 text-sm ${mono ? 'font-mono tracking-wide' : ''} ${hasValue ? 'text-gray-900' : 'italic text-gray-400'}`}>
        {hasValue ? value : 'Non renseigné'}
      </dd>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = { params: { studentId: string }; searchParams: { doc_ok?: string; doc_error?: string; transport_ok?: string; transport_error?: string } }

const TRANSPORT_FEEDBACK: Record<string, { ok: boolean; msg: string }> = {
  assigned:  { ok: true,  msg: 'Élève affecté au transport.' },
  ended:     { ok: true,  msg: 'Affectation de transport terminée.' },
  duplicate: { ok: false, msg: 'Cet élève a déjà une affectation de transport active.' },
  invalid:   { ok: false, msg: 'Itinéraire invalide.' },
  readonly:  { ok: false, msg: 'Cet établissement est en lecture seule.' },
  server:    { ok: false, msg: 'L’opération a échoué. Veuillez réessayer.' },
}

export default async function StudentDetailPage({ params, searchParams }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('school_id, schools(id, name)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) redirect('/dashboard')

  const school = memberships[0].schools as unknown as { id: string; name: string }

  // Fetch student, finance stats, and recent invoices in parallel
  const [studentRes, finStatsRes, recentInvRes] = await Promise.all([
    supabase
      .from('students')
      .select('id, admission_number, first_name, last_name, gender, date_of_birth, status, created_at, updated_at')
      .eq('id', params.studentId)
      .eq('school_id', school.id)
      .maybeSingle(),

    supabase
      .from('student_invoices')
      .select('total_amount, amount_paid, status, due_date')
      .eq('student_id', params.studentId)
      .eq('school_id', school.id)
      .neq('status', 'cancelled'),

    supabase
      .from('student_invoices')
      .select('id, invoice_number, title, total_amount, amount_paid, status, due_date')
      .eq('student_id', params.studentId)
      .eq('school_id', school.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  if (!studentRes.data) notFound()
  const s = studentRes.data as StudentRow

  type StatRow = { total_amount: number; amount_paid: number; status: string; due_date: string | null }
  const finInvoices = (finStatsRes.data ?? []) as StatRow[]
  const recentInvoices = (recentInvRes.data ?? []) as InvoiceRow[]

  const today          = new Date().toISOString().split('T')[0]
  const totalInvoiced  = finInvoices.reduce((sum, i) => sum + i.total_amount, 0)
  const totalPaid      = finInvoices.reduce((sum, i) => sum + i.amount_paid, 0)
  const outstanding    = totalInvoiced - totalPaid
  const overdueBalance = finInvoices
    .filter((i) => i.due_date !== null && i.due_date < today && (i.status === 'unpaid' || i.status === 'partial'))
    .reduce((sum, i) => sum + (i.total_amount - i.amount_paid), 0)

  function isOverdue(inv: InvoiceRow): boolean {
    return inv.due_date !== null && inv.due_date < today
      && (inv.status === 'unpaid' || inv.status === 'partial')
  }

  const { data: docsData } = await supabase
    .from('school_documents')
    .select('id, document_type, filename, mime_type, size_bytes, storage_path, created_at')
    .eq('school_id', school.id).eq('owner_type', 'student').eq('owner_id', s.id)
    .order('created_at', { ascending: false })
  const documents = (docsData ?? []) as DocumentRow[]

  // ── Transport (current assignment + active routes for the assign panel) ──────
  const [staRes, routesRes, writable] = await Promise.all([
    supabase
      .from('student_transport_assignments')
      .select('id, route_id, monthly_fee, start_date, transport_routes(name), transport_stops(name)')
      .eq('school_id', school.id).eq('student_id', s.id).eq('status', 'active').maybeSingle(),
    supabase
      .from('transport_routes')
      .select('id, name, monthly_fee, transport_stops(id, name)')
      .eq('school_id', school.id).eq('status', 'active').order('name'),
    isSchoolWritable(supabase, school.id),
  ])

  const staRow = staRes.data as unknown as
    { id: string; route_id: string; monthly_fee: number; start_date: string | null; transport_routes: { name: string } | null; transport_stops: { name: string } | null } | null
  const currentAssignment: CurrentAssignment = staRow
    ? { id: staRow.id, route_id: staRow.route_id, route_name: staRow.transport_routes?.name ?? '—', stop_name: staRow.transport_stops?.name ?? null, monthly_fee: staRow.monthly_fee, start_date: staRow.start_date }
    : null
  const transportRoutes: RouteOption[] = ((routesRes.data ?? []) as unknown as { id: string; name: string; monthly_fee: number; transport_stops: { id: string; name: string }[] }[])
    .map((r) => ({ id: r.id, name: r.name, monthly_fee: r.monthly_fee, stops: (r.transport_stops ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)) }))

  const transportFb = searchParams.transport_ok ? TRANSPORT_FEEDBACK[searchParams.transport_ok]
    : searchParams.transport_error ? TRANSPORT_FEEDBACK[searchParams.transport_error]
    : null

  // Risk assessment — derived, never stored.
  const studentRisk = (await loadSchoolRisk(supabase, school.id, { studentId: s.id })).results[0] ?? null

  const fullName = `${s.last_name} ${s.first_name}`

  return (
    <div className="space-y-6">

      {/* ── Breadcrumb ──────────────────────────────────────────────────────── */}
      <nav className="flex flex-wrap items-center gap-y-1 text-sm text-gray-500" aria-label="Fil d'Ariane">
        <a href="/school" className="hover:text-primary-600 hover:underline">Administration</a>
        <span className="mx-2 select-none" aria-hidden="true">/</span>
        <a href="/school/students" className="hover:text-primary-600 hover:underline">Élèves</a>
        <span className="mx-2 select-none" aria-hidden="true">/</span>
        <span className="truncate max-w-[16rem] font-medium text-gray-900">{fullName}</span>
      </nav>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{school.name}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${STATUS_CLASS[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABEL[s.status] ?? s.status}
          </span>
          <a
            href={`/school/students/${s.id}/progress`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-sand-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-1"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
            </svg>
            Voir progression
          </a>
          <a
            href={`/school/students/${s.id}/attendance`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-sand-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-1"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Présences
          </a>
          <a
            href={`/school/students/${s.id}/grades`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-sand-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-1"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 3.75 3.75 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
            Notes
          </a>
          <a
            href={`/school/students/${s.id}/transfer`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-sand-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-1"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            Transférer
          </a>
          <a
            href={`/school/students/${s.id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-sand-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-1"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
            Modifier
          </a>
        </div>
      </div>

      {/* ── Detail cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Identity */}
        <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Identité</h2>
          </div>
          <dl className="divide-y divide-sand-100">
            <DetailRow label="Prénom"            value={s.first_name} />
            <DetailRow label="Nom"               value={s.last_name} />
            <DetailRow label="Sexe"              value={s.gender ? (GENDER_LABEL[s.gender] ?? s.gender) : null} />
            <DetailRow label="Date de naissance" value={formatDate(s.date_of_birth)} />
          </dl>
        </div>

        {/* Enrollment */}
        <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Scolarité</h2>
          </div>
          <dl className="divide-y divide-sand-100">
            <DetailRow label="N° d'admission"       value={s.admission_number} mono />
            <DetailRow label="Statut"               value={STATUS_LABEL[s.status] ?? s.status} />
            <DetailRow label="Date d'inscription"   value={formatDate(s.created_at)} />
            <DetailRow label="Dernière mise à jour" value={formatDate(s.updated_at)} />
          </dl>
        </div>
      </div>

      {/* ── Finance section ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">Finance</h2>
          <a
            href={`/school/students/${s.id}/finance`}
            className="text-sm text-primary-600 hover:text-primary-800 hover:underline"
          >
            Historique complet →
          </a>
        </div>

        {/* Stat strip */}
        <div className="overflow-hidden rounded-xl grid grid-cols-2 sm:grid-cols-4 shadow-sm mb-4">
          <div className="bg-primary-600 px-4 py-4 text-center">
            <p className="text-lg font-bold text-white">{fmt(totalInvoiced)}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-0.5">Facturé</p>
          </div>
          <div className="bg-emerald-600 px-4 py-4 text-center">
            <p className="text-lg font-bold text-white">{fmt(totalPaid)}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200 mt-0.5">Encaissé</p>
          </div>
          <div className={`px-4 py-4 text-center ${outstanding > 0 ? 'bg-amber-500' : 'bg-gray-500'}`}>
            <p className="text-lg font-bold text-white">{fmt(outstanding)}</p>
            <p className={`text-xs font-semibold uppercase tracking-wider mt-0.5 ${outstanding > 0 ? 'text-amber-100' : 'text-gray-300'}`}>
              Solde
            </p>
          </div>
          <div className={`px-4 py-4 text-center ${overdueBalance > 0 ? 'bg-red-600' : 'bg-gray-400'}`}>
            <p className="text-lg font-bold text-white">{fmt(overdueBalance)}</p>
            <p className={`text-xs font-semibold uppercase tracking-wider mt-0.5 ${overdueBalance > 0 ? 'text-red-200' : 'text-gray-200'}`}>
              En retard
            </p>
          </div>
        </div>

        {/* Recent invoices */}
        {recentInvoices.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-8 px-6 text-center">
            <p className="text-sm font-semibold text-gray-600">Aucune facture</p>
            <p className="mt-1 text-xs text-gray-400">Cet élève n&apos;a pas encore de facture.</p>
            <a
              href="/school/finance/invoices/new"
              className="mt-3 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
            >
              Créer une facture
            </a>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">N°</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Titre</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Total</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Échéance</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Statut</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv, idx) => {
                  const overdue = isOverdue(inv)
                  return (
                    <tr
                      key={inv.id}
                      className={`border-b border-sand-100 hover:bg-accent-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        <a href={`/school/finance/invoices/${inv.id}`} className="hover:text-primary-700 hover:underline">
                          {inv.invoice_number}
                        </a>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-gray-600 max-w-[180px] truncate">
                        {inv.title}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                        {fmt(inv.total_amount)}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-right whitespace-nowrap">
                        <span className={overdue ? 'text-red-600 font-medium' : 'text-gray-500'}>
                          {fmtDate(inv.due_date)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${INV_STATUS_CLASS[inv.status] ?? INV_STATUS_CLASS.unpaid}`}>
                            {INV_STATUS_LABEL[inv.status] ?? inv.status}
                          </span>
                          {overdue && (
                            <span className="inline-block rounded-full border border-red-400 bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                              Retard
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Risque scolaire (dérivé) ────────────────────────────────────────── */}
      {studentRisk && (studentRisk.level !== 'low' || studentRisk.reasons.length > 0) && (
        <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-sand-100 bg-sand-50 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Suivi & risque</h2>
            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${RISK_META[studentRisk.level].badge}`}>{RISK_META[studentRisk.level].label}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Motifs</p>
              {studentRisk.reasons.length > 0
                ? <ul className="mt-1 list-disc space-y-0.5 pl-5">{studentRisk.reasons.map((x, i) => <li key={i} className="text-xs text-gray-700">{x}</li>)}</ul>
                : <p className="mt-1 text-xs text-gray-400">Aucun signal d&apos;alerte.</p>}
            </div>
            {studentRisk.actions.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions recommandées</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">{studentRisk.actions.map((x, i) => <li key={i} className="text-xs text-primary-700">{x}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Transport ───────────────────────────────────────────────────────── */}
      {transportFb && (
        <div role="alert" className={`rounded-lg border p-4 ${transportFb.ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <p className={`text-sm ${transportFb.ok ? 'text-emerald-700' : 'text-red-700'}`}>{transportFb.msg}</p>
        </div>
      )}
      <StudentTransportPanel
        studentId={s.id}
        assignment={currentAssignment}
        routes={transportRoutes}
        writable={writable}
      />

      {/* ── Documents ───────────────────────────────────────────────────────── */}
      <DocumentsSection
        ownerType="student"
        ownerId={s.id}
        redirectTo={`/school/students/${s.id}`}
        documents={documents}
        okCode={searchParams.doc_ok}
        errorCode={searchParams.doc_error}
      />

      {/* ── Back link ────────────────────────────────────────────────────────── */}
      <a
        href="/school/students"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Retour à la liste des élèves
      </a>

    </div>
  )
}
