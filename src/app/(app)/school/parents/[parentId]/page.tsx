import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { unlinkStudent } from '../actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type LinkedStudent = {
  id: string
  relationship: 'father' | 'mother' | 'guardian' | 'other'
  is_primary_contact: boolean
  students: {
    id: string
    first_name: string
    last_name: string
    admission_number: string
  }
}

type ParentDetail = {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  address: string | null
  occupation: string | null
  status: string
  parent_student_links: LinkedStudent[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RELATIONSHIP_LABEL: Record<string, string> = {
  father:   'Père',
  mother:   'Mère',
  guardian: 'Tuteur / Tutrice',
  other:    'Autre',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  params: { parentId: string }
}

export default async function ParentDetailPage({ params }: Props) {
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

  const { data: raw } = await supabase
    .from('parents')
    .select(
      'id, first_name, last_name, phone, email, address, occupation, status, ' +
      'parent_student_links!parent_id(' +
      '  id, relationship, is_primary_contact, ' +
      '  students!student_id(id, first_name, last_name, admission_number)' +
      ')'
    )
    .eq('id', params.parentId)
    .eq('school_id', school.id)
    .maybeSingle()

  if (!raw) notFound()

  const parent = raw as unknown as ParentDetail

  const links = [...parent.parent_student_links].sort((a, b) => {
    // Primary contacts first, then alphabetically
    if (a.is_primary_contact !== b.is_primary_contact) return a.is_primary_contact ? -1 : 1
    return a.students.last_name.localeCompare(b.students.last_name, 'fr')
  })

  const fullName = `${parent.last_name} ${parent.first_name}`

  return (
    <div className="space-y-5">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <nav className="flex items-center text-sm text-primary-300 mb-3" aria-label="Fil d'Ariane">
          <a href="/school" className="hover:text-white transition-colors">Administration</a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <a href="/school/parents" className="hover:text-white transition-colors">Parents &amp; Tuteurs</a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <span className="text-white font-medium">{fullName}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{fullName}</h1>
            <p className="text-primary-300 text-sm mt-0.5">{school.name}</p>
          </div>
          <a
            href={`/school/parents/${parent.id}/link`}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            Lier un élève
          </a>
        </div>

        {/* Contact chips */}
        <div className="mt-4 pt-4 border-t border-primary-700 flex flex-wrap gap-3">
          {parent.phone ? (
            <a
              href={`tel:${parent.phone}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              {parent.phone}
            </a>
          ) : (
            <span className="text-sm text-primary-400">Aucun téléphone</span>
          )}
          {parent.email && (
            <a
              href={`mailto:${parent.email}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              {parent.email}
            </a>
          )}
        </div>
      </div>

      {/* ── Contact dossier ──────────────────────────────────────────────────── */}
      {(parent.occupation || parent.address) && (
        <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          <div className="border-b border-sand-200 bg-sand-100 px-5 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
              Informations du dossier
            </p>
          </div>
          <dl className="divide-y divide-sand-100">
            {parent.occupation && (
              <div className="px-5 py-3.5 flex gap-4">
                <dt className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wider text-gray-400 pt-0.5">
                  Profession
                </dt>
                <dd className="text-sm text-gray-900">{parent.occupation}</dd>
              </div>
            )}
            {parent.address && (
              <div className="px-5 py-3.5 flex gap-4">
                <dt className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wider text-gray-400 pt-0.5">
                  Adresse
                </dt>
                <dd className="text-sm text-gray-900 whitespace-pre-wrap">{parent.address}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* ── Linked children ──────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">

        <div className="border-b border-sand-200 bg-sand-100 px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Enfants liés
          </p>
          {links.length > 0 && (
            <span className="text-xs text-gray-400">
              {links.length} élève{links.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {links.length === 0 ? (
          <div className="bg-white px-5 py-10 text-center">
            <p className="text-sm text-gray-500">
              Aucun élève lié à ce dossier.
            </p>
            <a
              href={`/school/parents/${parent.id}/link`}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
            >
              Lier un premier élève →
            </a>
          </div>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-50">
                <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Élève
                </th>
                <th scope="col" className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                  N° Adm.
                </th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Lien
                </th>
                <th scope="col" className="px-5 py-3">
                  <span className="sr-only">Retirer</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {links.map((lnk) => (
                <tr key={lnk.id} className="odd:bg-white even:bg-sand-50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/school/students/${lnk.students.id}`}
                        className="text-sm font-semibold text-gray-900 hover:text-primary-700 hover:underline"
                      >
                        {lnk.students.last_name} {lnk.students.first_name}
                      </a>
                      {lnk.is_primary_contact && (
                        <span className="inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700 ring-1 ring-inset ring-accent-300">
                          Contact principal
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="hidden px-5 py-3.5 whitespace-nowrap sm:table-cell">
                    <span className="font-mono text-sm text-gray-400">
                      {lnk.students.admission_number}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-gray-600">
                      {RELATIONSHIP_LABEL[lnk.relationship] ?? lnk.relationship}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <form action={unlinkStudent} className="inline">
                      <input type="hidden" name="link_id"   value={lnk.id} />
                      <input type="hidden" name="parent_id" value={parent.id} />
                      <button
                        type="submit"
                        className="text-sm font-medium text-red-500 hover:text-red-700 hover:underline"
                        onClick={(e) => {
                          if (!confirm(`Retirer ${lnk.students.last_name} ${lnk.students.first_name} de ce dossier ?`)) {
                            e.preventDefault()
                          }
                        }}
                      >
                        Retirer
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}
