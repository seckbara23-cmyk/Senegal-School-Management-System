// ─── Parent snapshot (Context Builder layer, parent-scoped, derived) ─────────
//
// Aggregates ONLY what the parent is allowed to see — their LINKED children and
// each child's grades/risk, attendance, homework, own invoices, transport and the
// parent's own message threads. Every query is bounded by the parent's linked
// student ids (from parent_student_links) and runs under parent RLS, so no other
// student/parent, no school-wide stats, and no finance beyond the children's own
// invoices are reachable. The narrative engine consumes this object and never
// queries.

import type { createClient } from '@/lib/supabase/server'
import { loadStudentSnapshot } from './student-snapshot'
import { loadParentThreads } from '@/lib/messaging'
import type { RiskLevel } from '@/lib/academic/risk-engine'
import type { Locale } from '@/lib/i18n/locale'

type Client = ReturnType<typeof createClient>

export type ChildSummary = {
  studentId: string
  firstName: string
  name: string
  className: string
  average: number | null
  level: RiskLevel
  watch: string[]                                   // academic + attendance reasons only
  attendance: { rate: number | null; absent: number; late: number }
  homework: { upcoming: number; next: { title: string; subject: string; due: string | null } | null }
  finance: { outstanding: number; overdue: number; nextDue: { amount: number; due: string } | null }
  transport: { route: string; stop: string | null; pickup: string | null } | null
  bulletinAvailable: boolean
}

export type ParentSnapshot = {
  generatedAt: string
  hasChildren: boolean
  parentName: string
  children: ChildSummary[]
  messages: { threads: number; unread: number; unreadFrom: { from: string; subject: string }[] }
  totals: { children: number; outstanding: number; overdue: number; upcomingHomework: number; watch: number }
}

const round0 = (n: number) => Math.round(n)
const WATCH_TOKENS = /(moyenne|mati[èe]re|[ée]chec|baisse|classement|point|absence|retard)/i

export async function loadParentSnapshot(
  supabase: Client,
  args: { schoolId: string; parentId: string; parentName: string; locale?: Locale },
): Promise<ParentSnapshot> {
  const { schoolId, parentId, parentName } = args
  const locale: Locale = args.locale ?? 'fr'
  const todayISO = new Date().toISOString().slice(0, 10)

  const { data: linksData } = await supabase
    .from('parent_student_links')
    .select('student_id, students!student_id(first_name, last_name)')
    .eq('parent_id', parentId).eq('school_id', schoolId)
  type Link = { student_id: string; students: { first_name: string; last_name: string } | null }
  const links = (linksData ?? []) as unknown as Link[]
  const childIds = links.map((l) => l.student_id)

  const messagesThreads = await loadParentThreads(supabase, schoolId, parentId)
  const messages = {
    threads: messagesThreads.length,
    unread: messagesThreads.reduce((s, t) => s + t.unread, 0),
    unreadFrom: messagesThreads.filter((t) => t.unread > 0).slice(0, 4).map((t) => ({ from: t.otherName, subject: t.subject ?? 'Conversation' })),
  }

  if (childIds.length === 0) {
    return { generatedAt: new Date().toISOString(), hasChildren: false, parentName, children: [], messages, totals: { children: 0, outstanding: 0, overdue: 0, upcomingHomework: 0, watch: 0 } }
  }

  // Active year + each child's current class.
  const { data: yr } = await supabase.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  const yearId = (yr as { id: string } | null)?.id ?? null
  const classByChild = new Map<string, { classId: string; className: string }>()
  const childrenByClass = new Map<string, string[]>()
  if (yearId) {
    const { data: enr } = await supabase
      .from('student_class_enrollments').select('student_id, class_id, classes!class_id(name, section)')
      .eq('school_id', schoolId).eq('academic_year_id', yearId).eq('status', 'active').in('student_id', childIds)
    for (const e of (enr ?? []) as unknown as { student_id: string; class_id: string; classes: { name: string; section: string | null } | null }[]) {
      const className = [e.classes?.name, e.classes?.section].filter(Boolean).join(' ') || '—'
      classByChild.set(e.student_id, { classId: e.class_id, className })
      const list = childrenByClass.get(e.class_id) ?? []; list.push(e.student_id); childrenByClass.set(e.class_id, list)
    }
  }
  const classIds = Array.from(childrenByClass.keys())

  // Batched: attendance, invoices, homework. Per-child: risk snapshot + transport.
  const [attRes, invRes, hwRes, snapshots, transports] = await Promise.all([
    supabase.from('attendance_records').select('student_id, status').eq('school_id', schoolId).in('student_id', childIds),
    supabase.from('student_invoices').select('student_id, total_amount, amount_paid, due_date, status').eq('school_id', schoolId).in('student_id', childIds).in('status', ['unpaid', 'partial']),
    classIds.length
      ? supabase.from('homework').select('title, due_date, class_id, class_subjects!class_subject_id(subjects!subject_id(name))').eq('school_id', schoolId).in('class_id', classIds)
      : Promise.resolve({ data: [] }),
    Promise.all(links.map((l) => loadStudentSnapshot(supabase, schoolId, l.student_id, { firstName: l.students?.first_name ?? '', lastName: l.students?.last_name ?? '', className: classByChild.get(l.student_id)?.className }, locale))),
    Promise.all(links.map(async (l) => {
      const { data } = await supabase.rpc('parent_child_transport', { p_student_id: l.student_id })
      const row = ((data ?? []) as { route_name: string; stop_name: string | null; pickup_time: string | null }[])[0] ?? null
      return { studentId: l.student_id, row }
    })),
  ])

  // Attendance per child.
  const attBy = new Map<string, { total: number; absent: number; late: number }>()
  for (const r of (attRes.data ?? []) as { student_id: string; status: string }[]) {
    const cur = attBy.get(r.student_id) ?? { total: 0, absent: 0, late: 0 }
    cur.total++; if (r.status === 'absent') cur.absent++; else if (r.status === 'late') cur.late++
    attBy.set(r.student_id, cur)
  }

  // Invoices per child → outstanding / overdue / next due.
  const finBy = new Map<string, { outstanding: number; overdue: number; nextDue: { amount: number; due: string } | null }>()
  for (const i of (invRes.data ?? []) as { student_id: string; total_amount: number; amount_paid: number; due_date: string | null }[]) {
    const cur = finBy.get(i.student_id) ?? { outstanding: 0, overdue: 0, nextDue: null }
    const remaining = i.total_amount - i.amount_paid
    cur.outstanding += remaining
    if (i.due_date && i.due_date < todayISO) cur.overdue += remaining
    if (i.due_date && (!cur.nextDue || i.due_date < cur.nextDue.due)) cur.nextDue = { amount: remaining, due: i.due_date }
    finBy.set(i.student_id, cur)
  }

  // Homework per class → next upcoming.
  type HwRow = { title: string; due_date: string | null; class_id: string; class_subjects: { subjects: { name: string } | null } | null }
  const hwByClass = new Map<string, { title: string; subject: string; due: string | null }[]>()
  for (const h of (hwRes.data ?? []) as unknown as HwRow[]) {
    if (h.due_date && h.due_date < todayISO) continue // upcoming only
    const list = hwByClass.get(h.class_id) ?? []
    list.push({ title: h.title, subject: h.class_subjects?.subjects?.name ?? '—', due: h.due_date })
    hwByClass.set(h.class_id, list)
  }
  hwByClass.forEach((list) => list.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999')))

  const transportBy = new Map(transports.map((t) => [t.studentId, t.row]))

  const children: ChildSummary[] = links.map((l, idx) => {
    const sid = l.student_id
    const snap = snapshots[idx]
    const cls = classByChild.get(sid)
    const att = attBy.get(sid) ?? { total: 0, absent: 0, late: 0 }
    const fin = finBy.get(sid) ?? { outstanding: 0, overdue: 0, nextDue: null }
    const hw = cls ? hwByClass.get(cls.classId) ?? [] : []
    const tr = transportBy.get(sid)
    const firstName = l.students?.first_name ?? ''
    return {
      studentId: sid,
      firstName,
      name: `${l.students?.last_name ?? ''} ${firstName}`.trim() || '—',
      className: snap?.className ?? cls?.className ?? '—',
      average: snap?.average ?? null,
      level: snap?.level ?? 'low',
      watch: (snap?.reasons ?? []).filter((r) => WATCH_TOKENS.test(r)),
      attendance: { rate: att.total > 0 ? round0(((att.total - att.absent) / att.total) * 100) : null, absent: att.absent, late: att.late },
      homework: { upcoming: hw.length, next: hw[0] ?? null },
      finance: fin,
      transport: tr ? { route: tr.route_name, stop: tr.stop_name, pickup: tr.pickup_time } : null,
      bulletinAvailable: (snap?.average ?? null) !== null,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    hasChildren: true,
    parentName,
    children,
    messages,
    totals: {
      children: children.length,
      outstanding: children.reduce((s, c) => s + c.finance.outstanding, 0),
      overdue: children.reduce((s, c) => s + c.finance.overdue, 0),
      upcomingHomework: children.reduce((s, c) => s + c.homework.upcoming, 0),
      watch: children.filter((c) => c.level !== 'low').length,
    },
  }
}
