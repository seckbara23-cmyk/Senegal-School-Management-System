'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const DOC_TYPES = [
  { value: 'birth_certificate', label: 'Acte de naissance' },
  { value: 'report_card', label: 'Bulletin précédent' },
  { value: 'id_document', label: 'Pièce d’identité' },
  { value: 'photo', label: 'Photo' },
  { value: 'other', label: 'Autre' },
]

const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'

export function UploadPanel() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState('birth_certificate')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function upload() {
    setError(null)
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Choisissez un fichier.'); return }
    setPending(true)
    const fd = new FormData()
    fd.set('file', file)
    fd.set('document_type', docType)
    try {
      const res = await fetch('/api/admissions/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Échec du téléversement.'); setPending(false); return }
      if (fileRef.current) fileRef.current.value = ''
      setPending(false)
      router.refresh()
    } catch {
      setError('Connexion impossible. Réessayez.'); setPending(false)
    }
  }

  return (
    <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
      {error && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <select value={docType} onChange={(e) => setDocType(e.target.value)} className={field}>
          {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-700" />
        <button type="button" onClick={upload} disabled={pending} className="rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 disabled:opacity-50">
          {pending ? 'Envoi…' : 'Téléverser'}
        </button>
      </div>
    </div>
  )
}
