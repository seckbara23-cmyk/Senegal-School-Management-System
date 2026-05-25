// Opt out of static pre-rendering so Vercel always serves fresh HTML
// instead of a cached pre-rendered file from a previous build.
export const dynamic = 'force-dynamic'

// ─── Icon helper ──────────────────────────────────────────────────────────────

function Icon({ path, className = 'h-5 w-5' }: { path: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  )
}

// ─── Feature card ─────────────────────────────────────────────────────────────

type FeatureCardProps = { iconPath: string; title: string; description: string }

function FeatureCard({ iconPath, title, description }: FeatureCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-sand-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
        <Icon path={iconPath} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="text-sm leading-relaxed text-gray-500">{description}</p>
    </div>
  )
}

// ─── Features data ────────────────────────────────────────────────────────────

const FEATURES: FeatureCardProps[] = [
  {
    iconPath:
      'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
    title: 'Gestion des élèves',
    description:
      "Dossiers complets avec numéro d'admission, date de naissance et statut. Retrouvez la fiche d'un élève en quelques secondes.",
  },
  {
    iconPath: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
    title: 'Présences',
    description:
      'Registre numérique quotidien par classe. Identifiez les absences, notifiez les familles et éditez les rapports de présence.',
  },
  {
    iconPath:
      'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
    title: 'Paiements scolaires',
    description:
      'Suivi des frais de scolarité, enregistrement des versements et émission de reçus numériques pour les familles.',
  },
  {
    iconPath:
      'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 3.75 3.75 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
    title: 'Notes & bulletins',
    description:
      'Saisie des notes par matière, calcul automatique des moyennes et édition des bulletins de fin de trimestre.',
  },
  {
    iconPath:
      'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z',
    title: 'Communication',
    description:
      "Alertes et messages pour tenir les familles informées des absences, résultats et événements de l'établissement.",
  },
  {
    iconPath:
      'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
    title: 'Administration centrale',
    description:
      "Tableau de bord en temps réel avec vue d'ensemble sur les inscriptions, les présences et les paiements.",
  },
]

// ─── Dashboard mockup ─────────────────────────────────────────────────────────

const BUILDING_ICON =
  'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21'

const STUDENTS_ICON =
  'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z'

function DashboardMockup() {
  return (
    <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-sand-300 shadow-2xl">
      {/* Browser chrome */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-100 px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <div className="h-3 w-3 rounded-full bg-yellow-400" />
          <div className="h-3 w-3 rounded-full bg-green-400" />
        </div>
        <div className="flex h-6 w-48 items-center rounded-md border border-gray-200 bg-white px-2 sm:w-64">
          <span className="truncate text-xs text-gray-400">app.edus.sn/school</span>
        </div>
      </div>

      {/* App shell */}
      <div className="flex h-[400px] sm:h-[460px]">
        {/* Sidebar — visible sm+ */}
        <aside className="hidden w-44 shrink-0 flex-col bg-primary-700 sm:flex">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-xs font-bold text-white">
              EP
            </div>
            <span className="truncate text-sm font-semibold text-white">École de la Paix</span>
          </div>
          <nav className="flex-1 space-y-0.5 p-3">
            <div className="rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold text-primary-700">
              Tableau de bord
            </div>
            <div className="rounded-lg px-3 py-2 text-xs text-white/70">Élèves</div>
            <div className="rounded-lg px-3 py-2 text-xs text-white/40">Enseignants</div>
            <div className="rounded-lg px-3 py-2 text-xs text-white/40">Présences</div>
            <div className="rounded-lg px-3 py-2 text-xs text-white/40">Paiements</div>
          </nav>
          <div className="border-t border-white/10 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
                A
              </div>
              <span className="truncate text-xs text-white/60">admin@ecole.sn</span>
            </div>
          </div>
        </aside>

        {/* Content area */}
        <div className="flex-1 overflow-hidden bg-sand-100 p-4 sm:p-5">
          {/* Page header */}
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="text-sm font-bold text-gray-900 sm:text-base">École de la Paix</p>
              <p className="text-xs text-gray-500">lundi 12 janvier 2026</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white">
              <Icon path={BUILDING_ICON} />
            </div>
          </div>

          {/* Stats row */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-primary-100 bg-white p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Élèves</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">248</p>
              <p className="text-xs text-primary-600">Voir la liste →</p>
            </div>
            {(['Enseignants', 'Classes', 'Présences'] as const).map((label) => (
              <div key={label} className="rounded-xl border border-sand-200 bg-white/70 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-300">—</p>
                <p className="text-xs text-gray-400">Bientôt</p>
              </div>
            ))}
          </div>

          {/* Feature card */}
          <div className="rounded-xl border border-sand-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Fonctionnalités disponibles
            </p>
            <div className="flex items-center gap-3 rounded-xl border border-primary-100 bg-white p-3 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <Icon path={STUDENTS_ICON} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Élèves</p>
                <p className="text-xs text-gray-500">248 élèves inscrits</p>
              </div>
              <Icon path="M9 5l7 7-7 7" className="ml-auto h-4 w-4 text-gray-300" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Benefits ─────────────────────────────────────────────────────────────────

const BENEFITS = [
  {
    iconPath:
      'M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 3h3m-3 3h3',
    title: 'Accessible depuis mobile',
    body: 'Consultez les dossiers, validez les présences et suivez les paiements depuis votre téléphone — depuis la cour ou le bureau.',
  },
  {
    iconPath:
      'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
    title: 'Données sécurisées',
    body: "Isolation stricte des données entre établissements, authentification robuste et journalisation de chaque accès à l'information.",
  },
  {
    iconPath:
      'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
    title: 'Contexte sénégalais',
    body: "Interface en français, bulletins trimestriels, numéros d'admission — une plateforme pensée pour la réalité des écoles au Sénégal.",
  },
]

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-sand-50">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-sand-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
              <Icon path={BUILDING_ICON} className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold tracking-tight text-gray-900">EduSen</span>
          </div>
          <a
            href="/login"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2"
          >
            Se connecter
          </a>
        </div>
      </header>

      <main>
        {/* ── Hero ────────────────────────────────────────────────────────────── */}
        <section className="bg-sand-50 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            {/* Context badge */}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">
              <Icon
                path="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                className="h-3.5 w-3.5"
              />
              {`Conçu pour les écoles du Sénégal`}
            </span>

            {/* Headline */}
            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              La gestion scolaire moderne pour les{' '}
              <span className="text-primary-600">établissements sénégalais</span>
            </h1>

            {/* Sub-headline */}
            <p className="mt-6 text-lg leading-relaxed text-gray-600 sm:text-xl">
              {`Simplifiez l'administration de votre école avec une plateforme tout-en-un : élèves, présences, paiements, notes et communication avec les familles.`}
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <a
                href="/login"
                className="rounded-lg bg-primary-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2"
              >
                Commencer gratuitement
              </a>
              <a
                href="#fonctionnalites"
                className="rounded-lg border border-sand-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 transition-colors hover:border-primary-200 hover:text-primary-700"
              >
                Voir les fonctionnalités
              </a>
            </div>

            {/* Trust line */}
            <p className="mt-8 text-sm text-gray-400">
              Données sécurisées &middot; Accès mobile &middot; Interface en français
            </p>
          </div>
        </section>

        {/* ── Features ────────────────────────────────────────────────────────── */}
        <section id="fonctionnalites" className="bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                Tout ce dont votre école a besoin
              </h2>
              <p className="mt-4 text-lg text-gray-500">
                {`Six modules intégrés pour couvrir l'ensemble des besoins administratifs de votre établissement.`}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <FeatureCard key={f.title} {...f} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Dashboard preview ────────────────────────────────────────────────── */}
        <section className="bg-sand-100 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                {`Un tableau de bord pensé pour l'Afrique`}
              </h2>
              <p className="mt-4 text-lg text-gray-500">
                Interface épurée, données en temps réel, accessible depuis{' '}
                n&apos;importe quel appareil.
              </p>
            </div>
            {/* Allow horizontal scroll on very small screens so the mockup stays legible */}
            <div className="overflow-x-auto pb-2">
              <DashboardMockup />
            </div>
          </div>
        </section>

        {/* ── Benefits ────────────────────────────────────────────────────────── */}
        <section className="bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
              {BENEFITS.map(({ iconPath, title, body }) => (
                <div key={title} className="flex flex-col items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <Icon path={iconPath} className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
                  <p className="text-base leading-relaxed text-gray-500">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA banner ──────────────────────────────────────────────────────── */}
        <section className="bg-primary-700 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              {`Prêt à moderniser votre école ?`}
            </h2>
            <p className="mt-4 text-lg text-primary-100">
              {`Rejoignez les premiers établissements sénégalais à adopter la gestion scolaire numérique.`}
            </p>
            <a
              href="/login"
              className="mt-8 inline-block rounded-lg bg-white px-8 py-3 text-base font-semibold text-primary-700 shadow-sm transition-colors hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary-700"
            >
              Commencer maintenant
            </a>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="bg-primary-800 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            {/* Brand */}
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600 text-white">
                <Icon path={BUILDING_ICON} className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold text-white">EduSen</span>
            </div>

            {/* Nav */}
            <nav aria-label="Liens du pied de page">
              <a
                href="/login"
                className="text-sm text-primary-200 transition-colors hover:text-white"
              >
                Connexion
              </a>
            </nav>

            {/* Legal */}
            <p className="text-xs text-primary-300">
              {`© ${new Date().getFullYear()} EduSen — Conçu pour les écoles du Sénégal`}
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
