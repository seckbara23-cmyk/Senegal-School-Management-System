import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ─── Types ───────────────────────────────────────────────────────────────────

type StudentRecord = {
  id: string
  first_name: string
  last_name: string
  admission_number: string
  gender: string | null
  date_of_birth: string | null
  status: string
}

type ParentLink = {
  id: string
  relationship: string
  parents: { id: string; first_name: string; last_name: string } | null
}

// ─── Display helpers ──────────────────────────────────────────────────────────

const GENDER_LABELS: Record<string, string> = {
  male: 'Masculin',
  female: 'Féminin',
  other: 'Autre',
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-700',
  graduated: 'bg-blue-100 text-blue-800',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  inactive: 'Inactif',
  graduated: 'Diplômé',
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  father: 'Père',
  mother: 'Mère',
  guardian: 'Tuteur / Tutrice',
  other: 'Autre',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  // Use fr-SN locale — Senegal French date format
  return new Date(iso).toLocaleDateString('fr-SN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProfileCard({
  student,
  schoolName,
}: {
  student: StudentRecord
  schoolName: string
}) {
  const statusClass = STATUS_BADGE[student.status] ?? 'bg-gray-100 text-gray-700'
  const statusLabel = STATUS_LABELS[student.status] ?? student.status

  return (
    <div className="bg-white shadow rounded-xl overflow-hidden">
      {/* Indigo accent bar — matches brand colour */}
      <div className="h-1.5 bg-indigo-600" />

      <div className="p-5 sm:p-6">
        {/* Name + status badge */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 truncate">
              {student.first_name} {student.last_name}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{schoolName}</p>
          </div>
          <span
            className={`self-start shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}`}
          >
            {statusLabel}
          </span>
        </div>

        {/* Key fields — 2-up on ≥sm, stacked on mobile */}
        <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8">
          <div>
            <dt className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              N° Matricule
            </dt>
            <dd className="mt-1 text-2xl font-mono font-bold text-indigo-600 tracking-wide">
              {student.admission_number}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Genre
            </dt>
            <dd className="mt-1 text-base text-gray-900">
              {student.gender ? (GENDER_LABELS[student.gender] ?? student.gender) : '—'}
            </dd>
          </div>

          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Date de naissance
            </dt>
            <dd className="mt-1 text-base text-gray-900">{formatDate(student.date_of_birth)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

function ComingSoonCard({
  title,
  description,
  missingSchema,
}: {
  title: string
  description: string
  missingSchema: string
}) {
  return (
    <div className="bg-white shadow rounded-xl p-5 flex flex-col min-h-[9rem]">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1.5 text-sm text-gray-500 flex-1 leading-relaxed">{description}</p>
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          Prochainement
        </span>
        <span className="text-xs text-gray-400">Nécessite&nbsp;: {missingSchema}</span>
      </div>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-4">
      <p className="text-sm text-red-700">{message}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fire both independent queries in parallel to keep load time low.
  const [profileResult, membershipResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single(),
    supabase
      .from('school_memberships')
      .select('school_id, schools(id, name, slug)')
      .eq('user_id', user.id)
      .eq('role', 'student')
      .eq('status', 'active'),
  ])

  const { data: memberships } = membershipResult

  // No active student membership → not a student in any school, send home.
  if (!memberships || memberships.length === 0) {
    redirect('/dashboard')
  }

  // Take the first active school. Multi-school students can be handled in a
  // later phase via a school-switcher in the app shell.
  const school = memberships[0].schools as unknown as {
    id: string
    name: string
    slug: string
  }

  const displayName = profileResult.data?.full_name ?? user.email ?? 'Étudiant'

  // Resolve student record via profile_id.
  // DEPENDENCY: requires migration 003 (adds profile_id column to students).
  // maybeSingle(): returns { data: null, error: null } when no row found —
  // distinguishes "not yet linked" from an actual database error.
  const { data: studentRecord, error: studentDbError } = await supabase
    .from('students')
    .select('id, first_name, last_name, admission_number, gender, date_of_birth, status')
    .eq('profile_id', user.id)
    .eq('school_id', school.id)
    .maybeSingle()

  // Parent/guardian links — only fetchable once we have the student id.
  // RLS policy "Students can view their own parent links" (migration 003) must
  // be applied for this query to return rows. Without it, data will be [].
  let parentLinks: ParentLink[] | null = null
  let parentLinksDbError = false

  if (studentRecord) {
    const { data, error } = await supabase
      .from('parent_student_links')
      .select('id, relationship, parents(id, first_name, last_name)')
      .eq('student_id', studentRecord.id)
      .order('relationship')

    parentLinks = data as unknown as ParentLink[]
    parentLinksDbError = !!error
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portail Étudiant</h1>
        <p className="text-gray-500 mt-0.5 text-sm">
          {school.name} · Bienvenue, {displayName}
        </p>
      </div>

      {/* ── Database error ───────────────────────────────────────────────── */}
      {studentDbError && (
        <ErrorBanner message="Impossible de charger votre profil étudiant. Veuillez réessayer plus tard ou contacter l'administrateur." />
      )}

      {/* ── Account not yet linked to a student record ───────────────────── */}
      {!studentDbError && !studentRecord && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-6">
          <h2 className="text-base font-semibold text-amber-900">
            Profil en cours de configuration
          </h2>
          <p className="mt-2 text-sm text-amber-800 leading-relaxed">
            Votre compte n&apos;a pas encore été associé à un dossier scolaire dans{' '}
            <strong>{school.name}</strong>. Contactez l&apos;administrateur de l&apos;école pour
            finaliser la configuration.
          </p>
        </div>
      )}

      {/* ── Main content — only when student record is resolved ──────────── */}
      {studentRecord && (
        <>
          {/* Profile summary card */}
          <ProfileCard
            student={studentRecord as StudentRecord}
            schoolName={school.name}
          />

          {/* Feature module placeholders — each documents its missing schema */}
          <section aria-labelledby="modules-heading">
            <h2
              id="modules-heading"
              className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3"
            >
              Modules scolaires
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <ComingSoonCard
                title="Mes Classes"
                description="Matières, professeurs et horaires de l'année en cours."
                missingSchema="table classes"
              />
              <ComingSoonCard
                title="Notes & Bulletins"
                description="Résultats par matière, moyennes et bulletins téléchargeables."
                missingSchema="table grades"
              />
              <ComingSoonCard
                title="Présences"
                description="Historique de présence, absences justifiées et retards."
                missingSchema="table attendance"
              />
              <ComingSoonCard
                title="Emploi du temps"
                description="Planning hebdomadaire et jours fériés."
                missingSchema="table schedules"
              />
            </div>
          </section>

          {/* Parent / guardian section */}
          <section
            aria-labelledby="parents-heading"
            className="bg-white shadow rounded-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-100">
              <h2
                id="parents-heading"
                className="text-base font-semibold text-gray-900"
              >
                Parents / Tuteurs
              </h2>
            </div>

            <div className="p-5">
              {parentLinksDbError && (
                <ErrorBanner message="Impossible de charger les informations des parents." />
              )}

              {!parentLinksDbError && (!parentLinks || parentLinks.length === 0) && (
                <p className="text-sm text-gray-500">
                  Aucun parent ou tuteur n&apos;est lié à votre dossier pour le moment.
                </p>
              )}

              {!parentLinksDbError && parentLinks && parentLinks.length > 0 && (
                <ul className="divide-y divide-gray-100 -mx-5 px-5">
                  {parentLinks.map((link) => {
                    const parent = link.parents
                    const relationLabel =
                      RELATIONSHIP_LABELS[link.relationship] ?? link.relationship

                    return (
                      <li
                        key={link.id}
                        className="py-4 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {parent
                              ? `${parent.first_name} ${parent.last_name}`
                              : '—'}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{relationLabel}</p>
                        </div>
                        {/* Future: link to parent contact card */}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
