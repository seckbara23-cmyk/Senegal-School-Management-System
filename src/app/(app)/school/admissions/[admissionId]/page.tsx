import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { setAdmissionStatus } from '../actions'
import { ConvertForm, type ClassOpt } from './_convert_form'
import { DocumentsSection, type DocumentRow } from '@/components/DocumentsSection'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', submitted: 'Soumise', accepted: 'Acceptée', rejected: 'Refusée', waitlisted: "Liste d'attente",
}
const STATUS_CLASS: Record<string, string> = {
  draft:      'border-gray-200 bg-gray-100 text-gray-600',
  submitted:  'border-sky-200 bg-sky-100 text-sky-700',
  accepted:   'border-emerald-200 bg-emerald-100 text-emerald-700',
  rejected:   'border-red-200 bg-red-100 text-red-700',
  waitlisted: 'border-amber-200 bg-amber-100 text-amber-700',
}
const GENDER_LABEL: Record<string, string> = { male: 'Masculin', female: 'Féminin', other: 'Autre' }

const ERROR_MESSAGES: Record<string, string> = {
  readonly:  'Cet établissement est en lecture seule. Les modifications sont désactivées.',
  converted: 'Cette candidature est déjà convertie — son statut ne peut plus changer.',
  server:    'Une erreur est survenue. Veuillez réessayer.',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-SN', { day: 'numeric', month: 'long', year: 'numeric' })
}

type Props = { params: { admissionId: string }; searchParams: { error?: string; doc_ok?: string; doc_error?: string } }

type App = {
  id: string; first_name: string; last_name: string; gender: string | null; date_of_birth: string | null
  guardian_name: string | null; guardian_phone: string | null; guardian_email: string | null
  desired_class_id: string | null; documents: string | null; notes: string | null
  status: string; decision_reason: string | null; converted_student_id: string | null; created_at: string
  classes: { name: string; section: string | null } | null
  academic_years: { name: string } | null
}

function StatusButton({ id, status, label, tone }: { id: string; status: string; label: string; tone: string }) {
  return (
    <form action={setAdmissionStatus}>
      <input type="hidden" name="admission_id" value={id} />
      <input type="hidden" name="new_status" value={status} />
      <button type="submit" className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tone}`}>{label}</button>
    </form>
  )
}

export default async function AdmissionDetailPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: raw } = await supabase
    .from('admission_applications')
    .select('id, first_name, last_name, gender, date_of_birth, guardian_name, guardian_phone, guardian_email, desired_class_id, documents, notes, status, decision_reason, converted_student_id, created_at, classes!desired_class_id(name, section), academic_years!academic_year_id(name)')
    .eq('id', params.admissionId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!raw) notFound()
  const app = raw as unknown as App

  // Converted student (if any).
  let student: { id: string; admission_number: string } | null = null
  if (app.converted_student_id) {
    const { data: s } = await supabase
      .from('students').select('id, admission_number').eq('id', app.converted_student_id).eq('school_id', schoolId).maybeSingle()
    student = (s as { id: string; admission_number: string } | null)
  }

  // Classes for the convert form (only needed when accepted + not converted).
  let classes: ClassOpt[] = []
  if (app.status === 'accepted' && !app.converted_student_id) {
    const { data: cs } = await supabase
      .from('classes').select('id, name, section, academic_years!academic_year_id(name)').eq('school_id', schoolId).order('name')
    type CRow = { id: string; name: string; section: string | null; academic_years: { name: string } | null }
    classes = ((cs ?? []) as unknown as CRow[]).map((c) => ({
      id: c.id, label: `${[c.name, c.section].filter(Boolean).join(' ')}${c.academic_years ? ` — ${c.academic_years.name}` : ''}`,
    }))
  }

  const { data: docsData } = await supabase
    .from('school_documents')
    .select('id, document_type, filename, mime_type, size_bytes, storage_path, created_at')
    .eq('school_id', schoolId).eq('owner_type', 'admission').eq('owner_id', app.id)
    .order('created_at', { ascending: false })
  const documents = (docsData ?? []) as DocumentRow[]

  const errorMessage = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? '') : ''
  const isConverted = !!app.converted_student_id
  const displayName = `${app.last_name} ${app.first_name}`

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/admissions" className="text-primary-300 hover:text-white text-sm">← Admissions</a>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[app.status] ?? STATUS_CLASS.draft}`}>
                {STATUS_LABEL[app.status] ?? app.status}
              </span>
              {isConverted && <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Converti en élève</span>}
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{displayName}</h1>
            <p className="text-primary-300 text-sm mt-0.5">Candidature reçue le {fmtDate(app.created_at)}</p>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* ── Applicant info ──────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
        <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Informations</h2>
        </div>
        <dl className="divide-y divide-sand-100">
          <Row label="Sexe" value={app.gender ? (GENDER_LABEL[app.gender] ?? app.gender) : null} />
          <Row label="Date de naissance" value={app.date_of_birth ? fmtDate(app.date_of_birth) : null} />
          <Row label="Classe visée" value={app.classes ? [app.classes.name, app.classes.section].filter(Boolean).join(' ') : null} />
          <Row label="Année (campagne)" value={app.academic_years?.name ?? null} />
          <Row label="Tuteur / parent" value={app.guardian_name} />
          <Row label="Téléphone" value={app.guardian_phone} />
          <Row label="Email" value={app.guardian_email} />
          <Row label="Documents reçus" value={app.documents} />
          <Row label="Notes" value={app.notes} />
          {app.decision_reason && <Row label="Motif de la décision" value={app.decision_reason} />}
        </dl>
      </div>

      {/* ── Converted → link to student ─────────────────────────────────────── */}
      {isConverted && student && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Candidat inscrit comme élève</p>
            <p className="text-xs text-emerald-700 mt-0.5">Matricule {student.admission_number}</p>
          </div>
          <a href={`/school/students/${student.id}`} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
            Voir le dossier élève →
          </a>
        </div>
      )}

      {/* ── Decision controls ───────────────────────────────────────────────── */}
      {!isConverted && (
        <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Décision</h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {app.status === 'draft' && (
                <StatusButton id={app.id} status="submitted" label="Soumettre" tone="bg-sky-600 hover:bg-sky-700 text-white" />
              )}
              {(app.status === 'submitted' || app.status === 'waitlisted') && (
                <StatusButton id={app.id} status="accepted" label="Accepter" tone="bg-emerald-600 hover:bg-emerald-700 text-white" />
              )}
              {app.status === 'submitted' && (
                <StatusButton id={app.id} status="waitlisted" label="Mettre en liste d'attente" tone="bg-amber-500 hover:bg-amber-600 text-white" />
              )}
            </div>

            {(app.status === 'submitted' || app.status === 'waitlisted' || app.status === 'accepted') && (
              <form action={setAdmissionStatus} className="flex flex-wrap items-end gap-3 border-t border-sand-100 pt-4">
                <input type="hidden" name="admission_id" value={app.id} />
                <input type="hidden" name="new_status" value="rejected" />
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor="decision_reason" className="block text-xs font-medium text-gray-600 mb-1">Motif du refus (optionnel)</label>
                  <input id="decision_reason" name="decision_reason" type="text" maxLength={500} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600" />
                </div>
                <button type="submit" className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">Refuser</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Documents ───────────────────────────────────────────────────────── */}
      <DocumentsSection
        ownerType="admission"
        ownerId={app.id}
        redirectTo={`/school/admissions/${app.id}`}
        documents={documents}
        okCode={searchParams.doc_ok}
        errorCode={searchParams.doc_error}
      />

      {/* ── Convert to student ──────────────────────────────────────────────── */}
      {app.status === 'accepted' && !isConverted && (
        <div className="overflow-hidden rounded-xl border-2 border-emerald-200 bg-white shadow-sm">
          <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-700">Convertir en élève</h2>
          </div>
          <div className="px-5 py-4">
            <ConvertForm admissionId={app.id} defaultClassId={app.desired_class_id} classes={classes} />
          </div>
        </div>
      )}

    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  const has = value !== null && value !== ''
  return (
    <div className="px-5 py-3 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className={`mt-1 sm:col-span-2 sm:mt-0 text-sm ${has ? 'text-gray-900' : 'italic text-gray-400'} whitespace-pre-wrap`}>
        {has ? value : 'Non renseigné'}
      </dd>
    </div>
  )
}
