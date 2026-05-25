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

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<StatusKey, { label: string; className: string }> = {
  present: { label: 'Présent',    className: 'bg-primary-50 text-primary-700 ring-primary-200' },
  absent:  { label: 'Absent',     className: 'bg-red-50    text-red-700    ring-red-200'    },
  late:    { label: 'En retard',  className: 'bg-amber-50  text-amber-700  ring-amber-200'  },
  excused: { label: 'Excusé',     className: 'bg-sky-50    text-sky-700    ring-sky-200'    },
}

const STATUS_SUMMARY_ORDER: StatusKey[] = ['present', 'absent', 'late', 'excused']

const SUMMARY_LABEL: Record<StatusKey, string> = {
  present: 'Présents',
  absent:  'Absents',
  late:    'En retard',
  excused: 'Excusés',
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

  // ── Compute summary counts ────────────────────────────────────────────────
  const counts: Record<StatusKey, number> = { present: 0, absent: 0, late: 0, excused: 0 }
  for (const r of session.attendance_records) {
    if (r.status in counts) counts[r.status]++
  }

  const className = [session.classes.name, session.classes.section]
    .filter(Boolean)
    .join(' — ')

  const formattedDate = formatSessionDate(session.session_date)
  const total = session.attendance_records.length

  // Sort records: last name then first name
  const sortedRecords = [...session.attendance_records].sort((a, b) => {
    const la = a.students.last_name.localeCompare(b.students.last_name, 'fr')
    return la !== 0 ? la : a.students.first_name.localeCompare(b.students.first_name, 'fr')
  })

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="flex items-center text-sm text-gray-500 mb-1" aria-label="Fil d'Ariane">
            <a href="/school" className="hover:text-primary-600 hover:underline">
              Administration
            </a>
            <span className="mx-2 select-none" aria-hidden="true">/</span>
            <a href="/school/attendance" className="hover:text-primary-600 hover:underline">
              Présences
            </a>
            <span className="mx-2 select-none" aria-hidden="true">/</span>
            <span className="font-medium text-gray-900 capitalize">{formattedDate}</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900 capitalize">{formattedDate}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {className} · {session.academic_years.name} · {school.name}
          </p>
        </div>
        <a
          href="/school/attendance"
          className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-sand-50 transition-colors"
        >
          ← Retour aux séances
        </a>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUS_SUMMARY_ORDER.map((k) => {
          const badge = STATUS_BADGE[k]
          const pct   = total > 0 ? Math.round((counts[k] / total) * 100) : 0
          return (
            <div
              key={k}
              className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm text-center"
            >
              <p className="text-2xl font-bold text-gray-900">{counts[k]}</p>
              <p className="text-xs text-gray-500 mt-0.5">{SUMMARY_LABEL[k]}</p>
              <span
                className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.className}`}
              >
                {pct}%
              </span>
            </div>
          )
        })}
      </div>

      {/* ── Notes ───────────────────────────────────────────────────────────── */}
      {session.notes && (
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
            Notes de séance
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{session.notes}</p>
        </div>
      )}

      {/* ── Records table ───────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-sand-200">
            <thead>
              <tr className="bg-sand-50">
                <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Élève
                </th>
                <th scope="col" className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                  {`N° d'admission`}
                </th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {sortedRecords.map((r) => {
                const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.absent
                return (
                  <tr key={r.id} className="hover:bg-sand-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-medium text-gray-900">
                        {r.students.last_name} {r.students.first_name}
                      </span>
                    </td>
                    <td className="hidden px-5 py-3.5 whitespace-nowrap sm:table-cell">
                      <span className="font-mono text-sm text-gray-500">
                        {r.students.admission_number}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
