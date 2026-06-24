const TABS: { key: string; href: string; label: string }[] = [
  { key: 'dashboard', href: '/super-admin/pilots', label: 'Tableau de bord' },
  { key: 'tracker', href: '/super-admin/pilots/tracker', label: 'Suivi' },
  { key: 'feedback', href: '/super-admin/pilots/feedback', label: 'Retours' },
  { key: 'resources', href: '/super-admin/pilots/resources', label: 'Ressources' },
  { key: 'adoption', href: '/super-admin/pilots/adoption', label: 'Adoption' },
  { key: 'readiness', href: '/super-admin/pilots/readiness', label: 'Préparation commerciale' },
]

export function PilotNav({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <a key={t.key} href={t.href} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${active === t.key ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>{t.label}</a>
      ))}
    </div>
  )
}
