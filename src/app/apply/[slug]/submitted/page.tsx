import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export default function SubmittedPage() {
  const raw = cookies().get('admission_done')?.value
  let reference: string | null = null
  let token: string | null = null
  if (raw) { const i = raw.indexOf('.'); if (i > 0) { reference = raw.slice(0, i); token = raw.slice(i + 1) } }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-2xl text-white">✓</div>
        <h1 className="text-xl font-bold text-gray-900">Candidature envoyée !</h1>
        <p className="mt-1 text-sm text-gray-600">L’école a bien reçu votre demande et vous recontactera.</p>
      </div>

      {reference && token ? (
        <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">Conservez vos identifiants de suivi</p>
          <p className="mt-1 text-xs text-gray-500">Ils vous permettent de suivre l’état de votre candidature. Notez-les ou faites une capture d’écran — ils ne seront plus affichés.</p>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Référence</dt>
              <dd className="mt-0.5 select-all font-mono text-sm font-bold text-gray-900">{reference}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Code de suivi</dt>
              <dd className="mt-0.5 select-all break-all font-mono text-sm text-gray-900">{token}</dd>
            </div>
          </dl>
          <a href="/apply/track" className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">Suivre ma candidature →</a>
        </div>
      ) : (
        <div className="rounded-xl border border-sand-200 bg-white p-5 text-center shadow-sm">
          <p className="text-sm text-gray-500">Vous pouvez fermer cette page.</p>
          <a href="/apply/track" className="mt-3 inline-block text-sm text-primary-600 hover:underline">Suivre une candidature</a>
        </div>
      )}
    </div>
  )
}
