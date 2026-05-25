import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

type Announcement = {
  id: string
  title: string
  body: string | null
  audience_type: string
  class_id: string | null
  created_at: string
  classes: { name: string; section: string | null } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

const AUDIENCE_LABEL: Record<string, string> = {
  all_school: "Tout l'établissement",
  parents:    'Parents & tuteurs',
  students:   'Élèves',
  staff:      'Personnel',
  class:      'Classe',
}

const AUDIENCE_CHIP: Record<string, string> = {
  all_school: 'bg-primary-50 text-primary-700 ring-primary-200',
  parents:    'bg-sky-50    text-sky-700    ring-sky-200',
  students:   'bg-amber-50  text-amber-700  ring-amber-200',
  staff:      'bg-sand-200  text-gray-700   ring-sand-300',
  class:      'bg-primary-50 text-primary-700 ring-primary-200',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  searchParams: { page?: string | string[] }
}

export default async function AnnouncementsPage({ searchParams }: Props) {
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

  const rawPage = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page
  const page    = Math.max(1, Number(rawPage) || 1)
  const from    = (page - 1) * PAGE_SIZE
  const to      = from + PAGE_SIZE - 1

  const { data: rawAnnouncements, count: totalCount, error } = await supabase
    .from('announcements')
    .select(
      'id, title, body, audience_type, class_id, created_at, classes!class_id(name, section)',
      { count: 'exact' }
    )
    .eq('school_id', school.id)
    .order('created_at', { ascending: false })
    .range(from, to)

  const announcements = (rawAnnouncements ?? []) as unknown as Announcement[]
  const total         = totalCount ?? 0
  const totalPages    = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-5">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <nav className="flex items-center text-sm text-primary-300 mb-3" aria-label="Fil d'Ariane">
          <a href="/school" className="hover:text-white transition-colors">Administration</a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <span className="text-white font-medium">Annonces</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Tableau d&apos;affichage
            </h1>
            <p className="text-primary-300 text-sm mt-0.5">{school.name}</p>
          </div>
          <a
            href="/school/announcements/new"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle annonce
          </a>
        </div>
        {total > 0 && (
          <div className="mt-4 pt-4 border-t border-primary-700">
            <p className="text-sm text-primary-300">
              <span className="font-semibold text-white">{total}</span>{' '}
              annonce{total !== 1 ? 's' : ''} publiée{total !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            Une erreur est survenue lors du chargement des annonces. Veuillez réessayer.
          </p>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!error && total === 0 && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sand-200">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900">Aucune annonce publiée</h3>
          <p className="mt-1 text-sm text-gray-500 max-w-xs mx-auto">
            Publiez votre première annonce pour informer parents, élèves ou le personnel.
          </p>
          <a
            href="/school/announcements/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Rédiger une annonce
          </a>
        </div>
      )}

      {/* ── Announcement list (noticeboard) ─────────────────────────────────── */}
      {!error && announcements.length > 0 && (
        <div className="space-y-3">
          {announcements.map((a) => {
            const chipClass = AUDIENCE_CHIP[a.audience_type] ?? AUDIENCE_CHIP.all_school
            const audienceLabel = a.audience_type === 'class' && a.classes
              ? [a.classes.name, a.classes.section].filter(Boolean).join(' — ')
              : (AUDIENCE_LABEL[a.audience_type] ?? a.audience_type)

            return (
              <article
                key={a.id}
                className="rounded-xl border border-sand-200 bg-sand-50 px-5 py-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${chipClass}`}
                  >
                    {audienceLabel}
                  </span>
                  <time
                    dateTime={a.created_at}
                    className="text-xs text-gray-400 capitalize"
                  >
                    {formatDate(a.created_at)}
                  </time>
                </div>

                <h2 className="text-sm font-bold text-gray-900 leading-snug">{a.title}</h2>

                {a.body && (
                  <p className="mt-1 text-sm text-gray-600 line-clamp-2 leading-relaxed">
                    {a.body}
                  </p>
                )}
              </article>
            )
          })}
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {total > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Annonces {from + 1}–{Math.min(to + 1, total)} sur {total}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <a href={`/school/announcements?page=${page - 1}`} className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors">
                ← Précédent
              </a>
            ) : (
              <span className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300 cursor-not-allowed">
                ← Précédent
              </span>
            )}
            <span className="px-2 text-sm text-gray-400">{page} / {totalPages}</span>
            {page < totalPages ? (
              <a href={`/school/announcements?page=${page + 1}`} className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors">
                Suivant →
              </a>
            ) : (
              <span className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300 cursor-not-allowed">
                Suivant →
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
