import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { csvResponse, fileToken } from '@/lib/csv'
import { fetchClassTimetableRows, timetableCsv } from '@/lib/timetable-export'

export const dynamic = 'force-dynamic'

// Parent export of a linked child's class timetable. Scope: ?child=<uuid>,
// validated against the parent's links — a parent can only export their own
// children's timetables.
export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: m } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'parent').eq('status', 'active').maybeSingle()
  if (!m) return new NextResponse('Forbidden', { status: 403 })
  const schoolId = (m as { school_id: string }).school_id

  const { data: parent } = await supabase
    .from('parents').select('id').eq('profile_id', user.id).eq('school_id', schoolId).maybeSingle()
  if (!parent) return new NextResponse('Forbidden', { status: 403 })
  const parentId = (parent as { id: string }).id

  const childId = request.nextUrl.searchParams.get('child') ?? ''
  if (!/^[0-9a-fA-F-]{36}$/.test(childId)) return new NextResponse('Bad Request', { status: 400 })

  // Ownership: the child must be linked to this parent.
  const { data: link } = await supabase
    .from('parent_student_links')
    .select('student_id, students!student_id(first_name, last_name)')
    .eq('parent_id', parentId)
    .eq('student_id', childId)
    .maybeSingle()
  if (!link) return new NextResponse('Forbidden', { status: 403 })
  const child = (link as unknown as { students: { first_name: string; last_name: string } | null }).students

  const { data: enr } = await supabase
    .from('student_class_enrollments').select('class_id')
    .eq('student_id', childId).eq('school_id', schoolId).eq('status', 'active').limit(1).maybeSingle()
  if (!enr) return new NextResponse('Not Found', { status: 404 })

  const rows = await fetchClassTimetableRows(supabase, schoolId, (enr as { class_id: string }).class_id)
  const csv = timetableCsv(rows, 'Enseignant')
  const label = child ? `${child.first_name}-${child.last_name}` : 'eleve'
  const date = new Date().toISOString().slice(0, 10)
  return csvResponse(`emploi-du-temps_${fileToken(label)}_${date}.csv`, csv)
}
