import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ImportParentsClient } from './_client'

export default async function ImportParentsPage() {
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

  const [parentsRes, studentsRes] = await Promise.all([
    supabase.from('parents').select('email, phone').eq('school_id', schoolId),
    supabase.from('students').select('admission_number').eq('school_id', schoolId),
  ])

  const prows = (parentsRes.data ?? []) as { email: string | null; phone: string | null }[]
  const existingEmails = prows.filter((p) => p.email).map((p) => p.email!.trim().toLowerCase())
  const existingPhones = prows.filter((p) => p.phone).map((p) => p.phone!.trim().toLowerCase())
  const studentAdmissions = ((studentsRes.data ?? []) as { admission_number: string }[]).map((s) => s.admission_number.trim().toLowerCase())

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/parents" className="text-primary-300 hover:text-white text-sm">← Parents</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Importer des parents</h1>
        <p className="text-primary-300 text-sm mt-0.5">Importez une liste de parents depuis un fichier CSV ou Excel (.xlsx)</p>
      </div>

      <ImportParentsClient existingEmails={existingEmails} existingPhones={existingPhones} studentAdmissions={studentAdmissions} />
    </div>
  )
}
