import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusKey = 'present' | 'absent' | 'late' | 'excused'

type AttendanceRecord = {
  id: string
  status: StatusKey
  notes: string | null
  students: {
    id: string
    first_name: string
    last_name: string
    admission_number: string
  }
}

type SessionDetail = {
  id: string
  session_date: string
  notes: string | null
  classes: { name: string; section: string | null }
  academic_years: { name: string }
  attendance_records: AttendanceRecord[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSessionDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  params: { sessionId: string }
}

export default async function AttendanceSessionPage({ params }: Props) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('school_id, schools(id, name)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) redirect('/dashboard')

  const school = memberships[0].schools as unknown as { id: string; name: string }

  const { data: raw } = await supabase
    .from('attendance_sessions')
    .select(
      'id, session_date, notes, ' +
      'classes!class_id(name, section), ' +
      'academic_years!academic_year_id(name), ' +
      'attendance_records!session_id(id, status, notes, students!student_id(id, first_name, last_name, admission_number))'
    )
    .eq('id', params.sessionId)
    .eq('school_id', school.id)
    .maybeSingle()

  if (!raw) notFound()

  const session = raw as unknown as SessionDetail

  const counts: Record<StatusKey, number> = { present: 0, absent: 0, late: 0, excused: 0 }
  for (const r of session.attendance_records) {
    if (r.status in counts) counts[r.status]++
  }

  const total         = session.attendance_records.length
  const className     = [session.classes.name, session.classes.section].filter(Boolean).join(' — ')
  const formattedDate = formatSessionDate(session.session_date)

  const sortedRecords = [...session.attendance_records].sort((a, b) => {
    const cmp = a.students.last_name.localeCompare(b.students.last_name, 'fr')
    return cmp !== 0 ? cmp : a.students.first_name.localeCompare(b.students.first_name, 'fr')
  })

  function pct(n: number) {
    return total > 0 ? Math.round((n / total) * 100) : 0
  }

  return (
    <div className="space-y-5">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <a
          href="/school/attendance"
          className="inline-flex items-center gap-1.5 text-sm text-primary-300 hover:text-white transition-colors mb-3"
        >
          ← Retour au registre
        </a>
        <h1 className="text-2xl font-bold text-white tracking-tight capitalize">
          {formattedDate}
        </h1>
        <p className="text-primary-300 text-sm mt-0.5">
          {className} · {session.academic_years.name} · {school.name}
        </p>
      </div>

      {/* ── Status summary strip ─────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl grid grid-cols-2 sm:grid-cols-4 shadow-sm">
        <div className="bg-primary-600 px-5 py-5 text-center">
          <p className="text-3xl font-bold text-white">{counts.present}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-1">
            Présents
          </p>
          <p className="text-sm font-medium text-primary-100 mt-1">
            {pct(counts.present)} %
          </p>
        </div>
        <div className="bg-red-600 px-5 py-5 text-center">
          <p className="text-3xl font-bold text-white">{counts.absent}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-red-200 mt-1">
            Absents
          </p>
          <p className="text-sm font-medium text-red-100 mt-1">
            {pct(counts.absent)} %
          </p>
        </div>
        <div className="bg-amber-500 px-5 py-5 text-center">
          <p className="text-3xl font-bold text-white">{counts.late}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-100 mt-1">
            En retard
          </p>
          <p className="text-sm font-medium text-amber-50 mt-1">
            {pct(counts.late)} %
          </p>
        </div>
        <div className="bg-sky-600 px-5 py-5 text-center">
          <p className="text-3xl font-bold text-white">{counts.excused}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-200 mt-1">
            Excusés
          </p>
          <p className="text-sm font-medium text-sky-100 mt-1">
            {pct(counts.excused)} %
          </p>
        </div>
      </div>

      {/* ── Session notes ────────────────────────────────────────────────────── */}
      {session.notes && (
        <div className="rounded-xl border border-sand-200 bg-sand-50 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">
            Notes de séance
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {session.notes}
          </p>
        </div>
      )}

      {/* ── Records register ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
        <div className="border-b border-sand-200 bg-sand-100 px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Liste nominative
          </p>
          <p className="text-xs text-gray-400">
            {total} élève{total !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-50">
                <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Nom
                </th>
                <th scope="col" className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                  {`N° Adm.`}
                </th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {sortedRecords.map((r) => (
                <tr key={r.id} className="odd:bg-white even:bg-sand-50">
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium text-gray-900">
                      {r.students.last_name} {r.students.first_name}
                    </span>
                  </td>
                  <td className="hidden px-5 py-3.5 whitespace-nowrap sm:table-cell">
                    <span className="font-mono text-sm text-gray-400">
                      {r.students.admission_number}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {r.status === 'present' && (
                      <span className="text-sm font-semibold text-primary-600">
                        ● Présent
                      </span>
                    )}
                    {r.status === 'absent' && (
                      <span className="text-sm font-semibold text-red-600">
                        ● Absent
                      </span>
                    )}
                    {r.status === 'late' && (
                      <span className="text-sm font-semibold text-amber-600">
                        ● En retard
                      </span>
                    )}
                    {r.status === 'excused' && (
                      <span className="text-sm font-semibold text-sky-600">
                        ● Excusé
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
