// ─── Parent-teacher messaging core (Phase 3G) ───────────────────────────────
//
// Shared, server-side helpers for child-scoped 1:1 threads. Tenant-isolated.
// Every send is audited and notifies the other participant (in-app only).

import type { createClient as createServerClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'

type Client = ReturnType<typeof createServerClient>
export type Viewer = 'parent' | 'teacher' | 'school_admin'

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export type ThreadSummary = {
  id: string
  subject: string | null
  lastMessageAt: string
  studentName: string
  otherName: string
  unread: number
}

export type ThreadMessage = {
  id: string
  body: string
  senderRole: string
  createdAt: string
  mine: boolean
}

// ── Thread lists ──────────────────────────────────────────────────────────────

async function unreadByThread(client: Client, schoolId: string, threadIds: string[], viewer: Viewer): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (threadIds.length === 0) return map
  const col = viewer === 'parent' ? 'read_by_parent_at' : 'read_by_teacher_at'
  const { data } = await client
    .from('messages').select('thread_id')
    .eq('school_id', schoolId).in('thread_id', threadIds).is(col, null).neq('sender_role', viewer)
  for (const m of (data ?? []) as unknown as { thread_id: string }[]) map.set(m.thread_id, (map.get(m.thread_id) ?? 0) + 1)
  return map
}

export async function loadParentThreads(client: Client, schoolId: string, parentId: string): Promise<ThreadSummary[]> {
  const { data } = await client
    .from('message_threads')
    .select('id, subject, last_message_at, students!student_id(first_name, last_name), teachers!teacher_id(first_name, last_name)')
    .eq('school_id', schoolId).eq('parent_id', parentId).order('last_message_at', { ascending: false })
  const rows = (data ?? []) as unknown as { id: string; subject: string | null; last_message_at: string; students: unknown; teachers: unknown }[]
  const unread = await unreadByThread(client, schoolId, rows.map((r) => r.id), 'parent')
  return rows.map((r) => {
    const s = one<{ first_name: string; last_name: string }>(r.students as never)
    const t = one<{ first_name: string; last_name: string }>(r.teachers as never)
    return {
      id: r.id, subject: r.subject, lastMessageAt: r.last_message_at,
      studentName: s ? `${s.first_name} ${s.last_name}` : '—',
      otherName: t ? `${t.first_name} ${t.last_name}` : '—',
      unread: unread.get(r.id) ?? 0,
    }
  })
}

export async function loadTeacherThreads(client: Client, schoolId: string, teacherId: string): Promise<ThreadSummary[]> {
  const { data } = await client
    .from('message_threads')
    .select('id, subject, last_message_at, students!student_id(first_name, last_name), parents!parent_id(first_name, last_name)')
    .eq('school_id', schoolId).eq('teacher_id', teacherId).order('last_message_at', { ascending: false })
  const rows = (data ?? []) as unknown as { id: string; subject: string | null; last_message_at: string; students: unknown; parents: unknown }[]
  const unread = await unreadByThread(client, schoolId, rows.map((r) => r.id), 'teacher')
  return rows.map((r) => {
    const s = one<{ first_name: string; last_name: string }>(r.students as never)
    const p = one<{ first_name: string; last_name: string }>(r.parents as never)
    return {
      id: r.id, subject: r.subject, lastMessageAt: r.last_message_at,
      studentName: s ? `${s.first_name} ${s.last_name}` : '—',
      otherName: p ? `${p.first_name} ${p.last_name}` : '—',
      unread: unread.get(r.id) ?? 0,
    }
  })
}

// ── Thread detail ─────────────────────────────────────────────────────────────

export type ThreadHeader = {
  id: string
  subject: string | null
  schoolId: string
  parentId: string
  teacherId: string
  studentId: string
  studentName: string
  parentName: string
  teacherName: string
}

export async function loadThreadHeader(client: Client, schoolId: string, threadId: string): Promise<ThreadHeader | null> {
  const { data } = await client
    .from('message_threads')
    .select('id, subject, parent_id, teacher_id, student_id, students!student_id(first_name, last_name), parents!parent_id(first_name, last_name), teachers!teacher_id(first_name, last_name)')
    .eq('school_id', schoolId).eq('id', threadId).maybeSingle()
  if (!data) return null
  const r = data as unknown as { id: string; subject: string | null; parent_id: string; teacher_id: string; student_id: string; students: unknown; parents: unknown; teachers: unknown }
  const s = one<{ first_name: string; last_name: string }>(r.students as never)
  const p = one<{ first_name: string; last_name: string }>(r.parents as never)
  const t = one<{ first_name: string; last_name: string }>(r.teachers as never)
  return {
    id: r.id, subject: r.subject, schoolId, parentId: r.parent_id, teacherId: r.teacher_id, studentId: r.student_id,
    studentName: s ? `${s.first_name} ${s.last_name}` : '—',
    parentName: p ? `${p.first_name} ${p.last_name}` : '—',
    teacherName: t ? `${t.first_name} ${t.last_name}` : '—',
  }
}

export async function loadMessages(client: Client, schoolId: string, threadId: string, viewer: Viewer): Promise<ThreadMessage[]> {
  const { data } = await client
    .from('messages').select('id, body, sender_role, created_at')
    .eq('school_id', schoolId).eq('thread_id', threadId).order('created_at', { ascending: true })
  return ((data ?? []) as { id: string; body: string; sender_role: string; created_at: string }[]).map((m) => ({
    id: m.id, body: m.body, senderRole: m.sender_role, createdAt: m.created_at, mine: m.sender_role === viewer,
  }))
}

export async function markThreadRead(client: Client, schoolId: string, threadId: string, viewer: Viewer): Promise<void> {
  if (viewer !== 'parent' && viewer !== 'teacher') return
  const now = new Date().toISOString()
  const col = viewer === 'parent' ? 'read_by_parent_at' : 'read_by_teacher_at'
  const payload = viewer === 'parent' ? { read_by_parent_at: now } : { read_by_teacher_at: now }
  await client.from('messages').update(payload)
    .eq('school_id', schoolId).eq('thread_id', threadId).is(col, null).neq('sender_role', viewer)
}

// ── Get-or-create a child-scoped thread ───────────────────────────────────────

export async function getOrCreateThread(
  client: Client,
  input: { schoolId: string; actorId: string; parentId: string; teacherId: string; studentId: string; subject: string | null },
): Promise<string | null> {
  const { data: existing } = await client
    .from('message_threads').select('id')
    .eq('school_id', input.schoolId).eq('parent_id', input.parentId).eq('teacher_id', input.teacherId).eq('student_id', input.studentId).maybeSingle()
  if (existing) return (existing as { id: string }).id

  const { data: created, error } = await client
    .from('message_threads').insert({ school_id: input.schoolId, parent_id: input.parentId, teacher_id: input.teacherId, student_id: input.studentId, subject: input.subject })
    .select('id').single()
  if (error || !created) { console.error('[messaging] thread create failed', error?.message); return null }
  const threadId = (created as { id: string }).id

  await logAuditEvent(client, {
    actorId: input.actorId, schoolId: input.schoolId, action: 'message_thread_started',
    resourceType: 'message_thread', resourceId: threadId,
    metadata: { parent_id: input.parentId, teacher_id: input.teacherId, student_id: input.studentId },
  })
  return threadId
}

// ── Send (insert message + bump thread + audit + notify) ──────────────────────

export async function sendThreadMessage(
  client: Client,
  input: { schoolId: string; threadId: string; senderRole: Viewer; senderUserId: string; actorEmail?: string | null; body: string },
): Promise<{ error?: string }> {
  const { error } = await client.from('messages').insert({
    school_id: input.schoolId, thread_id: input.threadId,
    sender_role: input.senderRole, sender_user_id: input.senderUserId, body: input.body,
  })
  if (error) {
    console.error('[messaging] insert failed', error.message)
    return { error: "Échec de l'envoi du message." }
  }

  await client.from('message_threads').update({ last_message_at: new Date().toISOString() })
    .eq('id', input.threadId).eq('school_id', input.schoolId)

  await logAuditEvent(client, {
    actorId: input.senderUserId, actorEmail: input.actorEmail, schoolId: input.schoolId,
    action: 'message_sent', resourceType: 'message_thread', resourceId: input.threadId,
    metadata: { sender_role: input.senderRole, length: input.body.length },
  })

  await notifyThreadMessage(client, input.schoolId, input.threadId, input.senderRole, input.body)
  return {}
}

// Resolve and notify the OTHER party (in-app, best-effort).
async function notifyThreadMessage(client: Client, schoolId: string, threadId: string, senderRole: Viewer, body: string): Promise<void> {
  try {
    const header = await loadThreadHeader(client, schoolId, threadId)
    if (!header) return

    const recipients: string[] = []
    if (senderRole !== 'teacher') {
      const { data: t } = await client.from('teachers').select('profile_id').eq('id', header.teacherId).eq('school_id', schoolId).maybeSingle()
      const pid = (t as { profile_id: string | null } | null)?.profile_id; if (pid) recipients.push(pid)
    }
    if (senderRole !== 'parent') {
      const { data: p } = await client.from('parents').select('profile_id').eq('id', header.parentId).eq('school_id', schoolId).maybeSingle()
      const pid = (p as { profile_id: string | null } | null)?.profile_id; if (pid) recipients.push(pid)
    }
    if (recipients.length === 0) return

    const snippet = body.length > 90 ? body.slice(0, 90) + '…' : body
    const senderName = senderRole === 'parent' ? header.parentName : senderRole === 'teacher' ? header.teacherName : "L'administration"
    await Promise.all(recipients.map((userId) =>
      createNotification(client, {
        userId, type: 'message_received',
        title: `Nouveau message de ${senderName}`,
        body: `À propos de ${header.studentName} : ${snippet}`,
        schoolId, metadata: { thread_id: threadId, student_id: header.studentId },
      })))
  } catch (err) {
    console.error('[messaging] notify failed', err)
  }
}
