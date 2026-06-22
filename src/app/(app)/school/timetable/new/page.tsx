import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TimetableSlotForm } from '../_form'
import { loadTimetableFormOptions } from '../_data'
import { createTimetableSlot } from '../actions'

export default async function NewTimetableSlotPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { academicYears, classes, classSubjects, teachers } = await loadTimetableFormOptions(supabase, schoolId)

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/timetable" className="text-primary-300 hover:text-white text-sm">← Emploi du temps</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Nouveau créneau</h1>
        <p className="text-primary-300 text-sm mt-0.5">Programmer un cours pour une classe</p>
      </div>

      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        {classes.length === 0 ? (
          <p className="text-sm text-gray-500">
            Créez d&apos;abord une classe et affectez-lui des matières avant de programmer l&apos;emploi du temps.
          </p>
        ) : (
          <TimetableSlotForm
            action={createTimetableSlot}
            academicYears={academicYears}
            classes={classes}
            classSubjects={classSubjects}
            teachers={teachers}
            cancelHref="/school/timetable"
          />
        )}
      </div>
    </div>
  )
}
