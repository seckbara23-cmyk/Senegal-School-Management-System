import { NewSubjectForm } from './_form'

export default function NewSubjectPage() {
  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/academics/subjects" className="text-primary-300 hover:text-white text-sm">
            ← Matières
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Nouvelle matière</h1>
        <p className="text-primary-300 text-sm mt-0.5">Ajouter une matière au catalogue de l&apos;école</p>
      </div>

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <NewSubjectForm />
      </div>

    </div>
  )
}
