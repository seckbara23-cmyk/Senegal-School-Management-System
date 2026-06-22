import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type Props = { params: { announcementId: string } }

export default async function SchoolAnnouncementDetailPage({ params }: Props) {
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

  if (!membership) redirect('/dashboard')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: rawAnn } = await supabase
    .from('announcements')
    .select('id, title, body, audience_type, class_id, created_at, classes!class_id(name, section)')
    .eq('id', params.announcementId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!rawAnn) notFound()

  type Ann = {
    id: string; title: string; body: string | null; audience_type: string
    class_id: string | null; created_at: string; classes: { name: string; section: string | null } | null
  }
  const ann = rawAnn as unknown as Ann

  const audienceLabel = ann.audience_type === 'class' && ann.classes
    ? [ann.classes.name, ann.classes.section].filter(Boolean).join(' — ')
    : (AUDIENCE_LABEL[ann.audience_type] ?? ann.audience_type)
  const chipClass = AUDIENCE_CHIP[ann.audience_type] ?? AUDIENCE_CHIP.all_school

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <nav className="flex items-center text-sm text-primary-300 mb-3" aria-label="Fil d'Ariane">
          <a href="/school" className="hover:text-white transition-colors">Administration</a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <a href="/school/announcements" className="hover:text-white transition-colors">Annonces</a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <span className="text-white font-medium">Détail</span>
        </nav>
        <h1 className="text-2xl font-bold text-white tracking-tight">{ann.title}</h1>
      </div>

      <article className="rounded-xl border border-sand-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-100 pb-4">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${chipClass}`}>
            {audienceLabel}
          </span>
          <time dateTime={ann.created_at} className="text-xs text-gray-400 capitalize">
            {formatDate(ann.created_at)}
          </time>
        </div>
        {ann.body ? (
          <p className="mt-4 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{ann.body}</p>
        ) : (
          <p className="mt-4 text-sm italic text-gray-400">Aucun contenu.</p>
        )}
      </article>

      <a href="/school/announcements" className="inline-block text-sm text-gray-600 hover:text-gray-900 hover:underline">
        ← Toutes les annonces
      </a>
    </div>
  )
}
