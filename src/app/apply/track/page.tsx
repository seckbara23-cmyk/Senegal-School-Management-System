import { TrackForm } from './_track'

export const metadata = { title: 'Suivi de candidature · ScolaTech' }

export default function TrackPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Suivre ma candidature</h1>
        <p className="text-sm text-gray-500">Saisissez votre référence et votre code de suivi reçus après l’envoi.</p>
      </div>
      <TrackForm />
    </div>
  )
}
