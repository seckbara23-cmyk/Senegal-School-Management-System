import { redirect } from 'next/navigation'
import { loadActiveDraft } from '@/lib/admissions-session'
import { Stepper } from '../_stepper'
import { SubmitButton } from './_submit'

export const dynamic = 'force-dynamic'

const REL: Record<string, string> = { father: 'Père', mother: 'Mère', guardian: 'Tuteur', other: 'Autre' }
const GENDER: Record<string, string> = { male: 'Masculin', female: 'Féminin', other: 'Autre' }

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value || '—'}</span>
    </div>
  )
}

export default async function ReviewPage({ params }: { params: { slug: string } }) {
  const draft = await loadActiveDraft(params.slug)
  if (!draft) redirect(`/apply/${params.slug}`)
  const { app, admin } = draft
  if (app.status !== 'draft') redirect(`/apply/${params.slug}/submitted`)

  const { count } = await admin.from('school_documents').select('id', { count: 'exact', head: true }).eq('owner_type', 'admission').eq('owner_id', app.id)

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold tracking-tight text-gray-900">Vérification</h1><p className="text-sm text-gray-500">Relisez vos informations avant de soumettre.</p></div>
      <Stepper current={3} />

      <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
        <p className="mb-2 text-sm font-semibold text-gray-900">Élève</p>
        <div className="divide-y divide-sand-100">
          <Row label="Nom complet" value={`${app.first_name} ${app.last_name}`} />
          <Row label="Sexe" value={app.gender ? GENDER[app.gender] : '—'} />
          <Row label="Date de naissance" value={app.date_of_birth} />
          <Row label="Niveau souhaité" value={app.desired_level} />
          <Row label="École précédente" value={app.previous_school} />
        </div>
        <p className="mb-2 mt-4 text-sm font-semibold text-gray-900">Parent / tuteur</p>
        <div className="divide-y divide-sand-100">
          <Row label="Nom" value={app.guardian_name} />
          <Row label="Lien" value={app.guardian_relationship ? REL[app.guardian_relationship] : '—'} />
          <Row label="Téléphone" value={app.guardian_phone} />
          <Row label="Email" value={app.guardian_email} />
          <Row label="Adresse" value={app.guardian_address} />
        </div>
        <p className="mt-4 text-sm text-gray-500">{count ?? 0} document{(count ?? 0) !== 1 ? 's' : ''} joint{(count ?? 0) !== 1 ? 's' : ''}.</p>
      </div>

      <div className="flex items-center justify-between">
        <a href={`/apply/${params.slug}/documents`} className="text-sm text-gray-500 hover:underline">← Documents</a>
        <SubmitButton />
      </div>
    </div>
  )
}
