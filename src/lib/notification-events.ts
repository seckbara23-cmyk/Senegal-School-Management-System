// ─── Event notification helpers (Phase 36.2) ────────────────────────────────
//
// Reusable, server-side helpers that turn key school events into in-app
// notifications. Each helper resolves its recipients from the database, then
// fans out via createNotification(). Every helper is BEST-EFFORT: it is wrapped
// so it never throws and never blocks the mutation that triggered it — call it
// after the main write has succeeded (and before any redirect()).
//
// In-app only. No email / SMS / WhatsApp.

import type { createClient as createServerClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

// The session (or service) server client. Type-only import → erased at build.
type NotifyClient = ReturnType<typeof createServerClient>

// ── Formatting ───────────────────────────────────────────────────────────────

function fmtAmount(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Recipient resolution (batched) ───────────────────────────────────────────

type StudentInfo = { name: string; profileId: string | null }

async function resolveStudents(
  client: NotifyClient,
  schoolId: string,
  studentIds: string[],
): Promise<Map<string, StudentInfo>> {
  const map = new Map<string, StudentInfo>()
  if (studentIds.length === 0) return map

  const { data } = await client
    .from('students')
    .select('id, first_name, last_name, profile_id')
    .eq('school_id', schoolId)
    .in('id', studentIds)

  type Row = { id: string; first_name: string; last_name: string; profile_id: string | null }
  for (const r of (data ?? []) as Row[]) {
    map.set(r.id, { name: `${r.first_name} ${r.last_name}`.trim(), profileId: r.profile_id })
  }
  return map
}

async function resolveParentProfilesByStudent(
  client: NotifyClient,
  schoolId: string,
  studentIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (studentIds.length === 0) return map

  const { data } = await client
    .from('parent_student_links')
    .select('student_id, parents!parent_id(profile_id)')
    .eq('school_id', schoolId)
    .in('student_id', studentIds)

  type Row = { student_id: string; parents: { profile_id: string | null } | null }
  for (const r of (data ?? []) as unknown as Row[]) {
    const pid = r.parents?.profile_id
    if (!pid) continue
    const list = map.get(r.student_id) ?? []
    list.push(pid)
    map.set(r.student_id, list)
  }
  return map
}

// Unique non-null recipient profile IDs for a single student (student + parents).
function recipientsForStudent(
  studentId: string,
  students: Map<string, StudentInfo>,
  parents: Map<string, string[]>,
): string[] {
  const set = new Set<string>()
  const sp = students.get(studentId)?.profileId
  if (sp) set.add(sp)
  for (const pid of parents.get(studentId) ?? []) set.add(pid)
  return Array.from(set)
}

// ── Finance: invoice created ─────────────────────────────────────────────────

export async function notifyInvoiceCreated(
  client: NotifyClient,
  input: {
    schoolId:      string
    invoiceId:     string
    invoiceNumber: string
    studentId:     string
    amount:        number
    dueDate:       string | null
  },
): Promise<void> {
  try {
    const [students, parents] = await Promise.all([
      resolveStudents(client, input.schoolId, [input.studentId]),
      resolveParentProfilesByStudent(client, input.schoolId, [input.studentId]),
    ])
    const studentName = students.get(input.studentId)?.name ?? "l'élève"
    const recipients = recipientsForStudent(input.studentId, students, parents)
    if (recipients.length === 0) return

    const metadata = {
      invoice_id:     input.invoiceId,
      invoice_number: input.invoiceNumber,
      student_id:     input.studentId,
      amount:         input.amount,
      due_date:       input.dueDate,
    }

    await Promise.all(
      recipients.map((userId) =>
        createNotification(client, {
          userId,
          type:     'invoice_created',
          title:    'Nouvelle facture disponible',
          body:     `Une nouvelle facture de ${fmtAmount(input.amount)} est disponible pour ${studentName}.`,
          schoolId: input.schoolId,
          metadata,
        }),
      ),
    )
  } catch (err) {
    console.error('[notify] notifyInvoiceCreated failed', err)
  }
}

// ── Finance: payment recorded ────────────────────────────────────────────────

export async function notifyPaymentRecorded(
  client: NotifyClient,
  input: {
    schoolId:      string
    paymentId:     string
    receiptNumber: string | null
    invoiceId:     string
    studentId:     string
    amount:        number
    paymentMethod: string
  },
): Promise<void> {
  try {
    // Recipients: active school_admin + finance_officer users for the school.
    const { data: staff } = await client
      .from('school_memberships')
      .select('user_id')
      .eq('school_id', input.schoolId)
      .in('role', ['school_admin', 'finance_officer'])
      .eq('status', 'active')

    const recipients = Array.from(
      new Set(((staff ?? []) as { user_id: string }[]).map((s) => s.user_id)),
    )
    if (recipients.length === 0) return

    const students = await resolveStudents(client, input.schoolId, [input.studentId])
    const studentName = students.get(input.studentId)?.name ?? "l'élève"

    const metadata = {
      payment_id:     input.paymentId,
      receipt_number: input.receiptNumber,
      invoice_id:     input.invoiceId,
      student_id:     input.studentId,
      amount:         input.amount,
      payment_method: input.paymentMethod,
    }

    await Promise.all(
      recipients.map((userId) =>
        createNotification(client, {
          userId,
          type:     'payment_recorded',
          title:    'Paiement enregistré',
          body:     `Un paiement de ${fmtAmount(input.amount)} a été enregistré pour ${studentName}.`,
          schoolId: input.schoolId,
          metadata,
        }),
      ),
    )
  } catch (err) {
    console.error('[notify] notifyPaymentRecorded failed', err)
  }
}

// ── Attendance: non-present statuses ─────────────────────────────────────────

const ATTENDANCE_PHRASE: Record<string, string> = {
  absent:  'absent',
  late:    'en retard',
  excused: 'excusé',
}

export async function notifyAttendanceRecorded(
  client: NotifyClient,
  input: {
    schoolId:  string
    sessionId: string
    classId:   string
    date:      string
    // Only non-present records should be passed in.
    records:   { studentId: string; status: 'absent' | 'late' | 'excused' }[]
  },
): Promise<void> {
  try {
    if (input.records.length === 0) return
    const studentIds = Array.from(new Set(input.records.map((r) => r.studentId)))

    const [students, parents] = await Promise.all([
      resolveStudents(client, input.schoolId, studentIds),
      resolveParentProfilesByStudent(client, input.schoolId, studentIds),
    ])

    const dateLabel = fmtDate(input.date)

    const calls: Promise<void>[] = []
    for (const rec of input.records) {
      const studentName = students.get(rec.studentId)?.name ?? "L'élève"
      const recipients = recipientsForStudent(rec.studentId, students, parents)
      if (recipients.length === 0) continue

      const phrase = ATTENDANCE_PHRASE[rec.status] ?? rec.status
      const metadata = {
        attendance_session_id: input.sessionId,
        student_id:            rec.studentId,
        class_id:              input.classId,
        date:                  input.date,
        status:                rec.status,
      }

      for (const userId of recipients) {
        calls.push(
          createNotification(client, {
            userId,
            type:     'attendance_recorded',
            title:    'Présence mise à jour',
            body:     `${studentName} a été marqué ${phrase} le ${dateLabel}.`,
            schoolId: input.schoolId,
            metadata,
          }),
        )
      }
    }

    await Promise.all(calls)
  } catch (err) {
    console.error('[notify] notifyAttendanceRecorded failed', err)
  }
}

// ── Assessment created ───────────────────────────────────────────────────────

export async function notifyAssessmentCreated(
  client: NotifyClient,
  input: {
    schoolId:         string
    assessmentId:     string
    classSubjectId:   string
    academicPeriodId: string
    assessmentDate:   string | null
  },
): Promise<void> {
  try {
    // Resolve class + subject from the class_subject link.
    const { data: cs } = await client
      .from('class_subjects')
      .select('class_id, subject_id, subjects!subject_id(name)')
      .eq('id', input.classSubjectId)
      .eq('school_id', input.schoolId)
      .maybeSingle()

    if (!cs) return
    type CsRow = { class_id: string; subject_id: string; subjects: { name: string } | null }
    const link = cs as unknown as CsRow
    const subjectName = link.subjects?.name ?? 'la matière'

    // Enrolled students of the class.
    const { data: enrollments } = await client
      .from('student_class_enrollments')
      .select('student_id')
      .eq('class_id', link.class_id)
      .eq('school_id', input.schoolId)
      .eq('status', 'active')

    const studentIds = Array.from(
      new Set(((enrollments ?? []) as { student_id: string }[]).map((e) => e.student_id)),
    )
    if (studentIds.length === 0) return

    const [students, parents] = await Promise.all([
      resolveStudents(client, input.schoolId, studentIds),
      resolveParentProfilesByStudent(client, input.schoolId, studentIds),
    ])

    // Unique recipients across the whole class (students + their parents).
    const recipients = new Set<string>()
    for (const sid of studentIds) {
      for (const uid of recipientsForStudent(sid, students, parents)) recipients.add(uid)
    }
    if (recipients.size === 0) return

    const dateLabel = fmtDate(input.assessmentDate)
    const body = dateLabel
      ? `Une nouvelle évaluation de ${subjectName} est prévue pour le ${dateLabel}.`
      : `Une nouvelle évaluation de ${subjectName} a été créée.`

    const metadata = {
      assessment_id:      input.assessmentId,
      class_subject_id:   input.classSubjectId,
      class_id:           link.class_id,
      subject_id:         link.subject_id,
      academic_period_id: input.academicPeriodId,
      assessment_date:    input.assessmentDate,
    }

    await Promise.all(
      Array.from(recipients).map((userId) =>
        createNotification(client, {
          userId,
          type:     'assessment_created',
          title:    'Nouvelle évaluation',
          body,
          schoolId: input.schoolId,
          metadata,
        }),
      ),
    )
  } catch (err) {
    console.error('[notify] notifyAssessmentCreated failed', err)
  }
}

// ── Bulletin published (foundation only) ─────────────────────────────────────
//
// There is no "publish bulletin" workflow yet — bulletins are computed and
// printed on demand (see /school/academics/bulletins), never persisted/published.
// This helper is provided for readiness; wire it in Phase 36.3 once a publish
// action exists. It is intentionally NOT called anywhere today.

export async function notifyBulletinPublished(
  client: NotifyClient,
  input: {
    schoolId:         string
    studentId:        string
    academicPeriodId: string
    metadata?:        Record<string, unknown>
  },
): Promise<void> {
  try {
    const [students, parents] = await Promise.all([
      resolveStudents(client, input.schoolId, [input.studentId]),
      resolveParentProfilesByStudent(client, input.schoolId, [input.studentId]),
    ])
    const studentName = students.get(input.studentId)?.name ?? "l'élève"
    const recipients = recipientsForStudent(input.studentId, students, parents)
    if (recipients.length === 0) return

    await Promise.all(
      recipients.map((userId) =>
        createNotification(client, {
          userId,
          type:     'bulletin_published',
          title:    'Bulletin disponible',
          body:     `Le bulletin de ${studentName} est disponible.`,
          schoolId: input.schoolId,
          metadata: { student_id: input.studentId, academic_period_id: input.academicPeriodId, ...input.metadata },
        }),
      ),
    )
  } catch (err) {
    console.error('[notify] notifyBulletinPublished failed', err)
  }
}

// ── Timetable changes ────────────────────────────────────────────────────────
//
// Recipients of a slot change: the assigned teacher + all actively enrolled
// students of the class + their linked parents (de-duplicated).

const TIMETABLE_DAY = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
function ttDay(n: number): string { return TIMETABLE_DAY[n] ?? `jour ${n}` }
function ttTime(t: string): string { return t.slice(0, 5) }

export type TimetableNotifyInput = {
  schoolId:        string
  slotId:          string
  classId:         string
  classSubjectId:  string
  teacherId:       string | null
  dayOfWeek:       number
  startTime:       string
  endTime:         string
}

async function timetableSubjectName(client: NotifyClient, schoolId: string, classSubjectId: string): Promise<string> {
  const { data } = await client
    .from('class_subjects')
    .select('subjects!subject_id(name)')
    .eq('id', classSubjectId)
    .eq('school_id', schoolId)
    .maybeSingle()
  return (data as unknown as { subjects: { name: string } | null } | null)?.subjects?.name ?? 'cours'
}

async function timetableRecipients(client: NotifyClient, input: TimetableNotifyInput): Promise<string[]> {
  const set = new Set<string>()

  // Assigned teacher.
  if (input.teacherId) {
    const { data: t } = await client
      .from('teachers').select('profile_id').eq('id', input.teacherId).eq('school_id', input.schoolId).maybeSingle()
    const pid = (t as { profile_id: string | null } | null)?.profile_id
    if (pid) set.add(pid)
  }

  // Actively enrolled students of the class.
  const { data: enr } = await client
    .from('student_class_enrollments')
    .select('student_id')
    .eq('school_id', input.schoolId)
    .eq('class_id', input.classId)
    .eq('status', 'active')
  const studentIds = Array.from(new Set(((enr ?? []) as { student_id: string }[]).map((e) => e.student_id)))

  if (studentIds.length > 0) {
    const [students, parents] = await Promise.all([
      resolveStudents(client, input.schoolId, studentIds),
      resolveParentProfilesByStudent(client, input.schoolId, studentIds),
    ])
    for (const sid of studentIds) {
      for (const uid of recipientsForStudent(sid, students, parents)) set.add(uid)
    }
  }

  return Array.from(set)
}

function timetableMetadata(input: TimetableNotifyInput) {
  return {
    timetable_slot_id: input.slotId,
    class_id:          input.classId,
    class_subject_id:  input.classSubjectId,
    teacher_id:        input.teacherId,
    day_of_week:       input.dayOfWeek,
    start_time:        input.startTime,
    end_time:          input.endTime,
  }
}

export async function notifyTimetableCreated(client: NotifyClient, input: TimetableNotifyInput): Promise<void> {
  try {
    const [subject, recipients] = await Promise.all([
      timetableSubjectName(client, input.schoolId, input.classSubjectId),
      timetableRecipients(client, input),
    ])
    if (recipients.length === 0) return
    const body = `Un nouveau cours de ${subject} a été ajouté le ${ttDay(input.dayOfWeek)} de ${ttTime(input.startTime)} à ${ttTime(input.endTime)}.`
    const metadata = timetableMetadata(input)
    await Promise.all(recipients.map((userId) =>
      createNotification(client, { userId, type: 'timetable_created', title: 'Nouvel horaire', body, schoolId: input.schoolId, metadata })))
  } catch (err) {
    console.error('[notify] notifyTimetableCreated failed', err)
  }
}

export async function notifyTimetableUpdated(client: NotifyClient, input: TimetableNotifyInput): Promise<void> {
  try {
    const [subject, recipients] = await Promise.all([
      timetableSubjectName(client, input.schoolId, input.classSubjectId),
      timetableRecipients(client, input),
    ])
    if (recipients.length === 0) return
    const body = `Le cours de ${subject} a été modifié.`
    const metadata = timetableMetadata(input)
    await Promise.all(recipients.map((userId) =>
      createNotification(client, { userId, type: 'timetable_updated', title: 'Horaire modifié', body, schoolId: input.schoolId, metadata })))
  } catch (err) {
    console.error('[notify] notifyTimetableUpdated failed', err)
  }
}

export async function notifyTimetableDeleted(client: NotifyClient, input: TimetableNotifyInput): Promise<void> {
  try {
    const [subject, recipients] = await Promise.all([
      timetableSubjectName(client, input.schoolId, input.classSubjectId),
      timetableRecipients(client, input),
    ])
    if (recipients.length === 0) return
    const body = `Le cours de ${subject} prévu le ${ttDay(input.dayOfWeek)} de ${ttTime(input.startTime)} à ${ttTime(input.endTime)} a été supprimé.`
    const metadata = timetableMetadata(input)
    await Promise.all(recipients.map((userId) =>
      createNotification(client, { userId, type: 'timetable_deleted', title: 'Cours annulé', body, schoolId: input.schoolId, metadata })))
  } catch (err) {
    console.error('[notify] notifyTimetableDeleted failed', err)
  }
}
