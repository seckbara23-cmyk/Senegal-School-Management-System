import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { csvResponse, fileToken } from '@/lib/csv'
import { fetchClassTimetableRows, timetableCsv } from '@/lib/timetable-export'

export const dynamic = 'force-dynamic'

// Student export of their own class timetable (scope = own active enrollment).
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: m } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'student').eq('status', 'active').maybeSingle()
  if (!m) return new NextResponse('Forbidden', { status: 403 })
  const schoolId = (m as { school_id: string }).school_id

  const { data: student } = await supabase
    .from('students').select('id, first_name, last_name').eq('profile_id', user.id).eq('school_id', schoolId).maybeSingle()
  if (!student) return new NextResponse('Forbidden', { status: 403 })
  const s = student as { id: string; first_name: string; last_name: string }

  const { data: enr } = await supabase
    .from('student_class_enrollments').select('class_id')
    .eq('student_id', s.id).eq('school_id', schoolId).eq('status', 'active').limit(1).maybeSingle()
  if (!enr) return new NextResponse('Not Found', { status: 404 })

  const rows = await fetchClassTimetableRows(supabase, schoolId, (enr as { class_id: string }).class_id)
  const csv = timetableCsv(rows, 'Enseignant')
  const date = new Date().toISOString().slice(0, 10)
  return csvResponse(`emploi-du-temps_${fileToken(`${s.first_name}-${s.last_name}`)}_${date}.csv`, csv)
}
