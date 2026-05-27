import { requireStudentCtx } from './_auth'

function fmtCurrency(n: number) {
  return n.toLocaleString('fr-SN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' FCFA'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-SN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const AUDIENCE_LABELS: Record<string, string> = {
  all_school: 'École', parents: 'Parents', students: 'Élèves', staff: 'Personnel', class: 'Classe',
}
const AUDIENCE_COLORS: Record<string, string> = {
  all_school: 'bg-primary-100 text-primary-700', parents: 'bg-accent-100 text-accent-700',
  students: 'bg-emerald-100 text-emerald-700', staff: 'bg-gray-100 text-gray-600', class: 'bg-sky-100 text-sky-700',
}

const STATUS_LABEL: Record<string, string> = {
  present: 'Présent', absent: 'Absent', late: 'Retard', excused: 'Justifié',
}
const STATUS_CLASS: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-700', absent: 'bg-red-100 text-red-700',
  late: 'bg-amber-100 text-amber-700', excused: 'bg-sky-100 text-sky-700',
}

export default async function StudentDashboard() {
  const { supabase, schoolId, schoolName, student } = await requireStudentCtx()

  // Active class enrollment
  const { data: enrData } = await supabase
    .from('student_class_enrollments')
    .select('class_id, classes!class_id(name)')
    .eq('student_id', student.id)
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  type EnrRow = { class_id: string; classes: { name: string } }
  const enrollment = enrData as unknown as EnrRow | null
  const className = enrollment?.classes.name ?? null

  // Attendance summary, outstanding balance, recent announcements — parallel
  const [attRes, invRes, annRes] = await Promise.all([
    supabase
      .from('attendance_records')
      .select('id, status')
      .eq('student_id', student.id)
      .eq('school_id', schoolId),

    supabase
      .from('student_invoices')
      .select('total_amount, amount_paid, status')
      .eq('student_id', student.id)
      .eq('school_id', schoolId)
      .in('status', ['unpaid', 'partial']),

    supabase
      .from('announcements')
      .select('id, title, body, audience_type, created_at')
      .eq('school_id', schoolId)
      .in('audience_type', ['all_school', 'students'])
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  type AttRow = { id: string; status: string }
  const attRecords = (attRes.data ?? []) as AttRow[]
  const total   = attRecords.length
  const present = attRecords.filter((r) => r.status === 'present').length
  const late    = attRecords.filter((r) => r.status === 'late').length
  const absent  = attRecords.filter((r) => r.status === 'absent').length
  const rate    = total > 0 ? Math.round(((present + late) / total) * 100) : null

  type InvRow = { total_amount: number; amount_paid: number; status: string }
  const invoices = (invRes.data ?? []) as InvRow[]
  const outstanding = invoices.reduce((s, i) => s + Math.max(0, i.total_amount - i.amount_paid), 0)

  return (
    <div className="space-y-6 pb-8">

      {/* ── Greeting ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <p className="text-sm text-primary-300">Portail Étudiant · {schoolName}</p>
        <h1 className="mt-1 text-2xl font-bold text-white">
          Bonjour, {student.first_name} 👋
        </h1>
        {className && (
          <p className="mt-0.5 text-sm text-primary-200">{className} · N° {student.admission_number}</p>
        )}
      </div>

      {/* ── Quick stats ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <a href="/student/attendance" className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center hover:border-primary-300 transition-colors">
          <p className={`text-2xl font-bold ${rate !== null ? (rate >= 80 ? 'text-emerald-600' : rate >= 60 ? 'text-amber-500' : 'text-red-600') : 'text-gray-300'}`}>
            {rate !== null ? `${rate}%` : '—'}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Présence</p>
        </a>
        <a href="/student/attendance" className={`rounded-xl border shadow-sm px-4 py-4 text-center hover:border-red-300 transition-colors ${absent > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-sand-200'}`}>
          <p className={`text-2xl font-bold ${absent > 0 ? 'text-red-600' : 'text-gray-900'}`}>{absent}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Absences</p>
        </a>
        <a href="/student/finance" className={`col-span-2 sm:col-span-1 rounded-xl border shadow-sm px-4 py-4 text-center hover:border-amber-300 transition-colors ${outstanding > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-sand-200'}`}>
          <p className={`text-lg font-bold truncate ${outstanding > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
            {fmtCurrency(outstanding)}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Solde dû</p>
        </a>
      </div>

      {/* ── Quick nav cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <a href="/student/bulletins" className="rounded-xl border border-sand-200 bg-white shadow-sm px-5 py-5 hover:border-primary-300 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 3.75 3.75 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" /></svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Bulletins</p>
              <p className="text-xs text-gray-400 mt-0.5">Mes notes</p>
            </div>
          </div>
        </a>
        <a href="/student/finance" className="rounded-xl border border-sand-200 bg-white shadow-sm px-5 py-5 hover:border-primary-300 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Finance</p>
              <p className="text-xs text-gray-400 mt-0.5">Mes factures</p>
            </div>
          </div>
        </a>
      </div>

      {/* ── Recent announcements ─────────────────────────────────────────────── */}
      {annRes.data && annRes.data.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Annonces récentes</h2>
            <a href="/student/announcements" className="text-xs font-medium text-primary-600 hover:underline">
              Toutes →
            </a>
          </div>
          <div className="space-y-3">
            {annRes.data.map((ann) => (
              <div key={ann.id} className="rounded-xl border border-sand-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${AUDIENCE_COLORS[ann.audience_type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {AUDIENCE_LABELS[ann.audience_type] ?? ann.audience_type}
                  </span>
                  <span className="text-xs text-gray-400">{fmtDate(ann.created_at)}</span>
                </div>
                <p className="text-sm font-semibold text-gray-900">{ann.title}</p>
                <p className="mt-0.5 text-sm text-gray-500 line-clamp-2">{ann.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Recent attendance ────────────────────────────────────────────────── */}
      {attRecords.length > 0 && (() => {
        const recent = [...attRecords].slice(0, 5)
        return (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Présences récentes</h2>
              <a href="/student/attendance" className="text-xs font-medium text-primary-600 hover:underline">
                Tout voir →
              </a>
            </div>
            <div className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <span key={r.id} className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              ))}
            </div>
          </section>
        )
      })()}

    </div>
  )
}
