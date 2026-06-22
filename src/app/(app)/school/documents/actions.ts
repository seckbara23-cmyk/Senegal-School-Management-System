'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable } from '@/lib/tenant'
import {
  DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES, DOCUMENT_TYPES,
  isAllowedMime, safeFilename, type OwnerType,
} from '@/lib/documents'

// owner_type → the table whose row must belong to the school.
const OWNER_TABLE: Record<OwnerType, string> = {
  student:   'students',
  teacher:   'teachers',
  admission: 'admission_applications',
}

const DOC_TYPE_VALUES = DOCUMENT_TYPES.map((t) => t.value)

async function resolveSchoolAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/school')

  return { supabase, schoolId: (membership as { school_id: string }).school_id, actor: user }
}

// Only allow redirecting back to an internal /school/... page.
function safeRedirect(value: FormDataEntryValue | null): string {
  const v = typeof value === 'string' ? value : ''
  if (/^\/school\/[^?#]*(\?[^#]*)?$/.test(v) && !v.includes('//')) return v
  return '/school/students'
}

function withParam(path: string, key: string, val: string): string {
  return path + (path.includes('?') ? '&' : '?') + `${key}=${val}`
}

// ─── Upload ─────────────────────────────────────────────────────────────────

export async function uploadDocument(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const redirectTo = safeRedirect(formData.get('redirect_to'))

  const ownerType = z.enum(['student', 'teacher', 'admission']).safeParse(formData.get('owner_type'))
  const ownerId   = z.string().uuid().safeParse(formData.get('owner_id'))
  const docType   = z.string().safeParse(formData.get('document_type'))
  if (!ownerType.success || !ownerId.success) redirect('/school/students')
  if (!docType.success || !DOC_TYPE_VALUES.includes(docType.data)) {
    redirect(withParam(redirectTo, 'doc_error', 'type'))
  }

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(withParam(redirectTo, 'doc_error', 'readonly'))
  }

  // Owner must belong to this school.
  const { data: owner } = await supabase
    .from(OWNER_TABLE[ownerType.data])
    .select('id')
    .eq('id', ownerId.data)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!owner) redirect(withParam(redirectTo, 'doc_error', 'owner'))

  // Validate the file.
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    redirect(withParam(redirectTo, 'doc_error', 'nofile'))
  }
  const f = file as File
  if (f.size > MAX_DOCUMENT_BYTES) redirect(withParam(redirectTo, 'doc_error', 'toobig'))
  if (!isAllowedMime(f.type))      redirect(withParam(redirectTo, 'doc_error', 'mime'))

  // Upload bytes via the service-role client (the bucket is private).
  const admin = createAdminClient()
  const path = `${schoolId}/${ownerType.data}/${ownerId.data}/${crypto.randomUUID()}-${safeFilename(f.name)}`
  const bytes = new Uint8Array(await f.arrayBuffer())

  const { error: uploadError } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, bytes, { contentType: f.type, upsert: false })

  if (uploadError) {
    logSupabaseError(uploadError, { action: 'uploadDocument:storage', schoolId, userId: actor.id, entityIds: { ownerType: ownerType.data, ownerId: ownerId.data } })
    redirect(withParam(redirectTo, 'doc_error', 'upload'))
  }

  // Insert metadata via the user client (RLS + active-school gate apply).
  const { data: row, error: metaError } = await supabase
    .from('school_documents')
    .insert({
      school_id:     schoolId,
      owner_type:    ownerType.data,
      owner_id:      ownerId.data,
      document_type: docType.data,
      filename:      f.name.slice(0, 255),
      storage_path:  path,
      mime_type:     f.type,
      size_bytes:    f.size,
      uploaded_by:   actor.id,
    })
    .select('id')
    .single()

  if (metaError || !row) {
    // Roll back the uploaded object so we never leave an orphaned file.
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path])
    logSupabaseError(metaError, { action: 'uploadDocument:meta', schoolId, userId: actor.id, entityIds: { path } })
    redirect(withParam(redirectTo, 'doc_error', 'save'))
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'document_uploaded', resourceType: 'document', resourceId: (row as { id: string }).id,
    metadata: { owner_type: ownerType.data, owner_id: ownerId.data, document_type: docType.data, filename: f.name.slice(0, 255), size_bytes: f.size, mime_type: f.type },
  })

  redirect(withParam(redirectTo, 'doc_ok', 'up'))
}

// ─── Delete ─────────────────────────────────────────────────────────────────

export async function deleteDocument(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const redirectTo = safeRedirect(formData.get('redirect_to'))
  const docId = z.string().uuid().safeParse(formData.get('document_id'))
  if (!docId.success) redirect(redirectTo)

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(withParam(redirectTo, 'doc_error', 'readonly'))
  }

  // Read the metadata row (RLS ensures it belongs to this admin's school).
  const { data: docRaw } = await supabase
    .from('school_documents')
    .select('id, storage_path')
    .eq('id', docId.data)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!docRaw) redirect(redirectTo)
  const doc = docRaw as { id: string; storage_path: string }

  // Remove the file (service role) then the metadata row.
  const admin = createAdminClient()
  await admin.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path])

  const { error } = await supabase
    .from('school_documents')
    .delete()
    .eq('id', doc.id)
    .eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'deleteDocument', schoolId, userId: actor.id, entityIds: { docId: doc.id } })
    redirect(withParam(redirectTo, 'doc_error', 'delete'))
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'document_deleted', resourceType: 'document', resourceId: doc.id,
    metadata: { storage_path: doc.storage_path },
  })

  redirect(withParam(redirectTo, 'doc_ok', 'del'))
}
