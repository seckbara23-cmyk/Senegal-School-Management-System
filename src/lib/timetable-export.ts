// ─── Timetable CSV export builders (server-only) ─────────────────────────────
//
// Shared fetch + CSV helpers for the timetable export route handlers. Each
// takes the caller's USER-SCOPED Supabase client (RLS enforces access) and a
// resolved school + class (or teacher), and returns rows / CSV.

import type { createClient as createServerClient } from '@/lib/supabase/server'
import { toCsv } from '@/lib/csv'

type Client = ReturnType<typeof createServerClient>

const DAY_LABEL = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
function hhmm(t: string): string { return t.slice(0, 5) }

export type TimetableExportRow = {
  day_of_week: number
  start_time:  string
  end_time:    string
  subject:     string
  who:         string   // teacher (class view) or class (teacher view)
  room:        string
}

// Slots for a class — the "who" column is the teacher.
export async function fetchClassTimetableRows(
  client: Client, schoolId: string, classId: string,
): Promise<TimetableExportRow[]> {
  const { data } = await client
    .from('timetable_slots')
    .select('day_of_week, start_time, end_time, room, class_subjects!class_subject_id(subjects!subject_id(name)), teachers!teacher_id(first_name, last_name)')
    .eq('school_id', schoolId)
    .eq('class_id', classId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true })

  type Row = {
    day_of_week: number; start_time: string; end_time: string; room: string | null
    class_subjects: { subjects: { name: string } | null } | null
    teachers: { first_name: string; last_name: string } | null
  }
  return ((data ?? []) as unknown as Row[]).map((s) => ({
    day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time,
    subject: s.class_subjects?.subjects?.name ?? '',
    who:     s.teachers ? `${s.teachers.first_name} ${s.teachers.last_name}` : '',
    room:    s.room ?? '',
  }))
}

// Slots for a teacher — the "who" column is the class.
export async function fetchTeacherTimetableRows(
  client: Client, schoolId: string, teacherId: string,
): Promise<TimetableExportRow[]> {
  const { data } = await client
    .from('timetable_slots')
    .select('day_of_week, start_time, end_time, room, class_subjects!class_subject_id(subjects!subject_id(name)), classes!class_id(name, section)')
    .eq('school_id', schoolId)
    .eq('teacher_id', teacherId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true })

  type Row = {
    day_of_week: number; start_time: string; end_time: string; room: string | null
    class_subjects: { subjects: { name: string } | null } | null
    classes: { name: string; section: string | null } | null
  }
  return ((data ?? []) as unknown as Row[]).map((s) => ({
    day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time,
    subject: s.class_subjects?.subjects?.name ?? '',
    who:     s.classes ? [s.classes.name, s.classes.section].filter(Boolean).join(' ') : '',
    room:    s.room ?? '',
  }))
}

export function timetableCsv(rows: TimetableExportRow[], whoHeader: string): string {
  return toCsv(
    ['Jour', 'Début', 'Fin', 'Matière', whoHeader, 'Salle'],
    rows.map((r) => [DAY_LABEL[r.day_of_week] ?? String(r.day_of_week), hhmm(r.start_time), hhmm(r.end_time), r.subject, r.who, r.room]),
  )
}
