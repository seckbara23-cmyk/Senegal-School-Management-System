import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { csvResponse, fileToken } from '@/lib/csv'
import { fetchClassTimetableRows, timetableCsv } from '@/lib/timetable-export'

export const dynamic = 'force-dynamic'

// School-admin export of a class timetable. Scope: ?class=<uuid>.
export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: m } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!m) return new NextResponse('Forbidden', { status: 403 })
  const schoolId = (m as { school_id: string }).school_id

  const classId = request.nextUrl.searchParams.get('class') ?? ''
  if (!/^[0-9a-fA-F-]{36}$/.test(classId)) return new NextResponse('Bad Request', { status: 400 })

  // Verify the class belongs to this school.
  const { data: cls } = await supabase
    .from('classes').select('name, section').eq('id', classId).eq('school_id', schoolId).maybeSingle()
  if (!cls) return new NextResponse('Not Found', { status: 404 })
  const c = cls as { name: string; section: string | null }

  const rows = await fetchClassTimetableRows(supabase, schoolId, classId)
  const csv = timetableCsv(rows, 'Enseignant')
  const label = [c.name, c.section].filter(Boolean).join('-')
  const date = new Date().toISOString().slice(0, 10)
  return csvResponse(`emploi-du-temps_${fileToken(label)}_${date}.csv`, csv)
}
