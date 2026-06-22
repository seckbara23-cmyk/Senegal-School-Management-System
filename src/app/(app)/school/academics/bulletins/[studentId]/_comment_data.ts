import type { createClient } from '@/lib/supabase/server'

type SchoolClient = ReturnType<typeof createClient>

const round2 = (n: number) => Math.round(n * 100) / 100

// Weighted average for ONE student in a given period (same formula as the
// bulletin), used to derive the previous-period average for the comment.
export async function loadPreviousAverage(
  supabase: SchoolClient,
  schoolId: string,
  studentId: string,
  yearId: string,
  startsOn: string | null,
  csList: { id: string; coefficient: number }[],
): Promise<number | null> {
  if (!startsOn || csList.length === 0) return null

  const { data: prior } = await supabase
    .from('academic_periods').select('id')
    .eq('school_id', schoolId).eq('academic_year_id', yearId).lt('starts_on', startsOn)
    .order('starts_on', { ascending: false }).limit(1).maybeSingle()
  if (!prior) return null

  const csIds = csList.map((c) => c.id)
  const { data: assessData } = await supabase
    .from('assessments').select('id, coefficient, max_score, class_subject_id')
    .eq('school_id', schoolId).eq('academic_period_id', (prior as { id: string }).id).in('class_subject_id', csIds)
  const assessList = (assessData ?? []) as { id: string; coefficient: number; max_score: number; class_subject_id: string }[]
  if (assessList.length === 0) return null

  const { data: gradesData } = await supabase
    .from('grades').select('assessment_id, score').eq('school_id', schoolId).eq('student_id', studentId)
    .in('assessment_id', assessList.map((a) => a.id))
  const scoreByAssess = new Map((gradesData ?? []).map((g: { assessment_id: string; score: number }) => [g.assessment_id, g.score]))

  const coefByCs = new Map(csList.map((c) => [c.id, c.coefficient]))
  const byCs = new Map<string, { ws: number; tw: number }>()
  for (const a of assessList) {
    const score = scoreByAssess.get(a.id)
    if (score === undefined) continue
    const cur = byCs.get(a.class_subject_id) ?? { ws: 0, tw: 0 }
    cur.ws += (score / a.max_score) * 20 * a.coefficient
    cur.tw += a.coefficient
    byCs.set(a.class_subject_id, cur)
  }

  let weightedSum = 0, totalWeight = 0
  byCs.forEach((v, csId) => {
    if (v.tw > 0) { const subjAvg = v.ws / v.tw; const coeff = coefByCs.get(csId) ?? 1; weightedSum += subjAvg * coeff; totalWeight += coeff }
  })
  return totalWeight > 0 ? round2(weightedSum / totalWeight) : null
}

// Attendance tally for the student over the period's date window.
export async function loadAttendance(
  supabase: SchoolClient,
  schoolId: string,
  studentId: string,
  classId: string,
  startsOn: string | null,
  endsOn: string | null,
): Promise<{ rate: number | null; absences: number; lates: number }> {
  if (!startsOn || !endsOn) return { rate: null, absences: 0, lates: 0 }

  const { data: sessions } = await supabase
    .from('attendance_sessions').select('id')
    .eq('school_id', schoolId).eq('class_id', classId).gte('session_date', startsOn).lte('session_date', endsOn)
  const ids = ((sessions ?? []) as { id: string }[]).map((s) => s.id)
  if (ids.length === 0) return { rate: null, absences: 0, lates: 0 }

  const { data: recs } = await supabase
    .from('attendance_records').select('status').eq('school_id', schoolId).eq('student_id', studentId).in('session_id', ids)
  const list = (recs ?? []) as { status: string }[]
  if (list.length === 0) return { rate: null, absences: 0, lates: 0 }

  let present = 0, absent = 0, late = 0, excused = 0
  for (const r of list) {
    if (r.status === 'present') present++
    else if (r.status === 'absent') absent++
    else if (r.status === 'late') late++
    else if (r.status === 'excused') excused++
  }
  return { rate: Math.round(((present + late + excused) / list.length) * 100), absences: absent, lates: late }
}
