import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSetupState, type SetupStep } from '@/lib/setup'

export const dynamic = 'force-dynamic'

function CheckIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

export default async function SetupPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id, schools(name)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id
  const schoolName = ((membership as unknown as { schools: { name: string } | null }).schools?.name) ?? ''

  const state = await getSetupState(supabase, schoolId)

  // The first incomplete required step (excluding the final review step) is the
  // "current" step we highlight and point the main CTA at.
  const current = state.steps.find((s) => !s.optional && s.key !== 'review' && !s.done) ?? null
  const linkFor = (s: SetupStep) => (s.key === 'review' ? '/school' : `${s.href}?setup=1`)

  return (
    <div className="space-y-6 pb-10">
      {/* Header + progress */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Configuration de l&apos;école</h1>
        <p className="text-primary-200 text-sm mt-0.5">{schoolName}</p>

        <div className="mt-4">
          <div className="flex items-center justify-between text-sm text-primary-100">
            <span>{state.requiredDone} / {state.requiredTotal} étapes requises</span>
            <span className="font-semibold text-white">{state.percent}%</span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-primary-900/60" role="progressbar" aria-valuenow={state.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-accent-300 transition-all" style={{ width: `${state.percent}%` }} />
          </div>
        </div>
      </div>

      {/* Ready banner / next-step CTA */}
      {state.ready ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-5 text-center">
          <p className="text-lg font-bold text-emerald-800">Votre école est prête 🎉</p>
          <p className="mt-1 text-sm text-emerald-700">Toutes les étapes requises sont terminées.</p>
          <a href="/school" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">
            Aller au tableau de bord
          </a>
        </div>
      ) : current && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">Étape en cours</p>
            <p className="text-sm font-bold text-gray-900">{current.number}. {current.title}</p>
          </div>
          <a href={linkFor(current)} className="shrink-0 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">
            Continuer →
          </a>
        </div>
      )}

      {/* Stepper */}
      <ol className="space-y-3">
        {state.steps.map((s) => {
          const isCurrent = current?.key === s.key
          const reviewLocked = s.key === 'review' && !state.ready

          return (
            <li
              key={s.key}
              className={`rounded-xl border bg-white p-4 shadow-sm transition-colors ${
                isCurrent ? 'border-primary-300 ring-1 ring-primary-200' : 'border-sand-200'
              } ${reviewLocked ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-4">
                {/* Number / check */}
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  s.done ? 'bg-emerald-100 text-emerald-700' : isCurrent ? 'bg-primary-600 text-white' : 'bg-sand-100 text-gray-500'
                }`}>
                  {s.done ? <CheckIcon /> : s.number}
                </div>

                {/* Title + desc */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                    {s.done ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Fait</span>
                    ) : s.optional ? (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Optionnel</span>
                    ) : isCurrent ? (
                      <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-700">En cours</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">À faire</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{s.desc}</p>
                </div>

                {/* CTA */}
                <div className="shrink-0">
                  {reviewLocked ? (
                    <span className="text-xs italic text-gray-400">Terminez les étapes requises</span>
                  ) : s.key === 'review' ? (
                    <a href="/school" className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">Lancer →</a>
                  ) : (
                    <a href={linkFor(s)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      s.done ? 'border-sand-300 text-gray-600 hover:bg-sand-50' : 'border-primary-200 text-primary-600 hover:bg-primary-50'
                    }`}>
                      {s.done ? 'Gérer →' : 'Configurer →'}
                    </a>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <p className="text-center text-xs text-gray-400">
        La progression se met à jour automatiquement à mesure que vous ajoutez des données.
      </p>
    </div>
  )
}
