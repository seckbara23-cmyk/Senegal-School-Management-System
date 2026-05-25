'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const YearSchema = z.object({
  year_name: z
    .string()
    .min(1, "Le nom de l'année scolaire est requis.")
    .max(50, 'Nom trop long (50 caractères max).'),
  year_starts_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (AAAA-MM-JJ).'),
  year_ends_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (AAAA-MM-JJ).'),
  year_is_active: z.preprocess((v) => v === 'on', z.boolean()),
})

const ClassFieldsSchema = z.object({
  name: z
    .string()
    .min(1, 'Le nom de la classe est requis.')
    .max(100, 'Nom trop long (100 caractères max).'),
  level: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().max(50, 'Niveau trop long (50 caractères max).').optional()
  ),
  section: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().max(50, 'Section trop longue (50 caractères max.).').optional()
  ),
})

// ─── State type ───────────────────────────────────────────────────────────────

export type CreateClassState = {
  errors?: {
    academic_year_id?: string[]
    year_name?:        string[]
    year_starts_on?:   string[]
    year_ends_on?:     string[]
    name?:             string[]
    level?:            string[]
    section?:          string[]
    _form?:            string[]
  }
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function createClass(
  _prevState: CreateClassState,
  formData: FormData
): Promise<CreateClassState> {
  const supabase = createClient()

  // ── Auth check ─────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  // ── School admin guard ─────────────────────────────────────────────────────
  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) {
    return { errors: { _form: ['Non autorisé.'] } }
  }

  const schoolId = memberships[0].school_id as string

  // ── Resolve academic year ──────────────────────────────────────────────────
  const rawYearId = (formData.get('academic_year_id') as string | null)?.trim()
  let academicYearId: string

  if (!rawYearId) {
    return { errors: { academic_year_id: ["Veuillez sélectionner une année scolaire."] } }
  }

  if (rawYearId === 'new') {
    // Validate and insert a new academic year.
    const yearParsed = YearSchema.safeParse({
      year_name:      formData.get('year_name'),
      year_starts_on: formData.get('year_starts_on'),
      year_ends_on:   formData.get('year_ends_on'),
      year_is_active: formData.get('year_is_active'),
    })

    if (!yearParsed.success) {
      return {
        errors: yearParsed.error.flatten().fieldErrors as CreateClassState['errors'],
      }
    }

    const y = yearParsed.data
    const { data: newYear, error: yearError } = await supabase
      .from('academic_years')
      .insert({
        school_id:  schoolId,
        name:       y.year_name,
        starts_on:  y.year_starts_on,
        ends_on:    y.year_ends_on,
        is_active:  y.year_is_active,
      })
      .select('id')
      .single()

    if (yearError || !newYear) {
      console.error('[createClass] academic year insert error:', yearError?.message)
      if (yearError?.code === '23505') {
        return {
          errors: {
            year_name: ['Une année scolaire avec ce nom existe déjà.'],
          },
        }
      }
      return {
        errors: { _form: ["Erreur lors de la création de l'année scolaire."] },
      }
    }

    academicYearId = newYear.id
  } else {
    // Verify the submitted year belongs to this school — never trust the client.
    const { data: year } = await supabase
      .from('academic_years')
      .select('id')
      .eq('id', rawYearId)
      .eq('school_id', schoolId)
      .maybeSingle()

    if (!year) {
      return {
        errors: { academic_year_id: ['Année scolaire introuvable.'] },
      }
    }

    academicYearId = year.id
  }

  // ── Validate class fields ──────────────────────────────────────────────────
  const classParsed = ClassFieldsSchema.safeParse({
    name:    formData.get('name'),
    level:   formData.get('level'),
    section: formData.get('section'),
  })

  if (!classParsed.success) {
    return {
      errors: classParsed.error.flatten().fieldErrors as CreateClassState['errors'],
    }
  }

  // ── Insert class ───────────────────────────────────────────────────────────
  const { data: newClass, error: classError } = await supabase
    .from('classes')
    .insert({
      school_id:        schoolId,
      academic_year_id: academicYearId,
      name:             classParsed.data.name,
      level:            classParsed.data.level    ?? null,
      section:          classParsed.data.section  ?? null,
    })
    .select('id')
    .single()

  if (classError || !newClass) {
    console.error('[createClass] class insert error:', classError?.message)
    return {
      errors: { _form: ['Erreur lors de la création de la classe. Veuillez réessayer.'] },
    }
  }

  redirect(`/school/classes/${newClass.id}`)
}
