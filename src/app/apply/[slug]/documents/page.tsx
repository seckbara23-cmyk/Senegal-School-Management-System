import { redirect } from 'next/navigation'
import { loadActiveDraft } from '@/lib/admissions-session'
import { ADMISSION_DOC_TYPES } from '@/lib/admissions'
import { Stepper } from '../_stepper'
import { UploadPanel } from './_upload'

export const dynamic = 'force-dynamic'

const DOC_LABEL: Record<string, string> = Object.fromEntries(ADMISSION_DOC_TYPES.map((d) => [d.value, d.label]))

export default async function DocumentsPage({ params }: { params: { slug: string } }) {
  const draft = await loadActiveDraft(params.slug)
  if (!draft) redirect(`/apply/${params.slug}`)
  const { app, admin } = draft
  if (app.status !== 'draft') redirect(`/apply/${params.slug}/submitted`)

  const { data: docsRaw } = await admin
    .from('school_documents').select('id, document_type, filename, created_at')
    .eq('owner_type', 'admission').eq('owner_id', app.id).order('created_at')
  const docs = (docsRaw ?? []) as { id: string; document_type: string; filename: string }[]

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold tracking-tight text-gray-900">Pièces justificatives</h1><p className="text-sm text-gray-500">Acte de naissance, bulletin, pièce d’identité, photo… (PDF ou image, 10 Mo max)</p></div>
      <Stepper current={2} />

      <UploadPanel />

      <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
        <p className="mb-2 text-sm font-semibold text-gray-900">Documents ajoutés ({docs.length})</p>
        {docs.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun document pour le moment. Vous pouvez aussi soumettre sans pièce et les fournir plus tard.</p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm text-gray-800">{d.filename}</span>
                <span className="shrink-0 rounded-full bg-sand-100 px-2 py-0.5 text-xs text-gray-500">{DOC_LABEL[d.document_type] ?? d.document_type}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between">
        <a href={`/apply/${params.slug}`} className="text-sm text-gray-500 hover:underline">← Retour</a>
        <a href={`/apply/${params.slug}/review`} className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700">Continuer →</a>
      </div>
    </div>
  )
}
