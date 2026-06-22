import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildReferenceCode, generateApplicationToken } from '@/lib/admissions'

const empty = (v: unknown) => (v === '' || v == null ? undefined : v)

const StartSchema = z.object({
  slug:                  z.string().min(1).max(60),
  hp:                    z.preprocess(empty, z.string().optional()), // honeypot — must stay empty
  first_name:            z.string().trim().min(1).max(100),
  last_name:             z.string().trim().min(1).max(100),
  gender:                z.preprocess(empty, z.enum(['male', 'female', 'other']).optional()),
  date_of_birth:         z.preprocess(empty, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  desired_class_id:      z.preprocess(empty, z.string().uuid().optional()),
  desired_level:         z.preprocess(empty, z.string().max(100).optional()),
  previous_school:       z.preprocess(empty, z.string().max(200).optional()),
  guardian_name:         z.preprocess(empty, z.string().max(200).optional()),
  guardian_phone:        z.preprocess(empty, z.string().max(50).optional()),
  guardian_email:        z.preprocess(empty, z.string().email().max(200).optional()),
  guardian_relationship: z.preprocess(empty, z.enum(['father', 'mother', 'guardian', 'other']).optional()),
  guardian_address:      z.preprocess(empty, z.string().max(300).optional()),
})

export async function POST(req: Request) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 }) }
  const parsed = StartSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Veuillez vérifier les champs obligatoires.' }, { status: 400 })
  const d = parsed.data

  // Honeypot: a bot filled the hidden field → pretend success, create nothing.
  if (d.hp) return NextResponse.json({ ok: true, applicationId: null, referenceCode: null })

  const admin = createAdminClient()

  const { data: school } = await admin
    .from('schools').select('id, admissions_enabled, subscription_status').eq('admissions_slug', d.slug).maybeSingle()
  const sc = school as { id: string; admissions_enabled: boolean; subscription_status: string | null } | null
  if (!sc || !sc.admissions_enabled || sc.subscription_status === 'suspended' || sc.subscription_status === 'archived') {
    return NextResponse.json({ error: 'Les candidatures en ligne ne sont pas ouvertes pour cette école.' }, { status: 404 })
  }
  const schoolId = sc.id

  let academicYearId: string | null = null
  if (d.desired_class_id) {
    const { data: cls } = await admin.from('classes').select('id, academic_year_id').eq('id', d.desired_class_id).eq('school_id', schoolId).maybeSingle()
    if (!cls) return NextResponse.json({ error: 'Classe invalide.' }, { status: 400 })
    academicYearId = (cls as { academic_year_id: string }).academic_year_id
  }

  const token = generateApplicationToken()
  const year = new Date().getFullYear()
  const { count } = await admin.from('admission_applications').select('id', { count: 'exact', head: true }).eq('school_id', schoolId)

  let appId: string | null = null
  let refCode: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = buildReferenceCode(year, (count ?? 0) + 1 + attempt)
    const { data, error } = await admin.from('admission_applications').insert({
      school_id: schoolId, academic_year_id: academicYearId, source: 'public', status: 'draft', public_token: token, reference_code: candidate,
      first_name: d.first_name, last_name: d.last_name, gender: d.gender ?? null, date_of_birth: d.date_of_birth ?? null,
      desired_class_id: d.desired_class_id ?? null, desired_level: d.desired_level ?? null, previous_school: d.previous_school ?? null,
      guardian_name: d.guardian_name ?? null, guardian_phone: d.guardian_phone ?? null, guardian_email: d.guardian_email ?? null,
      guardian_relationship: d.guardian_relationship ?? null, guardian_address: d.guardian_address ?? null,
    }).select('id').single()
    if (!error && data) { appId = (data as { id: string }).id; refCode = candidate; break }
    if (error?.code !== '23505') break
  }
  if (!appId) return NextResponse.json({ error: 'Erreur lors de la création de la candidature.' }, { status: 500 })

  cookies().set('admission', `${appId}.${token}`, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 6 })
  return NextResponse.json({ ok: true, applicationId: appId, referenceCode: refCode })
}
