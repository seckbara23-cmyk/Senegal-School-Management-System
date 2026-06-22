'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import { z }            from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'

// Unique-constraint name → friendly field message (see migration 043).
const VEHICLE_CONSTRAINTS = {
  transport_vehicles_school_plate_unique: {
    field: 'registration_plate',
    message: 'Cette immatriculation est déjà enregistrée dans cet établissement.',
  },
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

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

// ─── Shared field preprocessors ───────────────────────────────────────────────

const optionalText = (max: number, msg = 'Texte trop long.') =>
  z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().max(max, msg).optional())

const optionalDate = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.').optional(),
)

const optionalTime = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide.').optional(),
)

const optionalUuid = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().uuid('Sélection invalide.').optional(),
)

const feeAmount = z.preprocess(
  (v) => (v === '' || v == null ? 0 : v),
  z.coerce.number()
    .int('Montant en francs entiers.').min(0, 'Le montant doit être positif.').max(100_000_000),
)

// =============================================================================
// VEHICLES
// =============================================================================

const VehicleSchema = z.object({
  name:               z.string().min(1, 'Nom requis.').max(120),
  registration_plate: z.string().min(1, 'Immatriculation requise.').max(40),
  make:               optionalText(80),
  model:              optionalText(80),
  capacity: z.preprocess(
    (v) => (v === '' || v == null ? 0 : v),
    z.coerce.number()
      .int('Nombre entier.').min(0, 'La capacité doit être positive.').max(200),
  ),
  status:                 z.enum(['active', 'maintenance', 'inactive']),
  insurance_expiry_date:  optionalDate,
  inspection_expiry_date: optionalDate,
  notes:                  optionalText(2000),
})

export type VehicleFormState = {
  errors?: {
    name?: string[]; registration_plate?: string[]; make?: string[]; model?: string[]
    capacity?: string[]; status?: string[]; insurance_expiry_date?: string[]
    inspection_expiry_date?: string[]; notes?: string[]; _form?: string[]
  }
}

function parseVehicle(formData: FormData) {
  return VehicleSchema.safeParse({
    name:                   formData.get('name'),
    registration_plate:     formData.get('registration_plate'),
    make:                   formData.get('make'),
    model:                  formData.get('model'),
    capacity:               formData.get('capacity'),
    status:                 formData.get('status'),
    insurance_expiry_date:  formData.get('insurance_expiry_date'),
    inspection_expiry_date: formData.get('inspection_expiry_date'),
    notes:                  formData.get('notes'),
  })
}

export async function createVehicle(_prev: VehicleFormState, formData: FormData): Promise<VehicleFormState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  if (!(await isSchoolWritable(supabase, schoolId))) return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }

  const parsed = parseVehicle(formData)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as VehicleFormState['errors'] }
  const d = parsed.data

  const { data: row, error } = await supabase
    .from('transport_vehicles')
    .insert({
      school_id: schoolId,
      name: d.name, registration_plate: d.registration_plate,
      make: d.make ?? null, model: d.model ?? null, capacity: d.capacity, status: d.status,
      insurance_expiry_date: d.insurance_expiry_date ?? null,
      inspection_expiry_date: d.inspection_expiry_date ?? null,
      notes: d.notes ?? null,
    })
    .select('id').single()

  if (error || !row) {
    return { errors: formatServerActionError(error, {
      action: 'createVehicle', schoolId, userId: actor.id,
      entityIds: { registration_plate: d.registration_plate }, constraints: VEHICLE_CONSTRAINTS,
      fallback: 'Erreur lors de la création. Veuillez réessayer.',
    }) as VehicleFormState['errors'] }
  }

  const id = (row as { id: string }).id
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'transport_vehicle_created', resourceType: 'transport_vehicle', resourceId: id,
    metadata: { name: d.name, registration_plate: d.registration_plate },
  })
  redirect(`/school/transport/vehicles/${id}`)
}

export async function updateVehicle(_prev: VehicleFormState, formData: FormData): Promise<VehicleFormState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  const id = z.string().uuid().safeParse(formData.get('id'))
  if (!id.success) return { errors: { _form: ['Identifiant véhicule invalide.'] } }
  if (!(await isSchoolWritable(supabase, schoolId))) return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }

  const parsed = parseVehicle(formData)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as VehicleFormState['errors'] }
  const d = parsed.data

  const { error } = await supabase
    .from('transport_vehicles')
    .update({
      name: d.name, registration_plate: d.registration_plate,
      make: d.make ?? null, model: d.model ?? null, capacity: d.capacity, status: d.status,
      insurance_expiry_date: d.insurance_expiry_date ?? null,
      inspection_expiry_date: d.inspection_expiry_date ?? null,
      notes: d.notes ?? null,
    })
    .eq('id', id.data).eq('school_id', schoolId)

  if (error) {
    return { errors: formatServerActionError(error, {
      action: 'updateVehicle', schoolId, userId: actor.id,
      entityIds: { id: id.data }, constraints: VEHICLE_CONSTRAINTS,
      fallback: 'Erreur lors de la mise à jour. Veuillez réessayer.',
    }) as VehicleFormState['errors'] }
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'transport_vehicle_updated', resourceType: 'transport_vehicle', resourceId: id.data,
    metadata: { name: d.name },
  })
  redirect(`/school/transport/vehicles/${id.data}`)
}

export async function setVehicleStatus(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  const id = z.string().uuid().safeParse(formData.get('id'))
  const newStatus = z.enum(['active', 'maintenance', 'inactive']).safeParse(formData.get('new_status'))
  if (!id.success || !newStatus.success) redirect('/school/transport/vehicles')
  if (!(await isSchoolWritable(supabase, schoolId))) redirect(`/school/transport/vehicles/${id.data}?error=readonly`)

  const { error } = await supabase
    .from('transport_vehicles').update({ status: newStatus.data })
    .eq('id', id.data).eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'setVehicleStatus', schoolId, entityIds: { id: id.data } })
    redirect(`/school/transport/vehicles/${id.data}?error=status`)
  }
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'transport_vehicle_status_changed', resourceType: 'transport_vehicle', resourceId: id.data,
    metadata: { new_status: newStatus.data },
  })
  redirect(`/school/transport/vehicles/${id.data}`)
}

// =============================================================================
// DRIVERS
// =============================================================================

const DriverSchema = z.object({
  full_name:               z.string().min(1, 'Nom complet requis.').max(120),
  phone:                   optionalText(30),
  address:                 optionalText(200),
  license_number:          optionalText(60),
  license_expiry_date:     optionalDate,
  emergency_contact_name:  optionalText(120),
  emergency_contact_phone: optionalText(30),
  status:                  z.enum(['active', 'inactive']),
  notes:                   optionalText(2000),
})

export type DriverFormState = {
  errors?: {
    full_name?: string[]; phone?: string[]; address?: string[]; license_number?: string[]
    license_expiry_date?: string[]; emergency_contact_name?: string[]; emergency_contact_phone?: string[]
    status?: string[]; notes?: string[]; _form?: string[]
  }
}

function parseDriver(formData: FormData) {
  return DriverSchema.safeParse({
    full_name:               formData.get('full_name'),
    phone:                   formData.get('phone'),
    address:                 formData.get('address'),
    license_number:          formData.get('license_number'),
    license_expiry_date:     formData.get('license_expiry_date'),
    emergency_contact_name:  formData.get('emergency_contact_name'),
    emergency_contact_phone: formData.get('emergency_contact_phone'),
    status:                  formData.get('status'),
    notes:                   formData.get('notes'),
  })
}

export async function createDriver(_prev: DriverFormState, formData: FormData): Promise<DriverFormState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  if (!(await isSchoolWritable(supabase, schoolId))) return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }

  const parsed = parseDriver(formData)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as DriverFormState['errors'] }
  const d = parsed.data

  const { data: row, error } = await supabase
    .from('transport_drivers')
    .insert({
      school_id: schoolId, full_name: d.full_name, phone: d.phone ?? null, address: d.address ?? null,
      license_number: d.license_number ?? null, license_expiry_date: d.license_expiry_date ?? null,
      emergency_contact_name: d.emergency_contact_name ?? null,
      emergency_contact_phone: d.emergency_contact_phone ?? null,
      status: d.status, notes: d.notes ?? null,
    })
    .select('id').single()

  if (error || !row) {
    return { errors: formatServerActionError(error, {
      action: 'createDriver', schoolId, userId: actor.id, entityIds: { full_name: d.full_name },
      fallback: 'Erreur lors de la création. Veuillez réessayer.',
    }) as DriverFormState['errors'] }
  }

  const id = (row as { id: string }).id
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'transport_driver_created', resourceType: 'transport_driver', resourceId: id,
    metadata: { full_name: d.full_name },
  })
  redirect(`/school/transport/drivers/${id}`)
}

export async function updateDriver(_prev: DriverFormState, formData: FormData): Promise<DriverFormState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  const id = z.string().uuid().safeParse(formData.get('id'))
  if (!id.success) return { errors: { _form: ['Identifiant chauffeur invalide.'] } }
  if (!(await isSchoolWritable(supabase, schoolId))) return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }

  const parsed = parseDriver(formData)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as DriverFormState['errors'] }
  const d = parsed.data

  const { error } = await supabase
    .from('transport_drivers')
    .update({
      full_name: d.full_name, phone: d.phone ?? null, address: d.address ?? null,
      license_number: d.license_number ?? null, license_expiry_date: d.license_expiry_date ?? null,
      emergency_contact_name: d.emergency_contact_name ?? null,
      emergency_contact_phone: d.emergency_contact_phone ?? null,
      status: d.status, notes: d.notes ?? null,
    })
    .eq('id', id.data).eq('school_id', schoolId)

  if (error) {
    return { errors: formatServerActionError(error, {
      action: 'updateDriver', schoolId, userId: actor.id, entityIds: { id: id.data },
      fallback: 'Erreur lors de la mise à jour. Veuillez réessayer.',
    }) as DriverFormState['errors'] }
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'transport_driver_updated', resourceType: 'transport_driver', resourceId: id.data,
    metadata: { full_name: d.full_name },
  })
  redirect(`/school/transport/drivers/${id.data}`)
}

export async function setDriverStatus(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  const id = z.string().uuid().safeParse(formData.get('id'))
  const newStatus = z.enum(['active', 'inactive']).safeParse(formData.get('new_status'))
  if (!id.success || !newStatus.success) redirect('/school/transport/drivers')
  if (!(await isSchoolWritable(supabase, schoolId))) redirect(`/school/transport/drivers/${id.data}?error=readonly`)

  const { error } = await supabase
    .from('transport_drivers').update({ status: newStatus.data })
    .eq('id', id.data).eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'setDriverStatus', schoolId, entityIds: { id: id.data } })
    redirect(`/school/transport/drivers/${id.data}?error=status`)
  }
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'transport_driver_status_changed', resourceType: 'transport_driver', resourceId: id.data,
    metadata: { new_status: newStatus.data },
  })
  redirect(`/school/transport/drivers/${id.data}`)
}

// =============================================================================
// ROUTES
// =============================================================================

const RouteSchema = z.object({
  name:        z.string().min(1, 'Nom requis.').max(120),
  description: optionalText(1000),
  vehicle_id:  optionalUuid,
  driver_id:   optionalUuid,
  status:      z.enum(['active', 'inactive']),
  monthly_fee: feeAmount,
})

export type RouteFormState = {
  errors?: {
    name?: string[]; description?: string[]; vehicle_id?: string[]; driver_id?: string[]
    status?: string[]; monthly_fee?: string[]; _form?: string[]
  }
}

function parseRoute(formData: FormData) {
  return RouteSchema.safeParse({
    name:        formData.get('name'),
    description: formData.get('description'),
    vehicle_id:  formData.get('vehicle_id'),
    driver_id:   formData.get('driver_id'),
    status:      formData.get('status'),
    monthly_fee: formData.get('monthly_fee'),
  })
}

// Confirm an optional vehicle/driver id belongs to this school (the DB trigger
// also guards this; we check here to return a friendly field error).
async function validateRouteRefs(
  supabase: Awaited<ReturnType<typeof resolveSchoolAdmin>>['supabase'],
  schoolId: string, vehicleId?: string, driverId?: string,
): Promise<RouteFormState['errors'] | null> {
  if (vehicleId) {
    const { data } = await supabase.from('transport_vehicles').select('id').eq('id', vehicleId).eq('school_id', schoolId).maybeSingle()
    if (!data) return { vehicle_id: ['Véhicule introuvable dans cet établissement.'] }
  }
  if (driverId) {
    const { data } = await supabase.from('transport_drivers').select('id').eq('id', driverId).eq('school_id', schoolId).maybeSingle()
    if (!data) return { driver_id: ['Chauffeur introuvable dans cet établissement.'] }
  }
  return null
}

export async function createRoute(_prev: RouteFormState, formData: FormData): Promise<RouteFormState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  if (!(await isSchoolWritable(supabase, schoolId))) return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }

  const parsed = parseRoute(formData)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as RouteFormState['errors'] }
  const d = parsed.data

  const refErr = await validateRouteRefs(supabase, schoolId, d.vehicle_id, d.driver_id)
  if (refErr) return { errors: refErr }

  const { data: row, error } = await supabase
    .from('transport_routes')
    .insert({
      school_id: schoolId, name: d.name, description: d.description ?? null,
      vehicle_id: d.vehicle_id ?? null, driver_id: d.driver_id ?? null,
      status: d.status, monthly_fee: d.monthly_fee,
    })
    .select('id').single()

  if (error || !row) {
    return { errors: formatServerActionError(error, {
      action: 'createRoute', schoolId, userId: actor.id, entityIds: { name: d.name },
      fallback: 'Erreur lors de la création. Veuillez réessayer.',
    }) as RouteFormState['errors'] }
  }

  const id = (row as { id: string }).id
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'transport_route_created', resourceType: 'transport_route', resourceId: id,
    metadata: { name: d.name, monthly_fee: d.monthly_fee },
  })
  redirect(`/school/transport/routes/${id}`)
}

export async function updateRoute(_prev: RouteFormState, formData: FormData): Promise<RouteFormState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  const id = z.string().uuid().safeParse(formData.get('id'))
  if (!id.success) return { errors: { _form: ['Identifiant itinéraire invalide.'] } }
  if (!(await isSchoolWritable(supabase, schoolId))) return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }

  const parsed = parseRoute(formData)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as RouteFormState['errors'] }
  const d = parsed.data

  const refErr = await validateRouteRefs(supabase, schoolId, d.vehicle_id, d.driver_id)
  if (refErr) return { errors: refErr }

  const { error } = await supabase
    .from('transport_routes')
    .update({
      name: d.name, description: d.description ?? null,
      vehicle_id: d.vehicle_id ?? null, driver_id: d.driver_id ?? null,
      status: d.status, monthly_fee: d.monthly_fee,
    })
    .eq('id', id.data).eq('school_id', schoolId)

  if (error) {
    return { errors: formatServerActionError(error, {
      action: 'updateRoute', schoolId, userId: actor.id, entityIds: { id: id.data },
      fallback: 'Erreur lors de la mise à jour. Veuillez réessayer.',
    }) as RouteFormState['errors'] }
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'transport_route_updated', resourceType: 'transport_route', resourceId: id.data,
    metadata: { name: d.name },
  })
  redirect(`/school/transport/routes/${id.data}`)
}

export async function setRouteStatus(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  const id = z.string().uuid().safeParse(formData.get('id'))
  const newStatus = z.enum(['active', 'inactive']).safeParse(formData.get('new_status'))
  if (!id.success || !newStatus.success) redirect('/school/transport/routes')
  if (!(await isSchoolWritable(supabase, schoolId))) redirect(`/school/transport/routes/${id.data}?error=readonly`)

  const { error } = await supabase
    .from('transport_routes').update({ status: newStatus.data })
    .eq('id', id.data).eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'setRouteStatus', schoolId, entityIds: { id: id.data } })
    redirect(`/school/transport/routes/${id.data}?error=status`)
  }
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'transport_route_status_changed', resourceType: 'transport_route', resourceId: id.data,
    metadata: { new_status: newStatus.data },
  })
  redirect(`/school/transport/routes/${id.data}`)
}

// =============================================================================
// STOPS (managed inline on the route detail page)
// =============================================================================

const StopSchema = z.object({
  route_id:     z.string().uuid(),
  name:         z.string().min(1, 'Nom requis.').max(120),
  pickup_time:  optionalTime,
  dropoff_time: optionalTime,
  stop_order: z.preprocess(
    (v) => (v === '' || v == null ? 0 : v),
    z.coerce.number().int().min(0).max(999),
  ),
  notes: optionalText(500),
})

function stopErrorRedirect(routeId: string, code: string): never {
  redirect(`/school/transport/routes/${routeId}?error=${code}`)
}

// Verify the route exists in this school. Returns the route id when valid.
async function requireRoute(
  supabase: Awaited<ReturnType<typeof resolveSchoolAdmin>>['supabase'],
  schoolId: string, routeId: string,
): Promise<boolean> {
  const { data } = await supabase.from('transport_routes').select('id').eq('id', routeId).eq('school_id', schoolId).maybeSingle()
  return !!data
}

export async function createStop(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  const parsed = StopSchema.safeParse({
    route_id: formData.get('route_id'), name: formData.get('name'),
    pickup_time: formData.get('pickup_time'), dropoff_time: formData.get('dropoff_time'),
    stop_order: formData.get('stop_order'), notes: formData.get('notes'),
  })
  if (!parsed.success) {
    const rid = z.string().uuid().safeParse(formData.get('route_id'))
    redirect(rid.success ? `/school/transport/routes/${rid.data}?error=stop_invalid` : '/school/transport/routes')
  }
  const d = parsed.data
  if (!(await isSchoolWritable(supabase, schoolId))) stopErrorRedirect(d.route_id, 'readonly')
  if (!(await requireRoute(supabase, schoolId, d.route_id))) redirect('/school/transport/routes')

  const { data: row, error } = await supabase
    .from('transport_stops')
    .insert({
      school_id: schoolId, route_id: d.route_id, name: d.name,
      pickup_time: d.pickup_time ?? null, dropoff_time: d.dropoff_time ?? null,
      stop_order: d.stop_order, notes: d.notes ?? null,
    })
    .select('id').single()

  if (error || !row) {
    logSupabaseError(error, { action: 'createStop', schoolId, entityIds: { route_id: d.route_id } })
    stopErrorRedirect(d.route_id, 'stop_server')
  }
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'transport_stop_created', resourceType: 'transport_stop', resourceId: (row as { id: string }).id,
    metadata: { route_id: d.route_id, name: d.name },
  })
  redirect(`/school/transport/routes/${d.route_id}?stop_ok=1`)
}

export async function updateStop(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  const stopId = z.string().uuid().safeParse(formData.get('stop_id'))
  const parsed = StopSchema.safeParse({
    route_id: formData.get('route_id'), name: formData.get('name'),
    pickup_time: formData.get('pickup_time'), dropoff_time: formData.get('dropoff_time'),
    stop_order: formData.get('stop_order'), notes: formData.get('notes'),
  })
  if (!stopId.success || !parsed.success) {
    const rid = z.string().uuid().safeParse(formData.get('route_id'))
    redirect(rid.success ? `/school/transport/routes/${rid.data}?error=stop_invalid` : '/school/transport/routes')
  }
  const d = parsed.data
  if (!(await isSchoolWritable(supabase, schoolId))) stopErrorRedirect(d.route_id, 'readonly')

  const { error } = await supabase
    .from('transport_stops')
    .update({
      name: d.name, pickup_time: d.pickup_time ?? null, dropoff_time: d.dropoff_time ?? null,
      stop_order: d.stop_order, notes: d.notes ?? null,
    })
    .eq('id', stopId.data).eq('school_id', schoolId).eq('route_id', d.route_id)

  if (error) {
    logSupabaseError(error, { action: 'updateStop', schoolId, entityIds: { stop_id: stopId.data } })
    stopErrorRedirect(d.route_id, 'stop_server')
  }
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'transport_stop_updated', resourceType: 'transport_stop', resourceId: stopId.data,
    metadata: { route_id: d.route_id, name: d.name },
  })
  redirect(`/school/transport/routes/${d.route_id}?stop_ok=1`)
}

export async function deleteStop(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  const stopId  = z.string().uuid().safeParse(formData.get('stop_id'))
  const routeId = z.string().uuid().safeParse(formData.get('route_id'))
  if (!stopId.success || !routeId.success) redirect('/school/transport/routes')
  if (!(await isSchoolWritable(supabase, schoolId))) stopErrorRedirect(routeId.data, 'readonly')

  const { error } = await supabase
    .from('transport_stops').delete()
    .eq('id', stopId.data).eq('school_id', schoolId).eq('route_id', routeId.data)

  if (error) {
    logSupabaseError(error, { action: 'deleteStop', schoolId, entityIds: { stop_id: stopId.data } })
    stopErrorRedirect(routeId.data, 'stop_server')
  }
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'transport_stop_deleted', resourceType: 'transport_stop', resourceId: stopId.data,
    metadata: { route_id: routeId.data },
  })
  redirect(`/school/transport/routes/${routeId.data}?stop_ok=1`)
}

// =============================================================================
// STUDENT ASSIGNMENTS
// =============================================================================

const AssignSchema = z.object({
  student_id:  z.string().uuid(),
  route_id:    z.string().uuid(),
  stop_id:     optionalUuid,
  monthly_fee: feeAmount,
  start_date:  optionalDate,
  notes:       optionalText(500),
  // Where to return after the action: the student detail page or the route page.
  redirect_to: z.enum(['student', 'route']).default('route'),
})

function assignReturnPath(target: 'student' | 'route', studentId: string, routeId: string, query: string): string {
  const base = target === 'student' ? `/school/students/${studentId}` : `/school/transport/routes/${routeId}`
  return `${base}?${query}`
}

export async function assignStudentTransport(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  const parsed = AssignSchema.safeParse({
    student_id:  formData.get('student_id'),
    route_id:    formData.get('route_id'),
    stop_id:     formData.get('stop_id'),
    monthly_fee: formData.get('monthly_fee'),
    start_date:  formData.get('start_date'),
    notes:       formData.get('notes'),
    redirect_to: formData.get('redirect_to') ?? 'route',
  })
  if (!parsed.success) redirect('/school/transport/routes')
  const d = parsed.data
  const back = (q: string) => redirect(assignReturnPath(d.redirect_to, d.student_id, d.route_id, q))

  if (!(await isSchoolWritable(supabase, schoolId))) back('transport_error=readonly')

  // Student & route must belong to this school (DB trigger also enforces).
  const [{ data: student }, { data: route }] = await Promise.all([
    supabase.from('students').select('id').eq('id', d.student_id).eq('school_id', schoolId).maybeSingle(),
    supabase.from('transport_routes').select('id').eq('id', d.route_id).eq('school_id', schoolId).maybeSingle(),
  ])
  if (!student) redirect('/school/students')
  if (!route) back('transport_error=invalid')

  // One active assignment per student (DB partial-unique index is the backstop).
  const { data: existing } = await supabase
    .from('student_transport_assignments').select('id')
    .eq('student_id', d.student_id).eq('school_id', schoolId).eq('status', 'active').maybeSingle()
  if (existing) back('transport_error=duplicate')

  const { data: row, error } = await supabase
    .from('student_transport_assignments')
    .insert({
      school_id: schoolId, student_id: d.student_id, route_id: d.route_id,
      stop_id: d.stop_id ?? null, monthly_fee: d.monthly_fee,
      start_date: d.start_date ?? null, status: 'active', notes: d.notes ?? null,
    })
    .select('id').single()

  if (error || !row) {
    if (error?.code === '23505') back('transport_error=duplicate')
    logSupabaseError(error, { action: 'assignStudentTransport', schoolId, entityIds: { student_id: d.student_id, route_id: d.route_id } })
    back('transport_error=server')
  }
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'transport_student_assigned', resourceType: 'transport_assignment', resourceId: (row as { id: string }).id,
    metadata: { student_id: d.student_id, route_id: d.route_id, monthly_fee: d.monthly_fee },
  })
  back('transport_ok=assigned')
}

export async function endStudentTransport(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  const assignmentId = z.string().uuid().safeParse(formData.get('assignment_id'))
  const studentId    = z.string().uuid().safeParse(formData.get('student_id'))
  const routeId      = z.string().uuid().safeParse(formData.get('route_id'))
  const target       = z.enum(['student', 'route']).catch('route').parse(formData.get('redirect_to'))
  if (!assignmentId.success || !studentId.success || !routeId.success) redirect('/school/transport/routes')

  const back = (q: string) => redirect(assignReturnPath(target, studentId.data, routeId.data, q))
  if (!(await isSchoolWritable(supabase, schoolId))) back('transport_error=readonly')

  // end_date is recorded as today (UTC date-only).
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('student_transport_assignments')
    .update({ status: 'inactive', end_date: today })
    .eq('id', assignmentId.data).eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'endStudentTransport', schoolId, entityIds: { assignment_id: assignmentId.data } })
    back('transport_error=server')
  }
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'transport_student_unassigned', resourceType: 'transport_assignment', resourceId: assignmentId.data,
    metadata: { student_id: studentId.data, route_id: routeId.data },
  })
  back('transport_ok=ended')
}
