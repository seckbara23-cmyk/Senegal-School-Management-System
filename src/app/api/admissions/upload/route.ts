import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { readAdmissionSession } from '@/lib/admissions-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES, isAllowedMime, safeFilename } from '@/lib/documents'

const MAX_DOCS = 12
const ALLOWED_TYPES = ['birth_certificate', 'report_card', 'id_document', 'photo', 'other']

export async function POST(req: Request) {
  const session = readAdmissionSession()
  if (!session) return NextResponse.json({ error: 'Session expirée. Recommencez la candidature.' }, { status: 401 })

  const admin = createAdminClient()
  const { data: appRaw } = await admin.from('admission_applications').select('id, school_id, status, public_token').eq('id', session.id).maybeSingle()
  const app = appRaw as { id: string; school_id: string; status: string; public_token: string } | null
  if (!app || app.public_token !== session.token) return NextResponse.json({ error: 'Candidature introuvable.' }, { status: 403 })
  if (app.status !== 'draft') return NextResponse.json({ error: 'Cette candidature est déjà soumise.' }, { status: 409 })

  const { count } = await admin.from('school_documents').select('id', { count: 'exact', head: true }).eq('owner_type', 'admission').eq('owner_id', app.id)
  if ((count ?? 0) >= MAX_DOCS) return NextResponse.json({ error: `Maximum ${MAX_DOCS} documents.` }, { status: 400 })

  const form = await req.formData()
  const file = form.get('file')
  const docType = String(form.get('document_type') ?? 'other')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Fichier manquant.' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(docType)) return NextResponse.json({ error: 'Type de document invalide.' }, { status: 400 })
  if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: 'Fichier trop volumineux (max 10 Mo).' }, { status: 400 })
  if (!isAllowedMime(file.type)) return NextResponse.json({ error: 'Format non autorisé (PDF ou image uniquement).' }, { status: 400 })

  const path = `${app.school_id}/admission/${app.id}/${randomUUID()}-${safeFilename(file.name)}`
  const { error: upErr } = await admin.storage.from(DOCUMENTS_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ error: 'Échec du téléversement. Réessayez.' }, { status: 500 })

  const { error: metaErr } = await admin.from('school_documents').insert({
    school_id: app.school_id, owner_type: 'admission', owner_id: app.id, document_type: docType,
    filename: file.name.slice(0, 255), storage_path: path, mime_type: file.type, size_bytes: file.size, uploaded_by: null,
  })
  if (metaErr) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path])
    return NextResponse.json({ error: 'Échec de l’enregistrement. Réessayez.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
