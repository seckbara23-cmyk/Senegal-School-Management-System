// ─── Parent engagement analytics (derived, never persisted) ──────────────────
//
// No login/session tracking exists, so engagement is derived ONLY from real
// in-app signals: notification read rate, parent-initiated messaging, and fee
// punctuality. The composite level is computed on read and never stored.

import type { createClient as createServerClient } from '@/lib/supabase/server'

type Client = ReturnType<typeof createServerClient>

export type EngagementLevel = 'engaged' | 'moderate' | 'low'

export type FamilyEngagement = {
  parentId: string
  name: string
  childCount: number
  readRate: number | null   // % notifications read
  sentMessage: boolean
  unread: number
  hasOverdue: boolean
  score: number             // 0–100
  level: EngagementLevel
}

export type EngagementAnalytics = {
  families: FamilyEngagement[]
  totals: { parents: number; avgReadRate: number | null; engaged: number; moderate: number; low: number; responders: number; withThreads: number }
}

export async function loadEngagementAnalytics(client: Client, schoolId: string): Promise<EngagementAnalytics> {
  const today = new Date().toISOString().split('T')[0]

  const { data: parentData } = await client.from('parents').select('id, first_name, last_name, profile_id').eq('school_id', schoolId)
  type P = { id: string; first_name: string; last_name: string; profile_id: string | null }
  const parents = (parentData ?? []) as P[]
  if (parents.length === 0) return { families: [], totals: { parents: 0, avgReadRate: null, engaged: 0, moderate: 0, low: 0, responders: 0, withThreads: 0 } }

  const profileIds = parents.map((p) => p.profile_id).filter((x): x is string => !!x)
  const parentByProfile = new Map(parents.filter((p) => p.profile_id).map((p) => [p.profile_id as string, p.id]))

  const [notifRes, linksRes, threadRes] = await Promise.all([
    profileIds.length > 0 ? client.from('notifications').select('user_id, read_at').eq('school_id', schoolId).in('user_id', profileIds) : Promise.resolve({ data: [] as unknown[] }),
    client.from('parent_student_links').select('parent_id, student_id').eq('school_id', schoolId),
    client.from('message_threads').select('id, parent_id').eq('school_id', schoolId),
  ])

  // Notification read rate per parent.
  const notif = new Map<string, { total: number; read: number }>()
  for (const n of (notifRes.data ?? []) as { user_id: string; read_at: string | null }[]) {
    const pid = parentByProfile.get(n.user_id); if (!pid) continue
    const cur = notif.get(pid) ?? { total: 0, read: 0 }; cur.total++; if (n.read_at) cur.read++; notif.set(pid, cur)
  }

  // Children per parent + their student ids.
  const childrenByParent = new Map<string, string[]>()
  const allStudentIds = new Set<string>()
  for (const l of (linksRes.data ?? []) as { parent_id: string; student_id: string }[]) {
    const list = childrenByParent.get(l.parent_id) ?? []; list.push(l.student_id); childrenByParent.set(l.parent_id, list); allStudentIds.add(l.student_id)
  }

  // Overdue invoices per student → per parent.
  const overdueStudents = new Set<string>()
  if (allStudentIds.size > 0) {
    const { data: inv } = await client.from('student_invoices').select('student_id, due_date, status').eq('school_id', schoolId).in('status', ['unpaid', 'partial']).lt('due_date', today).not('due_date', 'is', null).in('student_id', Array.from(allStudentIds))
    for (const i of (inv ?? []) as { student_id: string }[]) overdueStudents.add(i.student_id)
  }

  // Threads + messaging per parent.
  const threadParent = new Map<string, string>()
  const threadsByParent = new Map<string, number>()
  for (const t of (threadRes.data ?? []) as { id: string; parent_id: string }[]) { threadParent.set(t.id, t.parent_id); threadsByParent.set(t.parent_id, (threadsByParent.get(t.parent_id) ?? 0) + 1) }
  const sentByParent = new Set<string>()
  const unreadByParent = new Map<string, number>()
  if (threadParent.size > 0) {
    const { data: msgs } = await client.from('messages').select('thread_id, sender_role, read_by_parent_at').eq('school_id', schoolId)
    for (const m of (msgs ?? []) as { thread_id: string; sender_role: string; read_by_parent_at: string | null }[]) {
      const pid = threadParent.get(m.thread_id); if (!pid) continue
      if (m.sender_role === 'parent') sentByParent.add(pid)
      else if (!m.read_by_parent_at) unreadByParent.set(pid, (unreadByParent.get(pid) ?? 0) + 1)
    }
  }

  const families: FamilyEngagement[] = parents.map((p) => {
    const n = notif.get(p.id)
    const readRate = n && n.total > 0 ? Math.round((n.read / n.total) * 100) : null
    const sentMessage = sentByParent.has(p.id)
    const children = childrenByParent.get(p.id) ?? []
    const hasOverdue = children.some((sid) => overdueStudents.has(sid))

    let score = readRate !== null ? Math.round(readRate * 0.4) : 20 // read (40) — neutral 20 if no notifications yet
    if (sentMessage) score += 30                                    // initiated/active messaging (30)
    if (!hasOverdue) score += 30                                    // fees on time (30)
    score = Math.min(100, score)
    const level: EngagementLevel = score >= 60 ? 'engaged' : score >= 30 ? 'moderate' : 'low'

    return { parentId: p.id, name: `${p.last_name} ${p.first_name}`.trim() || '—', childCount: children.length, readRate, sentMessage, unread: unreadByParent.get(p.id) ?? 0, hasOverdue, score, level }
  }).filter((f) => f.childCount > 0).sort((a, b) => a.score - b.score)

  const rates = families.map((f) => f.readRate).filter((r): r is number => r !== null)
  return {
    families,
    totals: {
      parents: families.length,
      avgReadRate: rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null,
      engaged: families.filter((f) => f.level === 'engaged').length,
      moderate: families.filter((f) => f.level === 'moderate').length,
      low: families.filter((f) => f.level === 'low').length,
      responders: families.filter((f) => f.sentMessage).length,
      withThreads: Array.from(threadsByParent.keys()).length,
    },
  }
}
