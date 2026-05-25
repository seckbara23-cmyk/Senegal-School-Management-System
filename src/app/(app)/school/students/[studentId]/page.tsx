import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'

type StudentRow = {
  id: string
  admission_number: string
  first_name: string
  last_name: string
  gender: string | null
  date_of_birth: string | null
  status: string
  created_at: string
  updated_at: string
}

const STATUS_LABEL: Record<string, string> = {
  active:    'Actif',
  inactive:  'Inactif',
  graduated: 'Diplômé',
}

const STATUS_CLASS: Record<string, string> = {
  active:    'bg-primary-50 text-primary-700',
  inactive:  'bg-stone-100 text-stone-500',
  graduated: 'bg-sky-50 text-sky-700',
}

const GENDER_LABEL: Record<string, string> = {
  male:   'Masculin',
  female: 'Féminin',
  other:  'Autre',
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  const hasValue = value !== null && value !== undefined && value !== ''
  return (
    <div className="px-5 py-3.5 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className={`mt-1 sm:col-span-2 sm:mt-0 text-sm ${mono ? 'font-mono tracking-wide' : ''} ${hasValue ? 'text-gray-900' : 'italic text-gray-400'}`}>
        {hasValue ? value : 'Non renseigné'}
      </dd>
    </div>
  )
}

type Props = { params: { studentId: string } }

export default async function StudentDetailPage({ params }: Props) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('school_id, schools(id, name)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) redirect('/dashboard')

  const school = memberships[0].schools as unknown as { id: string; name: string }

  // Double-guard: filter by BOTH id and school_id to prevent cross-school access.
  const { data: student } = await supabase
    .from('students')
    .select(
      'id, admission_number, first_name, last_name, gender, date_of_birth, status, created_at, updated_at'
    )
    .eq('id', params.studentId)
    .eq('school_id', school.id)
    .maybeSingle()

  if (!student) notFound()

  const s = student as StudentRow
  const fullName = `${s.last_name} ${s.first_name}`

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-y-1 text-sm text-gray-500" aria-label="Fil d'Ariane">
        <a href="/school" className="hover:text-primary-600 hover:underline">Administration</a>
        <span className="mx-2 select-none" aria-hidden="true">/</span>
        <a href="/school/students" className="hover:text-primary-600 hover:underline">Élèves</a>
        <span className="mx-2 select-none" aria-hidden="true">/</span>
        <span className="truncate max-w-[16rem] font-medium text-gray-900">{fullName}</span>
      </nav>

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{school.name}</p>
        </div>
        <span className={`mt-1 shrink-0 inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${STATUS_CLASS[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABEL[s.status] ?? s.status}
        </span>
      </div>

      {/* Detail cards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Identity */}
        <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Identité
            </h2>
          </div>
          <dl className="divide-y divide-sand-100">
            <DetailRow label="Prénom"            value={s.first_name} />
            <DetailRow label="Nom"               value={s.last_name} />
            <DetailRow label="Sexe"              value={s.gender ? (GENDER_LABEL[s.gender] ?? s.gender) : null} />
            <DetailRow label="Date de naissance" value={formatDate(s.date_of_birth)} />
          </dl>
        </div>

        {/* Enrollment */}
        <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Scolarité
            </h2>
          </div>
          <dl className="divide-y divide-sand-100">
            <DetailRow label="N° d'admission"       value={s.admission_number} mono />
            <DetailRow label="Statut"               value={STATUS_LABEL[s.status] ?? s.status} />
            <DetailRow label="Date d'inscription"   value={formatDate(s.created_at)} />
            <DetailRow label="Dernière mise à jour" value={formatDate(s.updated_at)} />
          </dl>
        </div>
      </div>

      {/* Back link */}
      <a
        href="/school/students"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Retour à la liste des élèves
      </a>
    </div>
  )
}
