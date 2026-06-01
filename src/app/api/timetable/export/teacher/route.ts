import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { csvResponse, fileToken } from '@/lib/csv'
import { fetchTeacherTimetableRows, timetableCsv } from '@/lib/timetable-export'

export const dynamic = 'force-dynamic'

// Teacher export of their own timetable (no params — scope is always self).
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: m } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'teacher').eq('status', 'active').maybeSingle()
  if (!m) return new NextResponse('Forbidden', { status: 403 })
  const schoolId = (m as { school_id: string }).school_id

  const { data: teacher } = await supabase
    .from('teachers').select('id, first_name, last_name').eq('profile_id', user.id).eq('school_id', schoolId).maybeSingle()
  if (!teacher) return new NextResponse('Forbidden', { status: 403 })
  const t = teacher as { id: string; first_name: string; last_name: string }

  const rows = await fetchTeacherTimetableRows(supabase, schoolId, t.id)
  const csv = timetableCsv(rows, 'Classe')
  const date = new Date().toISOString().slice(0, 10)
  return csvResponse(`emploi-du-temps_${fileToken(`${t.first_name}-${t.last_name}`)}_${date}.csv`, csv)
}
