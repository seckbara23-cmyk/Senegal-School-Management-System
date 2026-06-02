import { createAdminClient } from '@/lib/supabase/admin'
import { uploadDocument, deleteDocument } from '@/app/(app)/school/documents/actions'
import {
  DOCUMENTS_BUCKET, DOCUMENT_TYPES, documentTypeLabel, humanSize, type OwnerType,
} from '@/lib/documents'

export type DocumentRow = {
  id: string
  document_type: string
  filename: string
  mime_type: string | null
  size_bytes: number | null
  storage_path: string
  created_at: string
}

const ERROR_MSG: Record<string, string> = {
  type:     'Type de document invalide.',
  readonly: 'Établissement en lecture seule — modifications désactivées.',
  owner:    'Dossier introuvable.',
  nofile:   'Aucun fichier sélectionné.',
  toobig:   'Fichier trop volumineux (max 10 Mo).',
  mime:     'Format non autorisé (PDF, PNG, JPG ou WEBP uniquement).',
  upload:   'Échec du téléversement. Veuillez réessayer.',
  save:     'Échec de l’enregistrement. Veuillez réessayer.',
  delete:   'Échec de la suppression. Veuillez réessayer.',
}
const OK_MSG: Record<string, string> = { up: 'Document ajouté.', del: 'Document supprimé.' }

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-SN', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Props = {
  ownerType:  OwnerType
  ownerId:    string
  redirectTo: string
  documents:  DocumentRow[]
  okCode?:    string
  errorCode?: string
}

export async function DocumentsSection({ ownerType, ownerId, redirectTo, documents, okCode, errorCode }: Props) {
  // Short-lived signed URLs for viewing (private bucket; service-role only).
  const signed = new Map<string, string>()
  if (documents.length > 0) {
    const admin = createAdminClient()
    const { data } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrls(documents.map((d) => d.storage_path), 300)
    for (const r of data ?? []) {
      if (r.signedUrl && r.path) signed.set(r.path, r.signedUrl)
    }
  }

  const okText = okCode ? OK_MSG[okCode] : null
  const errText = errorCode ? (ERROR_MSG[errorCode] ?? 'Une erreur est survenue.') : null

  return (
    <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-sand-100 bg-sand-50 px-5 py-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Documents</h2>
        <span className="text-xs text-gray-400">{documents.length}</span>
      </div>

      <div className="px-5 py-4 space-y-4">
        {okText && (
          <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{okText}</div>
        )}
        {errText && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errText}</div>
        )}

        {/* Existing documents */}
        {documents.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun document. Ajoutez un fichier ci-dessous.</p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {documents.map((d) => {
              const url = signed.get(d.storage_path)
              return (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-[10px] font-bold uppercase text-primary-700">
                    {(d.mime_type?.includes('pdf') ? 'PDF' : 'IMG')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{d.filename}</p>
                    <p className="text-xs text-gray-400">
                      {documentTypeLabel(d.document_type)} · {humanSize(d.size_bytes)} · {fmtDate(d.created_at)}
                    </p>
                  </div>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-medium text-primary-600 hover:text-primary-800 hover:underline">
                      Ouvrir →
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-gray-300">Indisponible</span>
                  )}
                  <form action={deleteDocument} className="shrink-0">
                    <input type="hidden" name="document_id" value={d.id} />
                    <input type="hidden" name="redirect_to" value={redirectTo} />
                    <button type="submit" className="text-xs font-medium text-red-500 hover:text-red-700 hover:underline">Supprimer</button>
                  </form>
                </li>
              )
            })}
          </ul>
        )}

        {/* Upload form */}
        <form action={uploadDocument} encType="multipart/form-data" className="flex flex-wrap items-end gap-3 border-t border-sand-100 pt-4">
          <input type="hidden" name="owner_type" value={ownerType} />
          <input type="hidden" name="owner_id" value={ownerId} />
          <input type="hidden" name="redirect_to" value={redirectTo} />
          <div>
            <label htmlFor="document_type" className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select id="document_type" name="document_type" defaultValue="other" className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
              {DOCUMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="file" className="block text-xs font-medium text-gray-600 mb-1">Fichier (PDF, image · max 10 Mo)</label>
            <input
              id="file"
              name="file"
              type="file"
              required
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-primary-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-700"
            />
          </div>
          <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">
            Téléverser
          </button>
        </form>
      </div>
    </div>
  )
}
