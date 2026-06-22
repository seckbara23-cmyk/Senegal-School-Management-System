import { computeExamResults } from '@/lib/exam-results'
import { csvResponse, fileToken, toCsv } from '@/lib/csv'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-fA-F-]{36}$/

type SessionRow = {
  name: string
  academic_year_id: string
}

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) return new NextResponse('Forbidden', { status: 403 })
  const schoolId = (membership as { school_id: string }).school_id

  const sessionId = request.nextUrl.searchParams.get('session') ?? ''
  if (!UUID_RE.test(sessionId)) return new NextResponse('Bad Request', { status: 400 })

  const { data: sessionData } = await supabase
    .from('exam_sessions')
    .select('name, academic_year_id')
    .eq('id', sessionId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!sessionData) return new NextResponse('Not Found', { status: 404 })
  const session = sessionData as SessionRow

  const classFilter = request.nextUrl.searchParams.get('class') || null
  if (classFilter && !UUID_RE.test(classFilter)) return new NextResponse('Bad Request', { status: 400 })

  if (classFilter) {
    const { data: selectedClass } = await supabase
      .from('classes')
      .select('id')
      .eq('id', classFilter)
      .eq('school_id', schoolId)
      .eq('academic_year_id', session.academic_year_id)
      .maybeSingle()

    if (!selectedClass) return new NextResponse('Not Found', { status: 404 })
  }

  const results = await computeExamResults(
    supabase,
    schoolId,
    session.academic_year_id,
    sessionId,
    classFilter,
  )

  const rows: unknown[][] = []
  for (const cls of results.classes) {
    for (const student of cls.students) {
      rows.push([
        cls.className,
        student.rank ?? '',
        student.name,
        student.admission,
        student.average ?? 'Non not\u00e9',
        student.mention ?? '',
        `${student.gradedCount}/${student.expected}`,
        `${student.completion}%`,
        student.missing,
      ])
    }
  }

  const csv = toCsv([
    'Classe',
    'Rang',
    '\u00c9l\u00e8ve',
    'Matricule',
    'Moyenne',
    'Mention',
    'Saisie',
    'Completion',
    'Manquantes',
  ], rows)

  const date = new Date().toISOString().slice(0, 10)
  return csvResponse(`resultats_${fileToken(session.name)}_${date}.csv`, csv)
}
