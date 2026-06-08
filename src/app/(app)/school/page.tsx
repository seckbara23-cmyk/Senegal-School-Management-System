import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

// ─── Icon helper ──────────────────────────────────────────────────────────────

function Icon({ path, className = 'h-6 w-6' }: { path: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  )
}

// ─── Heroicons outline paths ───────────────────────────────────────────────────

const P = {
  building:  'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
  students:  'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  teachers:  'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
  parents:   'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  classes:   'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  clock:     'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  money:     'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  calendar:  'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 16.5v2.25',
  academic:  'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.966 8.966 0 00-6 2.292m0-14.25v14.25',
  megaphone: 'M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46',
  key:       'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z',
  document:  'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 3.75 3.75 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
  chevron:   'M9 5l7 7-7 7',
  alert:     'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  timetable: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z',
  inbox:     'M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3',
  ranking:   'M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0',
  bell:      'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0',
  help:      'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z',
}

// ─── Format helpers ─────────────────────────────────────────────────────────────

function fmtFCFA(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const AUDIENCE_LABEL: Record<string, string> = {
  all_school: "Toute l'école",
  parents:    'Parents',
  students:   'Élèves',
  staff:      'Personnel',
  class:      'Classe',
}

const ASSESS_TYPE_LABEL: Record<string, string> = {
  devoir:        'Devoir',
  composition:   'Composition',
  examen:        'Examen',
  participation: 'Participation',
  autre:         'Autre',
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Espèces', bank_transfer: 'Virement', cheque: 'Chèque',
  wave_manual: 'Wave', orange_money_manual: 'Orange Money', other: 'Autre',
}

const ATT_STATUS_LABEL: Record<string, string> = { absent: 'Absent', late: 'Retard' }

const EXAM_STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', active: 'Active', completed: 'Terminée', archived: 'Archivée',
}

// ─── KPI card ───────────────────────────────────────────────────────────────────

const TONES: Record<string, string> = {
  green:   'bg-primary-50 text-primary-700 group-hover:bg-primary-100',
  gold:    'bg-accent-50 text-accent-700 group-hover:bg-accent-100',
  emerald: 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100',
  amber:   'bg-amber-50 text-amber-700 group-hover:bg-amber-100',
  sky:     'bg-sky-50 text-sky-700 group-hover:bg-sky-100',
}

function KpiCard({
  label, value, sub, href, iconPath, tone = 'green', danger = false,
}: {
  label: string; value: string | number; sub?: string; href: string; iconPath: string; tone?: keyof typeof TONES | string; danger?: boolean
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-1 rounded-xl border border-sand-200 bg-white p-4 shadow-sm transition-all hover:border-primary-200 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${TONES[tone] ?? TONES.green}`}>
          <Icon path={iconPath} className="h-4 w-4" />
        </span>
      </div>
      <p className={`text-2xl font-bold ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </Link>
  )
}

// ─── Module groups ──────────────────────────────────────────────────────────────
// Mirrors the grouped sidebar sections so the sidebar, dashboard and the user's
// mental model stay consistent. All routes are unchanged.

type ModuleItem = { label: string; href: string; desc?: string; iconPath: string }
type ModuleGroupDef = { id: string; title: string; helper: string; iconPath: string; items: ModuleItem[] }

const MODULE_GROUPS: ModuleGroupDef[] = [
  {
    id: 'organisation',
    title: 'Organisation scolaire',
    helper: 'Structure et planning',
    iconPath: P.building,
    items: [
      { label: 'Années scolaires', href: '/school/academic-years', desc: 'Années & périodes',   iconPath: P.calendar  },
      { label: 'Classes',          href: '/school/classes',         desc: 'Classes et effectifs', iconPath: P.classes   },
      { label: 'Emploi du temps',  href: '/school/timetable',       desc: 'Horaires des classes', iconPath: P.timetable },
    ],
  },
  {
    id: 'eleves',
    title: 'Gestion des élèves',
    helper: 'Élèves et familles',
    iconPath: P.students,
    items: [
      { label: 'Élèves',     href: '/school/students',   desc: 'Dossiers et inscriptions', iconPath: P.students },
      { label: 'Admissions', href: '/school/admissions', desc: 'Candidatures',             iconPath: P.inbox    },
      { label: 'Parents',    href: '/school/parents',    desc: 'Tuteurs et contacts',      iconPath: P.parents  },
    ],
  },
  {
    id: 'personnel',
    title: 'Personnel',
    helper: 'Équipe et accès',
    iconPath: P.teachers,
    items: [
      { label: 'Enseignants',          href: '/school/teachers', desc: 'Corps enseignant',     iconPath: P.teachers },
      { label: 'Comptes utilisateurs', href: '/school/users',    desc: 'Utilisateurs et accès', iconPath: P.key      },
    ],
  },
  {
    id: 'academique',
    title: 'Suivi académique',
    helper: 'Présence et résultats',
    iconPath: P.academic,
    items: [
      { label: 'Présences',         href: '/school/attendance',          desc: 'Registre quotidien',     iconPath: P.clock    },
      { label: 'Examens',           href: '/school/exams',               desc: "Sessions d'examen",      iconPath: P.academic },
      { label: 'Notes & bulletins', href: '/school/academics/bulletins', desc: 'Notes et bulletins',     iconPath: P.document },
      { label: 'Classement',        href: '/school/academics/rankings',  desc: 'Classement des élèves',  iconPath: P.ranking  },
    ],
  },
  {
    id: 'finance',
    title: 'Finance',
    helper: 'Frais et paiements',
    iconPath: P.money,
    items: [
      { label: 'Paiements', href: '/school/finance', desc: 'Frais, factures, paiements', iconPath: P.money },
    ],
  },
  {
    id: 'communication',
    title: 'Communication',
    helper: 'Annonces et alertes',
    iconPath: P.megaphone,
    items: [
      { label: 'Annonces',      href: '/school/announcements', desc: "Communication de l'école", iconPath: P.megaphone },
      { label: 'Notifications', href: '/notifications',        desc: 'Vos alertes récentes',     iconPath: P.bell      },
    ],
  },
  {
    id: 'support',
    title: 'Support',
    helper: 'Aide et ressources',
    iconPath: P.help,
    items: [
      { label: 'Aide', href: '/school/help', desc: "Guide d'utilisation", iconPath: P.help },
    ],
  },
]

// A single clickable sub-item inside a module group card.
function ModuleRow({ item }: { item: ModuleItem }) {
  return (
    <Link
      href={item.href}
      aria-label={item.desc ? `${item.label} — ${item.desc}` : item.label}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-sand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sand-100 text-primary-700 transition-colors group-hover:bg-primary-600 group-hover:text-white">
        <Icon path={item.iconPath} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900">{item.label}</span>
        {item.desc && <span className="block truncate text-xs text-gray-400">{item.desc}</span>}
      </span>
      <Icon
        path={P.chevron}
        className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-primary-500"
      />
    </Link>
  )
}

// A grouped module card: icon badge + title + helper text, then its sub-items.
function ModuleGroupCard({ group }: { group: ModuleGroupDef }) {
  return (
    <section
      aria-label={group.title}
      className="rounded-2xl border border-sand-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <Icon path={group.iconPath} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-gray-900">{group.title}</h3>
          <p className="truncate text-xs text-gray-400">{group.helper}</p>
        </div>
      </div>
      <ul className="space-y-0.5">
        {group.items.map((item) => (
          <li key={item.href}>
            <ModuleRow item={item} />
          </li>
        ))}
      </ul>
    </section>
  )
}

// ─── Panel wrapper ──────────────────────────────────────────────────────────────

function Panel({
  title, href, linkLabel, children,
}: { title: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-sand-100 bg-sand-50 px-5 py-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-primary-700">{title}</h3>
        {href && (
          <Link href={href} className="text-xs font-medium text-primary-600 hover:text-primary-800 hover:underline">
            {linkLabel ?? 'Tout voir'} →
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-6 text-center text-sm text-gray-400">{children}</p>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SchoolAdminPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('school_id, schools(id, name, slug)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) redirect('/dashboard')

  const school = memberships[0].schools as unknown as { id: string; name: string; slug: string }
  const schoolId = school.id

  const todayISO = new Date().toISOString().split('T')[0]
  const cutoff30 = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0]

  // ── Data fetch (parallel) ──────────────────────────────────────────────────
  const [
    studentsRes, teachersRes, parentsRes, activeYearRes, classesRes,
    attendanceTodayRes, outstandingRes, announcementsRes, assessmentsRes,
    sessions30Res, paymentsRes, absencesRes, examSessionRes,
  ] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
    supabase.from('parents').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
    supabase.from('academic_years').select('id, name, starts_on, ends_on').eq('school_id', schoolId).eq('is_active', true).maybeSingle(),
    supabase.from('classes').select('id, academic_year_id').eq('school_id', schoolId),
    supabase.from('attendance_sessions').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('session_date', todayISO),
    supabase
      .from('student_invoices')
      .select('id, invoice_number, title, total_amount, amount_paid, due_date, students!student_id(first_name, last_name)')
      .eq('school_id', schoolId)
      .in('status', ['unpaid', 'partial']),
    supabase
      .from('announcements')
      .select('id, title, audience_type, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('assessments')
      .select('id, title, assessment_type, assessment_date, class_subjects!class_subject_id(classes!class_id(name), subjects!subject_id(name))')
      .eq('school_id', schoolId)
      .gte('assessment_date', todayISO)
      .order('assessment_date', { ascending: true })
      .limit(5),
    // Attendance sessions in the last 30 days — drives the attendance-rate KPI.
    supabase.from('attendance_sessions').select('id').eq('school_id', schoolId).gte('session_date', cutoff30),
    // Recent payments.
    supabase
      .from('student_payments')
      .select('id, amount, payment_method, paid_at, receipt_number, students!student_id(first_name, last_name)')
      .eq('school_id', schoolId)
      .order('paid_at', { ascending: false })
      .limit(5),
    // Recent absences / lates (ordered by record creation — a reliable top-level column).
    supabase
      .from('attendance_records')
      .select('id, status, created_at, attendance_sessions!session_id(session_date, classes!class_id(name)), students!student_id(first_name, last_name)')
      .eq('school_id', schoolId)
      .in('status', ['absent', 'late'])
      .order('created_at', { ascending: false })
      .limit(6),
    // Latest exam session (most recent by start date).
    supabase
      .from('exam_sessions')
      .select('id, name, status, starts_on, ends_on')
      .eq('school_id', schoolId)
      .order('starts_on', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const studentCount = studentsRes.count ?? 0
  const teacherCount = teachersRes.count ?? 0
  const parentCount  = parentsRes.count ?? 0

  type YearRow = { id: string; name: string; starts_on: string; ends_on: string }
  const activeYear = (activeYearRes.data as YearRow | null) ?? null

  type ClassRow = { id: string; academic_year_id: string }
  const classes = (classesRes.data ?? []) as ClassRow[]
  const activeClasses = activeYear
    ? classes.filter((c) => c.academic_year_id === activeYear.id).length
    : classes.length

  const attendanceToday = attendanceTodayRes.count ?? 0

  type InvoiceRow = {
    id: string; invoice_number: string; title: string
    total_amount: number; amount_paid: number; due_date: string | null
    students: { first_name: string; last_name: string }
  }
  const outstanding = (outstandingRes.data ?? []) as unknown as InvoiceRow[]
  const outstandingTotal = outstanding.reduce((s, i) => s + (i.total_amount - i.amount_paid), 0)
  const overdue = outstanding
    .filter((i) => i.due_date !== null && i.due_date < todayISO)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    .slice(0, 5)

  type AnnouncementRow = { id: string; title: string; audience_type: string; created_at: string }
  const announcements = (announcementsRes.data ?? []) as AnnouncementRow[]

  type AssessmentRow = {
    id: string; title: string; assessment_type: string; assessment_date: string | null
    class_subjects: { classes: { name: string } | null; subjects: { name: string } | null } | null
  }
  const assessments = (assessmentsRes.data ?? []) as unknown as AssessmentRow[]

  // Attendance rate over the last 30 days: (present + late + excused) / total.
  const sessionIds30 = ((sessions30Res.data ?? []) as { id: string }[]).map((s) => s.id)
  let attendanceRate: number | null = null
  if (sessionIds30.length > 0) {
    const [totalRes, absentRes] = await Promise.all([
      supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).in('session_id', sessionIds30),
      supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'absent').in('session_id', sessionIds30),
    ])
    const total  = totalRes.count ?? 0
    const absent = absentRes.count ?? 0
    attendanceRate = total > 0 ? Math.round(((total - absent) / total) * 100) : null
  }

  type PaymentRow = {
    id: string; amount: number; payment_method: string; paid_at: string; receipt_number: string | null
    students: { first_name: string; last_name: string } | null
  }
  const payments = (paymentsRes.data ?? []) as unknown as PaymentRow[]

  type AbsenceRow = {
    id: string; status: string; created_at: string
    attendance_sessions: { session_date: string; classes: { name: string } | null } | null
    students: { first_name: string; last_name: string } | null
  }
  const absences = (absencesRes.data ?? []) as unknown as AbsenceRow[]

  type ExamSessionRow = { id: string; name: string; status: string; starts_on: string; ends_on: string }
  const examSession = (examSessionRes.data as ExamSessionRow | null) ?? null

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="space-y-6">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white">
              <Icon path={P.building} className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">{school.name}</h1>
              <p className="mt-0.5 text-sm capitalize text-primary-300">{today}</p>
            </div>
          </div>
          <Link
            href="/school/academic-years"
            className="inline-flex items-center gap-2 rounded-lg border border-primary-600 bg-primary-700/40 px-3 py-1.5 text-sm font-medium text-primary-100 transition-colors hover:bg-primary-700"
          >
            <Icon path={P.calendar} className="h-4 w-4" />
            {activeYear ? (
              <span>Année active : <span className="font-semibold text-white">{activeYear.name}</span></span>
            ) : (
              <span className="text-accent-300">Aucune année active</span>
            )}
          </Link>
        </div>
      </div>

      {/* ── KPI grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard label="Élèves"        value={studentCount} sub="inscrits"               href="/school/students" iconPath={P.students} tone="green" />
        <KpiCard label="Enseignants"   value={teacherCount} sub="actifs"                 href="/school/teachers" iconPath={P.teachers} tone="gold" />
        <KpiCard label="Parents"       value={parentCount}  sub="actifs"                 href="/school/parents"  iconPath={P.parents}  tone="sky" />
        <KpiCard label="Classes"       value={activeClasses} sub={activeYear ? "cette année" : 'au total'} href="/school/classes" iconPath={P.classes} tone="green" />
        <KpiCard label="Présences"     value={attendanceToday} sub="séances aujourd'hui" href="/school/attendance" iconPath={P.clock} tone="emerald" />
        <KpiCard
          label="Assiduité (30j)" value={attendanceRate !== null ? `${attendanceRate}%` : '—'}
          sub="taux de présence" href="/school/attendance" iconPath={P.clock}
          tone={attendanceRate !== null && attendanceRate < 90 ? 'amber' : 'emerald'}
        />
        <KpiCard
          label="Impayés" value={outstanding.length}
          sub={outstandingTotal > 0 ? fmtFCFA(outstandingTotal) : 'à jour'}
          href="/school/finance/invoices" iconPath={P.money}
          tone={outstanding.length > 0 ? 'amber' : 'emerald'}
          danger={outstanding.length > 0}
        />
        <KpiCard
          label="En retard" value={overdue.length}
          sub={overdue.length > 0 ? 'factures échues' : 'aucune'}
          href="/school/finance/invoices" iconPath={P.alert}
          tone={overdue.length > 0 ? 'amber' : 'emerald'}
          danger={overdue.length > 0}
        />
        <KpiCard
          label="Année scolaire" value={activeYear ? activeYear.name : '—'}
          sub={activeYear ? `→ ${fmtDate(activeYear.ends_on)}` : 'à définir'}
          href="/school/academic-years" iconPath={P.calendar} tone="gold"
        />
      </div>

      {/* ── Modules de gestion (grouped, mirrors the sidebar) ───────────────── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Modules de gestion</h2>
        <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULE_GROUPS.map((group) => (
            <ModuleGroupCard key={group.id} group={group} />
          ))}
        </div>
      </div>

      {/* ── Activity panels ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* Upcoming assessments */}
        <Panel title="Évaluations à venir" href="/school/academics/assessments" linkLabel="Évaluations">
          {assessments.length === 0 ? (
            <EmptyRow>Aucune évaluation programmée.</EmptyRow>
          ) : (
            <ul className="divide-y divide-sand-100">
              {assessments.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex h-9 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                    <span className="text-sm font-bold leading-none">
                      {a.assessment_date ? new Date(a.assessment_date).getDate() : '—'}
                    </span>
                    <span className="text-[9px] uppercase">
                      {a.assessment_date ? new Date(a.assessment_date).toLocaleDateString('fr-FR', { month: 'short' }) : ''}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{a.title}</p>
                    <p className="truncate text-xs text-gray-500">
                      {a.class_subjects?.subjects?.name ?? '—'}
                      {a.class_subjects?.classes?.name ? ` · ${a.class_subjects.classes.name}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 rounded border border-sand-200 bg-sand-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                    {ASSESS_TYPE_LABEL[a.assessment_type] ?? a.assessment_type}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Overdue invoices */}
        <Panel title="Factures en retard" href="/school/finance/invoices" linkLabel="Factures">
          {overdue.length === 0 ? (
            <EmptyRow>Aucune facture en retard. 🎉</EmptyRow>
          ) : (
            <ul className="divide-y divide-sand-100">
              {overdue.map((inv) => (
                <li key={inv.id}>
                  <Link href={`/school/finance/invoices/${inv.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-accent-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {inv.students.last_name} {inv.students.first_name}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        <span className="font-mono">{inv.invoice_number}</span> · échéance {fmtDate(inv.due_date)}
                      </p>
                    </div>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold text-red-600">{fmtFCFA(inv.total_amount - inv.amount_paid)}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">En retard</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Recent announcements */}
        <Panel title="Annonces récentes" href="/school/announcements" linkLabel="Annonces">
          {announcements.length === 0 ? (
            <EmptyRow>Aucune annonce publiée.</EmptyRow>
          ) : (
            <ul className="divide-y divide-sand-100">
              {announcements.map((an) => (
                <li key={an.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
                    <Icon path={P.megaphone} className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{an.title}</p>
                    <p className="text-xs text-gray-500">
                      {AUDIENCE_LABEL[an.audience_type] ?? an.audience_type} · {fmtDate(an.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Academic year status */}
        <Panel title="Année scolaire" href="/school/academic-years" linkLabel="Gérer">
          {activeYear ? (
            <div className="px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-primary-800">{activeYear.name}</p>
                  <p className="text-xs text-gray-500">
                    {fmtDate(activeYear.starts_on)} — {fmtDate(activeYear.ends_on)}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-sand-50 px-3 py-2 text-center">
                  <p className="text-xl font-bold text-gray-900">{activeClasses}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Classes</p>
                </div>
                <div className="rounded-lg bg-sand-50 px-3 py-2 text-center">
                  <p className="text-xl font-bold text-gray-900">{studentCount}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Élèves</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-5 py-6 text-center">
              <p className="text-sm font-semibold text-gray-700">Aucune année scolaire active</p>
              <p className="mt-1 text-xs text-gray-400">Activez une année pour piloter classes, notes et bulletins.</p>
              <Link
                href="/school/academic-years/new"
                className="mt-3 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
              >
                Créer une année scolaire
              </Link>
            </div>
          )}
        </Panel>

        {/* Recent payments */}
        <Panel title="Paiements récents" href="/school/finance/payments" linkLabel="Journal">
          {payments.length === 0 ? (
            <EmptyRow>Aucun paiement enregistré.</EmptyRow>
          ) : (
            <ul className="divide-y divide-sand-100">
              {payments.map((p) => (
                <li key={p.id}>
                  <Link href={`/school/finance/payments/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-accent-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {p.students ? `${p.students.last_name} ${p.students.first_name}` : '—'}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method} · {fmtDate(p.paid_at)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-emerald-700">{fmtFCFA(p.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Recent absences */}
        <Panel title="Absences récentes" href="/school/attendance" linkLabel="Présences">
          {absences.length === 0 ? (
            <EmptyRow>Aucune absence récente.</EmptyRow>
          ) : (
            <ul className="divide-y divide-sand-100">
              {absences.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {a.students ? `${a.students.last_name} ${a.students.first_name}` : '—'}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {a.attendance_sessions?.classes?.name ?? '—'} · {fmtDate(a.attendance_sessions?.session_date ?? null)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.status === 'absent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {ATT_STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Latest exam session */}
        <Panel title="Dernière session d'examen" href="/school/exams" linkLabel="Examens">
          {!examSession ? (
            <EmptyRow>Aucune session d&apos;examen.</EmptyRow>
          ) : (
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-primary-800">{examSession.name}</p>
                  <p className="text-xs text-gray-500">{fmtDate(examSession.starts_on)} — {fmtDate(examSession.ends_on)}</p>
                </div>
                <span className="shrink-0 rounded-full border border-sand-200 bg-sand-50 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                  {EXAM_STATUS_LABEL[examSession.status] ?? examSession.status}
                </span>
              </div>
              <Link href={`/school/exams/${examSession.id}/results`} className="mt-3 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700">
                Voir les résultats →
              </Link>
            </div>
          )}
        </Panel>

      </div>
    </div>
  )
}
