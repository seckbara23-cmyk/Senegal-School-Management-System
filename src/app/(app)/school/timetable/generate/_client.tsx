'use client'

import { useMemo, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { generateTimetable, buildPeriods, type GenClassSubject, type TimeWindow, type ExistingSlot } from '@/lib/timetable/generator'
import { validateTimetable, type CheckSlot } from '@/lib/timetable/validator'
import { generateAndSaveTimetable, type GenerateState } from './actions'

const DAYS = [
  { v: 1, label: 'Lun' }, { v: 2, label: 'Mar' }, { v: 3, label: 'Mer' },
  { v: 4, label: 'Jeu' }, { v: 5, label: 'Ven' }, { v: 6, label: 'Sam' },
]

function Kpi({ label, value, danger, good }: { label: string; value: number | string; danger?: boolean; good?: boolean }) {
  return (
    <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${danger ? 'text-red-600' : good ? 'text-emerald-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function SaveButton({ disabled, count }: { disabled: boolean; count: number }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending || disabled}
      className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
      {pending ? 'Enregistrement…' : count > 0 ? `Enregistrer (${count} créneaux)` : 'Enregistrer'}
    </button>
  )
}

const initial: GenerateState = {}

export function GenerateWizard({
  yearId, classes, classSubjects, teachers, availability, existing,
}: {
  yearId: string
  classes: { id: string; name: string; section: string | null }[]
  classSubjects: GenClassSubject[]
  teachers: { id: string; name: string }[]
  availability: TimeWindow[]
  existing: ExistingSlot[]
}) {
  const [state, formAction] = useFormState(generateAndSaveTimetable, initial)
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [startTime, setStartTime] = useState('08:00')
  const [periodMinutes, setPeriodMinutes] = useState(60)
  const [periodsPerDay, setPeriodsPerDay] = useState(6)
  const [breakAfter, setBreakAfter] = useState(3)
  const [breakMinutes, setBreakMinutes] = useState(15)
  const [useBreak, setUseBreak] = useState(true)

  const teacherName = useMemo(() => new Map(teachers.map((t) => [t.id, t.name])), [teachers])
  const classLabel = useMemo(() => new Map(classes.map((c) => [c.id, [c.name, c.section].filter(Boolean).join(' ')])), [classes])
  const csById = useMemo(() => new Map(classSubjects.map((cs) => [cs.classSubjectId, cs])), [classSubjects])

  const { periods, result, validation } = useMemo(() => {
    const periods = buildPeriods({
      startTime, periodMinutes, periodsPerDay,
      breakAfter: useBreak ? breakAfter : null, breakMinutes: useBreak ? breakMinutes : null,
    })
    const sortedDays = [...days].sort((a, b) => a - b)
    const result = generateTimetable({ grid: { days: sortedDays, periods }, classSubjects, availability, existing })
    const existingChecks: CheckSlot[] = existing.map((e) => ({ classId: e.classId, classSubjectId: e.classSubjectId, teacherId: e.teacherId, day: e.day, start: e.start, end: e.end }))
    const allChecks: CheckSlot[] = [...existingChecks, ...result.slots.map((s) => ({ classId: s.classId, classSubjectId: s.classSubjectId, teacherId: s.teacherId, day: s.day, start: s.start, end: s.end }))]
    const validation = validateTimetable(allChecks, availability)
    return { periods, result, validation }
  }, [days, startTime, periodMinutes, periodsPerDay, breakAfter, breakMinutes, useBreak, classSubjects, availability, existing])

  const sortedDays = [...days].sort((a, b) => a - b)

  // Cell lookup for the preview grid: classId|day|periodIndex → cell
  const cells = useMemo(() => {
    const m = new Map<string, { sub: string; teacher: string | null; isNew: boolean }>()
    const periodByStart = new Map(periods.map((p) => [p.start, p.index]))
    for (const e of existing) {
      const pi = periodByStart.get(e.start)
      if (pi === undefined || !sortedDays.includes(e.day)) continue
      const cs = csById.get(e.classSubjectId)
      m.set(`${e.classId}|${e.day}|${pi}`, { sub: cs?.subjectName ?? '—', teacher: e.teacherId ? (teacherName.get(e.teacherId) ?? null) : null, isNew: false })
    }
    for (const s of result.slots) {
      const pi = periodByStart.get(s.start)
      if (pi === undefined) continue
      const cs = csById.get(s.classSubjectId)
      m.set(`${s.classId}|${s.day}|${pi}`, { sub: cs?.subjectName ?? '—', teacher: s.teacherId ? (teacherName.get(s.teacherId) ?? null) : null, isNew: true })
    }
    return m
  }, [periods, existing, result, csById, teacherName, sortedDays])

  function toggleDay(v: number) {
    setDays((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]))
  }

  const dayLabel = (d: number) => DAYS.find((x) => x.v === d)?.label ?? String(d)
  const conflicts = validation.counts.total

  return (
    <div className="space-y-6">
      {/* Config */}
      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Paramètres</p></div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="block text-xs font-medium text-gray-600 mb-1.5">Jours</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <button key={d.v} type="button" onClick={() => toggleDay(d.v)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    days.includes(d.v) ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-500 hover:bg-sand-50'
                  }`}>{d.label}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Début</span>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full rounded-lg border border-sand-300 px-2 py-1.5 text-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Durée (min)</span>
              <input type="number" min={15} max={240} value={periodMinutes} onChange={(e) => setPeriodMinutes(Number(e.target.value) || 60)} className="w-full rounded-lg border border-sand-300 px-2 py-1.5 text-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Créneaux/jour</span>
              <input type="number" min={1} max={14} value={periodsPerDay} onChange={(e) => setPeriodsPerDay(Number(e.target.value) || 1)} className="w-full rounded-lg border border-sand-300 px-2 py-1.5 text-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Pause après</span>
              <select value={useBreak ? breakAfter : 0} onChange={(e) => { const n = Number(e.target.value); if (n === 0) setUseBreak(false); else { setUseBreak(true); setBreakAfter(n) } }} className="w-full rounded-lg border border-sand-300 px-2 py-1.5 text-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
                <option value={0}>Aucune</option>
                {Array.from({ length: periodsPerDay - 1 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Créneau {n} ({useBreak ? breakMinutes : 15} min)</option>)}
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Heures à placer" value={result.stats.needed} />
        <Kpi label="Placés" value={result.stats.placed} good={result.stats.placed > 0} />
        <Kpi label="Non placés" value={result.stats.unplaced} danger={result.stats.unplaced > 0} />
        <Kpi label="Conflits" value={conflicts} danger={conflicts > 0} good={conflicts === 0} />
      </div>
      {existing.length > 0 && (
        <p className="text-xs text-gray-500">{existing.length} créneau{existing.length > 1 ? 'x' : ''} existant{existing.length > 1 ? 's' : ''} conservé{existing.length > 1 ? 's' : ''} — la génération les complète sans créer de conflit.</p>
      )}

      {/* Unplaced */}
      {result.unplaced.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">Cours non placés (manque de créneaux ou de disponibilité) :</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {result.unplaced.map((u) => (
              <li key={u.classSubjectId} className="text-xs text-amber-700">{classLabel.get(u.classId) ?? '—'} · {u.subjectName} — {u.missing} manquant{u.missing > 1 ? 's' : ''}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview grids per class */}
      <div className="space-y-5">
        {classes.map((c) => (
          <div key={c.id} className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
            <div className="border-b border-sand-200 bg-sand-50 px-5 py-2.5"><p className="text-sm font-semibold text-gray-900">{[c.name, c.section].filter(Boolean).join(' ')}</p></div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-sand-100">
                    <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Horaire</th>
                    {sortedDays.map((d) => <th key={d} className="px-2 py-1.5 text-left font-semibold text-gray-500">{dayLabel(d)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.index} className="border-t border-sand-100">
                      <td className="px-2 py-1.5 whitespace-nowrap font-mono text-gray-400">{p.start}–{p.end}</td>
                      {sortedDays.map((d) => {
                        const cell = cells.get(`${c.id}|${d}|${p.index}`)
                        return (
                          <td key={d} className="px-1 py-1">
                            {cell ? (
                              <div className={`rounded px-1.5 py-1 ${cell.isNew ? 'bg-primary-50 text-primary-800' : 'bg-sand-100 text-gray-600'}`}>
                                <p className="font-semibold leading-tight">{cell.sub}</p>
                                {cell.teacher && <p className="text-[10px] text-gray-500 leading-tight truncate">{cell.teacher}</p>}
                              </div>
                            ) : <span className="text-gray-200">·</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Save */}
      <form action={formAction} className="flex flex-wrap items-center gap-3 border-t border-sand-200 pt-4">
        <input type="hidden" name="year_id" value={yearId} />
        <input type="hidden" name="days" value={sortedDays.join(',')} />
        <input type="hidden" name="start_time" value={startTime} />
        <input type="hidden" name="period_minutes" value={periodMinutes} />
        <input type="hidden" name="periods_per_day" value={periodsPerDay} />
        <input type="hidden" name="break_after" value={useBreak ? breakAfter : ''} />
        <input type="hidden" name="break_minutes" value={useBreak ? breakMinutes : ''} />
        {state.errors?._form && <p className="w-full text-sm text-red-700">{state.errors._form.join(' ')}</p>}
        <SaveButton disabled={result.slots.length === 0} count={result.slots.length} />
        <a href="/school/timetable" className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
        {conflicts === 0 && result.slots.length > 0 && <span className="text-xs font-medium text-emerald-600">✓ Aucun conflit détecté</span>}
      </form>
    </div>
  )
}
