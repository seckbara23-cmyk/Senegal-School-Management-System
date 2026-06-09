import { requireTeacherCtx } from './_auth'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-SN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const TYPE_LABEL: Record<string, string> = {
  devoir:        'Devoir',
  composition:   'Composition',
  examen:        'Examen',
  participation: 'Participation',
  autre:         'Autre',
}

const AUDIENCE_LABEL: Record<string, string> = {
  all_school: 'École',
  staff:      'Personnel',
  class:      'Classe',
}

const AUDIENCE_COLOR: Record<string, string> = {
  all_school: 'bg-primary-100 text-primary-700',
  staff:      'bg-gray-100 text-gray-600',
  class:      'bg-sky-100 text-sky-700',
}

type ClassSubjectRow = {
  id: string
  class_id: string
  classes:  { name: string; level: string | null }
  subjects: { name: string }
  academic_years: { name: string }
}

type AssessmentRow = {
  id: string
  title: string
  assessment_type: string
  assessment_date: string | null
  class_subjects: {
    classes:  { name: string }
    subjects: { name: string }
  }
  academic_periods: { name: string }
}

type AnnouncementRow = {
  id: string
  title: string
  body: string | null
  audience_type: string
  created_at: string
}

export default async function TeacherDashboard() {
  const { supabase, schoolId, schoolName, teacher, assignedClassSubjectIds } = await requireTeacherCtx()

  const [csRes, assessRes, annRes] = await Promise.all([
    // Assigned class-subject details
    assignedClassSubjectIds.length > 0
      ? supabase
          .from('class_subjects')
          .select('id, class_id, classes!class_id(name, level), subjects!subject_id(name), academic_years!academic_year_id(name)')
          .in('id', assignedClassSubjectIds)
          .eq('school_id', schoolId)
      : Promise.resolve({ data: [] as ClassSubjectRow[] }),

    // Recent assessments for assigned class-subjects
    assignedClassSubjectIds.length > 0
      ? supabase
          .from('assessments')
          .select('id, title, assessment_type, assessment_date, class_subjects!class_subject_id(classes!class_id(name), subjects!subject_id(name)), academic_periods!academic_period_id(name)')
          .in('class_subject_id', assignedClassSubjectIds)
          .order('assessment_date', { ascending: false, nullsFirst: false })
          .limit(5)
      : Promise.resolve({ data: [] as AssessmentRow[] }),

    // Recent announcements (all_school + staff)
    supabase
      .from('announcements')
      .select('id, title, body, audience_type, created_at')
      .eq('school_id', schoolId)
      .in('audience_type', ['all_school', 'staff'])
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const classSubjects  = (csRes.data   ?? []) as unknown as ClassSubjectRow[]
  const assessments    = (assessRes.data ?? []) as unknown as AssessmentRow[]
  const announcements  = (annRes.data   ?? []) as AnnouncementRow[]

  // Count unique classes
  const uniqueClassIds = new Set(classSubjects.map((cs) => cs.class_id))

  // ── Today's operational widgets ──────────────────────────────────────────────
  const dow = ((new Date().getDay() + 6) % 7) + 1 // Mon=1 … Sun=7
  const todayISO = new Date().toISOString().slice(0, 10)
  const todayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  // Active year (drives the timetable scope).
  const { data: ayData } = await supabase
    .from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  const activeYearId = (ayData as { id: string } | null)?.id ?? null

  // Today's timetable slots for this teacher.
  type SlotRow = {
    id: string; start_time: string; end_time: string; room: string | null; class_id: string
    classes: { name: string; section: string | null } | null
    class_subjects: { subjects: { name: string } | null } | null
  }
  let todaySlots: SlotRow[] = []
  if (activeYearId) {
    const { data } = await supabase
      .from('timetable_slots')
      .select('id, start_time, end_time, room, class_id, classes!class_id(name, section), class_subjects!class_subject_id(subjects!subject_id(name))')
      .eq('school_id', schoolId).eq('teacher_id', teacher.id).eq('academic_year_id', activeYearId).eq('day_of_week', dow)
      .order('start_time', { ascending: true })
    todaySlots = (data ?? []) as unknown as SlotRow[]
  }
  const hhmm = (t: string) => t.slice(0, 5)
  const classLabelOf = (c: { name: string; section: string | null } | null) => (c ? [c.name, c.section].filter(Boolean).join(' ') : '—')

  // Pending attendance: classes the teacher teaches today with no session today.
  const todayClassIds = Array.from(new Set(todaySlots.map((s) => s.class_id)))
  let pendingAttendance: { class_id: string; label: string }[] = []
  if (todayClassIds.length > 0) {
    const { data: sess } = await supabase
      .from('attendance_sessions').select('class_id')
      .eq('school_id', schoolId).eq('session_date', todayISO).in('class_id', todayClassIds)
    const done = new Set(((sess ?? []) as { class_id: string }[]).map((s) => s.class_id))
    const labelByClass = new Map<string, string>()
    for (const s of todaySlots) labelByClass.set(s.class_id, classLabelOf(s.classes))
    pendingAttendance = todayClassIds.filter((id) => !done.has(id)).map((id) => ({ class_id: id, label: labelByClass.get(id) ?? '—' }))
  }

  // Pending grading: the teacher's assessments not fully graded.
  const csClassMap = new Map(classSubjects.map((cs) => [cs.id, cs.class_id]))
  type PendingAssessment = { id: string; title: string; label: string }
  let pendingGrading: PendingAssessment[] = []
  if (assignedClassSubjectIds.length > 0) {
    const { data: allAssess } = await supabase
      .from('assessments')
      .select('id, title, class_subject_id, class_subjects!class_subject_id(classes!class_id(name), subjects!subject_id(name))')
      .eq('school_id', schoolId).in('class_subject_id', assignedClassSubjectIds)
    type A2 = { id: string; title: string; class_subject_id: string; class_subjects: { classes: { name: string } | null; subjects: { name: string } | null } | null }
    const allAssessments = (allAssess ?? []) as unknown as A2[]
    const assessmentIds = allAssessments.map((a) => a.id)
    const classIds = Array.from(new Set(allAssessments.map((a) => csClassMap.get(a.class_subject_id)).filter(Boolean) as string[]))

    const enrolledByClass = new Map<string, number>()
    if (classIds.length > 0) {
      const { data: enr } = await supabase
        .from('student_class_enrollments').select('class_id')
        .eq('school_id', schoolId).eq('status', 'active').in('class_id', classIds)
      for (const e of (enr ?? []) as { class_id: string }[]) enrolledByClass.set(e.class_id, (enrolledByClass.get(e.class_id) ?? 0) + 1)
    }
    const gradedByAssessment = new Map<string, number>()
    if (assessmentIds.length > 0) {
      const { data: g } = await supabase.from('grades').select('assessment_id').eq('school_id', schoolId).in('assessment_id', assessmentIds)
      for (const r of (g ?? []) as { assessment_id: string }[]) gradedByAssessment.set(r.assessment_id, (gradedByAssessment.get(r.assessment_id) ?? 0) + 1)
    }
    pendingGrading = allAssessments
      .filter((a) => {
        const classId = csClassMap.get(a.class_subject_id)
        const expected = classId ? (enrolledByClass.get(classId) ?? 0) : 0
        return expected > 0 && (gradedByAssessment.get(a.id) ?? 0) < expected
      })
      .map((a) => ({ id: a.id, title: a.title, label: `${a.class_subjects?.classes?.name ?? ''} · ${a.class_subjects?.subjects?.name ?? ''}` }))
      .slice(0, 8)
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ── Greeting header ──────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <p className="text-sm text-primary-300">Portail Enseignant · {schoolName}</p>
        <h1 className="mt-1 text-2xl font-bold text-white">
          Bonjour, {teacher.first_name} 👋
        </h1>
        <p className="mt-0.5 text-sm text-primary-200">
          {assignedClassSubjectIds.length} matière{assignedClassSubjectIds.length !== 1 ? 's' : ''} assignée{assignedClassSubjectIds.length !== 1 ? 's' : ''}
          {uniqueClassIds.size > 0 && ` · ${uniqueClassIds.size} classe${uniqueClassIds.size !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* ── Quick nav ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Mes classes',  href: '/teacher/classes',       color: 'bg-primary-600' },
          { label: 'Notes',        href: '/teacher/grades',         color: 'bg-emerald-600' },
          { label: 'Présences',    href: '/teacher/attendance',     color: 'bg-amber-500'   },
          { label: 'Annonces',     href: '/teacher/announcements',  color: 'bg-sky-600'     },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`${item.color} rounded-xl px-4 py-4 text-center text-sm font-semibold text-white hover:opacity-90 transition-opacity shadow-sm`}
          >
            {item.label}
          </a>
        ))}
      </div>

      {/* ── Today: timetable ─────────────────────────────────────────────────── */}
      {assignedClassSubjectIds.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Aujourd&apos;hui — <span className="capitalize">{todayLabel}</span>
          </h2>
          <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
            {todaySlots.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-gray-400">Aucun cours programmé aujourd&apos;hui.</p>
            ) : (
              <ul className="divide-y divide-sand-100">
                {todaySlots.map((s) => (
                  <li key={s.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="w-24 shrink-0 font-mono text-xs text-gray-500">{hhmm(s.start_time)}–{hhmm(s.end_time)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{s.class_subjects?.subjects?.name ?? 'Matière'}</p>
                      <p className="truncate text-xs text-gray-500">{classLabelOf(s.classes)}{s.room ? ` · ${s.room}` : ''}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ── Pending attendance ───────────────────────────────────────────────── */}
      {pendingAttendance.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-600">
            Présences en attente
          </h2>
          <div className="space-y-2">
            {pendingAttendance.map((p) => (
              <a
                key={p.class_id}
                href="/teacher/attendance/new"
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 shadow-sm transition-colors hover:bg-amber-100"
              >
                <span className="text-sm font-medium text-amber-900">{p.label}</span>
                <span className="shrink-0 text-xs font-semibold text-amber-700">Marquer les présences →</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── Pending grading ──────────────────────────────────────────────────── */}
      {pendingGrading.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Notes en attente
          </h2>
          <div className="space-y-2">
            {pendingGrading.map((a) => (
              <a
                key={a.id}
                href={`/teacher/grades/${a.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 bg-white px-5 py-3.5 shadow-sm transition-colors hover:border-primary-200 hover:bg-primary-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{a.title}</p>
                  <p className="truncate text-xs text-gray-500">{a.label}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-primary-700">Saisir les notes →</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── No assignments state ─────────────────────────────────────────────── */}
      {assignedClassSubjectIds.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune matière assignée</p>
          <p className="mt-1 text-sm text-gray-400">
            L&apos;administrateur doit vous assigner des matières dans les classes.
          </p>
        </div>
      )}

      {/* ── Assigned class-subjects ──────────────────────────────────────────── */}
      {classSubjects.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Mes attributions
            </h2>
            <a href="/teacher/classes" className="text-xs font-medium text-primary-600 hover:underline">
              Voir toutes →
            </a>
          </div>
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-primary-800 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Classe</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Matière</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Année</th>
                </tr>
              </thead>
              <tbody>
                {classSubjects.map((cs, idx) => (
                  <tr key={cs.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {cs.classes.name}
                      {cs.classes.level && <span className="ml-1 text-xs text-gray-400">({cs.classes.level})</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{cs.subjects.name}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-gray-400 text-xs">{cs.academic_years.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      )}

      {/* ── Recent assessments ───────────────────────────────────────────────── */}
      {assessments.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Évaluations récentes
            </h2>
            <a href="/teacher/grades" className="text-xs font-medium text-primary-600 hover:underline">
              Toutes les notes →
            </a>
          </div>
          <div className="space-y-2">
            {assessments.map((a) => {
              const cs = a.class_subjects as unknown as { classes: { name: string }; subjects: { name: string } }
              const period = a.academic_periods as unknown as { name: string }
              return (
                <a
                  key={a.id}
                  href={`/teacher/grades/${a.id}`}
                  className="flex items-center gap-4 rounded-xl border border-sand-200 bg-white px-5 py-3.5 shadow-sm hover:border-primary-200 hover:bg-primary-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{a.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {cs.classes.name} · {cs.subjects.name} · {period.name}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-block rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                      {TYPE_LABEL[a.assessment_type] ?? a.assessment_type}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">{fmtDate(a.assessment_date)}</p>
                  </div>
                </a>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Recent announcements ─────────────────────────────────────────────── */}
      {announcements.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Annonces récentes
            </h2>
            <a href="/teacher/announcements" className="text-xs font-medium text-primary-600 hover:underline">
              Toutes les annonces →
            </a>
          </div>
          <div className="space-y-2">
            {announcements.map((ann) => (
              <div key={ann.id} className="rounded-xl border border-sand-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${AUDIENCE_COLOR[ann.audience_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {AUDIENCE_LABEL[ann.audience_type] ?? ann.audience_type}
                      </span>
                      <span className="text-xs text-gray-400">{fmtDate(ann.created_at)}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 truncate">{ann.title}</p>
                    {ann.body && <p className="mt-0.5 text-sm text-gray-500 line-clamp-2">{ann.body}</p>}
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
