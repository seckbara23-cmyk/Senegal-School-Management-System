'use client'

import { useMemo, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { generateTimetable, buildPeriods, toMinutes, type GenClassSubject, type TimeWindow, type ExistingSlot, type Period } from '@/lib/timetable/generator'
import { validateTimetable, type CheckSlot } from '@/lib/timetable/validator'
import { saveTimetableSlots, type GenerateState } from './actions'

const DAYS = [
  { v: 1, label: 'Lun' }, { v: 2, label: 'Mar' }, { v: 3, label: 'Mer' },
  { v: 4, label: 'Jeu' }, { v: 5, label: 'Ven' }, { v: 6, label: 'Sam' },
]
const dayLabel = (d: number) => DAYS.find((x) => x.v === d)?.label ?? String(d)

type EditSlot = { id: string; classId: string; classSubjectId: string; teacherId: string | null; day: number; periodIndex: number }
type Config = { days: number[]; startTime: string; periodMinutes: number; periodsPerDay: number; breakAfter: number; breakMinutes: number; useBreak: boolean }
type Session = { periods: Period[]; slots: EditSlot[]; unplaced: { classSubjectId: string; classId: string; subjectName: string; missing: number }[] }

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
      {pending ? 'Enregistrement…' : count > 0 ? `Enregistrer (${count})` : 'Enregistrer'}
    </button>
  )
}

export function GenerateWizard({
  yearId, classes, classSubjects, teachers, availability, existing, status,
}: {
  yearId: string
  classes: { id: string; name: string; section: string | null }[]
  classSubjects: GenClassSubject[]
  teachers: { id: string; name: string }[]
  availability: TimeWindow[]
  existing: ExistingSlot[]
  status: 'draft' | 'published' | 'locked' | null
}) {
  const locked = status === 'locked'
  const [state, formAction] = useFormState(saveTimetableSlots, {} as GenerateState)
  const [config, setConfig] = useState<Config>({ days: [1, 2, 3, 4, 5], startTime: '08:00', periodMinutes: 60, periodsPerDay: 6, breakAfter: 3, breakMinutes: 15, useBreak: true })
  const [dirty, setDirty] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)

  const teacherName = useMemo(() => new Map(teachers.map((t) => [t.id, t.name])), [teachers])
  const csById = useMemo(() => new Map(classSubjects.map((cs) => [cs.classSubjectId, cs])), [classSubjects])

  const buildSession = (cfg: Config): Session => {
    const periods = buildPeriods({ startTime: cfg.startTime, periodMinutes: cfg.periodMinutes, periodsPerDay: cfg.periodsPerDay, breakAfter: cfg.useBreak ? cfg.breakAfter : null, breakMinutes: cfg.useBreak ? cfg.breakMinutes : null })
    const days = [...cfg.days].sort((a, b) => a - b)
    const result = generateTimetable({ grid: { days, periods }, classSubjects, availability, existing })
    const byStart = new Map(periods.map((p) => [p.start, p.index]))
    const slots: EditSlot[] = result.slots.map((s, i) => ({ id: `g${i}`, classId: s.classId, classSubjectId: s.classSubjectId, teacherId: s.teacherId, day: s.day, periodIndex: byStart.get(s.start) ?? 0 }))
    return { periods, slots, unplaced: result.unplaced }
  }

  const [session, setSession] = useState<Session>(() => buildSession({ days: [1, 2, 3, 4, 5], startTime: '08:00', periodMinutes: 60, periodsPerDay: 6, breakAfter: 3, breakMinutes: 15, useBreak: true }))
  const sortedDays = useMemo(() => [...config.days].sort((a, b) => a - b), [config.days])

  function regenerate() {
    if (locked) return
    setSession(buildSession(config)); setDirty(false); setSelected(null)
    setMessage({ kind: 'info', text: 'Nouvelle proposition générée.' })
  }
  function patchConfig(p: Partial<Config>) { setConfig((c) => ({ ...c, ...p })); setDirty(true) }

  // CheckSlot lists (existing read-only + editable) for the validator.
  const existingChecks = useMemo<CheckSlot[]>(() => existing.map((e) => ({ classId: e.classId, classSubjectId: e.classSubjectId, teacherId: e.teacherId, day: e.day, start: e.start, end: e.end })), [existing])
  const toCheck = (s: EditSlot): CheckSlot => ({ classId: s.classId, classSubjectId: s.classSubjectId, teacherId: s.teacherId, day: s.day, start: session.periods[s.periodIndex].start, end: session.periods[s.periodIndex].end })
  const validation = useMemo(() => validateTimetable([...existingChecks, ...session.slots.map(toCheck)], availability), [existingChecks, session, availability]) // eslint-disable-line react-hooks/exhaustive-deps

  // A move is rejected when it INCREASES the total conflict count (reuses
  // validator.ts). The category that grew gives the French explanation.
  function tryMove(slotId: string, day: number, periodIndex: number) {
    if (locked) return
    const slot = session.slots.find((s) => s.id === slotId)
    if (!slot) return
    if (slot.day === day && slot.periodIndex === periodIndex) { setSelected(null); return }
    const candidate = session.slots.map((s) => (s.id === slotId ? { ...s, day, periodIndex } : s))
    const before = validation.counts
    const after = validateTimetable([...existingChecks, ...candidate.map(toCheck)], availability).counts
    if (after.total > before.total) {
      const reason = after.class > before.class
        ? 'Conflit de classe : la classe a déjà un cours sur ce créneau.'
        : after.teacher > before.teacher
          ? "Conflit d'enseignant : l'enseignant est déjà occupé sur ce créneau."
          : "Hors disponibilité : l'enseignant n'est pas disponible sur ce créneau."
      setMessage({ kind: 'error', text: reason })
      return
    }
    setSession((s) => ({ ...s, slots: candidate })); setSelected(null); setMessage({ kind: 'info', text: 'Cours déplacé.' })
  }

  function deleteSlot(slotId: string) {
    if (locked) return
    setSession((s) => ({ ...s, slots: s.slots.filter((x) => x.id !== slotId) }))
    setSelected(null)
  }

  function onCellActivate(classId: string, day: number, periodIndex: number) {
    if (!selected || locked) return
    const slot = session.slots.find((s) => s.id === selected)
    if (!slot) { setSelected(null); return }
    if (slot.classId !== classId) { setMessage({ kind: 'error', text: 'Un cours ne peut être déplacé que dans sa propre classe.' }); return }
    tryMove(selected, day, periodIndex)
  }

  // Cell occupancy (editable + existing) for rendering.
  const cells = useMemo(() => {
    const m = new Map<string, { slotId?: string; sub: string; teacher: string | null; isNew: boolean }>()
    const byStart = new Map(session.periods.map((p) => [p.start, p.index]))
    for (const e of existing) {
      const pi = byStart.get(e.start)
      if (pi === undefined || !sortedDays.includes(e.day)) continue
      m.set(`${e.classId}|${e.day}|${pi}`, { sub: csById.get(e.classSubjectId)?.subjectName ?? '—', teacher: e.teacherId ? (teacherName.get(e.teacherId) ?? null) : null, isNew: false })
    }
    for (const s of session.slots) {
      m.set(`${s.classId}|${s.day}|${s.periodIndex}`, { slotId: s.id, sub: csById.get(s.classSubjectId)?.subjectName ?? '—', teacher: s.teacherId ? (teacherName.get(s.teacherId) ?? null) : null, isNew: true })
    }
    return m
  }, [session, existing, csById, teacherName, sortedDays])

  // Teacher workload: assigned hours vs available capacity (periods inside windows).
  const workload = useMemo(() => {
    const assigned = new Map<string, number>()
    for (const s of session.slots) if (s.teacherId) assigned.set(s.teacherId, (assigned.get(s.teacherId) ?? 0) + 1)
    return teachers.map((t) => {
      const windows = availability.filter((w) => w.teacherId === t.id)
      let capacity: number | null = null
      if (windows.length > 0) {
        capacity = 0
        for (const day of sortedDays) for (const p of session.periods) {
          if (windows.some((w) => w.day === day && toMinutes(w.start) <= toMinutes(p.start) && toMinutes(w.end) >= toMinutes(p.end))) capacity++
        }
      }
      return { id: t.id, name: t.name, hours: assigned.get(t.id) ?? 0, capacity }
    }).filter((w) => w.hours > 0 || w.capacity !== null).sort((a, b) => b.hours - a.hours)
  }, [session, teachers, availability, sortedDays])

  const conflicts = validation.counts.total
  const saveDisabled = locked || session.slots.length === 0 || conflicts > 0

  const cls = 'rounded-lg border border-sand-300 px-2 py-1.5 text-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'

  return (
    <div className="space-y-6">
      {locked && (
        <div role="status" className="rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-sm text-gray-700">🔒 Cet emploi du temps est <span className="font-semibold">verrouillé</span>. Déverrouillez-le depuis l&apos;emploi du temps pour le modifier.</div>
      )}

      {/* Config */}
      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Paramètres</p></div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="block text-xs font-medium text-gray-600 mb-1.5">Jours</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <button key={d.v} type="button" disabled={locked} onClick={() => patchConfig({ days: config.days.includes(d.v) ? config.days.filter((x) => x !== d.v) : [...config.days, d.v] })}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${config.days.includes(d.v) ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-500 hover:bg-sand-50'}`}>{d.label}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block"><span className="block text-xs font-medium text-gray-600 mb-1">Début</span><input type="time" disabled={locked} value={config.startTime} onChange={(e) => patchConfig({ startTime: e.target.value })} className={`w-full ${cls}`} /></label>
            <label className="block"><span className="block text-xs font-medium text-gray-600 mb-1">Durée (min)</span><input type="number" min={15} max={240} disabled={locked} value={config.periodMinutes} onChange={(e) => patchConfig({ periodMinutes: Number(e.target.value) || 60 })} className={`w-full ${cls}`} /></label>
            <label className="block"><span className="block text-xs font-medium text-gray-600 mb-1">Créneaux/jour</span><input type="number" min={1} max={14} disabled={locked} value={config.periodsPerDay} onChange={(e) => patchConfig({ periodsPerDay: Number(e.target.value) || 1 })} className={`w-full ${cls}`} /></label>
            <label className="block"><span className="block text-xs font-medium text-gray-600 mb-1">Pause après</span>
              <select disabled={locked} value={config.useBreak ? config.breakAfter : 0} onChange={(e) => { const n = Number(e.target.value); patchConfig(n === 0 ? { useBreak: false } : { useBreak: true, breakAfter: n }) }} className={`w-full ${cls}`}>
                <option value={0}>Aucune</option>
                {Array.from({ length: config.periodsPerDay - 1 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Créneau {n}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={regenerate} disabled={locked} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors">Générer</button>
            <button type="button" disabled title="Bientôt disponible — suggestions intelligentes" onClick={() => setMessage({ kind: 'info', text: 'Optimisation intelligente bientôt disponible.' })}
              className="rounded-lg border border-sand-300 px-4 py-2 text-sm font-semibold text-gray-400 cursor-not-allowed">Optimiser ✨</button>
            {dirty && <span className="text-xs text-amber-600">Paramètres modifiés — cliquez sur Générer pour appliquer.</span>}
          </div>
        </div>
      </div>

      {message && (
        <div role={message.kind === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${message.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-sky-200 bg-sky-50 text-sky-800'}`}>
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Fermer" className="shrink-0 text-gray-400 hover:text-gray-600">×</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Cours placés" value={session.slots.length} good={session.slots.length > 0} />
        <Kpi label="Non placés" value={session.unplaced.reduce((s, u) => s + u.missing, 0)} danger={session.unplaced.reduce((s, u) => s + u.missing, 0) > 0} />
        <Kpi label="Conflits" value={conflicts} danger={conflicts > 0} good={conflicts === 0} />
        <Kpi label="Existants conservés" value={existing.length} />
      </div>

      <p className="text-xs text-gray-500">Glissez-déposez un cours vers une case libre, ou touchez-le puis touchez la case cible. Les déplacements créant un conflit sont refusés.</p>

      {/* Teacher workload */}
      {workload.length > 0 && (
        <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-sand-200 bg-sand-50 px-5 py-2.5"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Charge des enseignants</p></div>
          <ul className="divide-y divide-sand-100">
            {workload.map((w) => {
              const over = w.capacity !== null && w.hours > w.capacity
              return (
                <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-2">
                  <span className="text-sm text-gray-800">{w.name}</span>
                  <span className={`text-sm font-semibold ${over ? 'text-red-600' : 'text-gray-700'}`}>{w.hours} h{w.capacity !== null ? ` / ${w.capacity}` : ''}{over ? ' ⚠' : ''}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Editable grids */}
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
                  {session.periods.map((p) => (
                    <tr key={p.index} className="border-t border-sand-100">
                      <td className="px-2 py-1.5 whitespace-nowrap font-mono text-gray-400">{p.start}–{p.end}</td>
                      {sortedDays.map((d) => {
                        const cell = cells.get(`${c.id}|${d}|${p.index}`)
                        const isSelected = cell?.slotId && cell.slotId === selected
                        return (
                          <td key={d} className="px-1 py-1 align-top"
                            onDragOver={(e) => { if (!locked && cell?.isNew !== false) e.preventDefault() }}
                            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text'); if (id) onCellDrop(id, c.id, d, p.index) }}
                            onClick={() => { if (!cell) onCellActivate(c.id, d, p.index) }}>
                            {cell ? (
                              cell.isNew ? (
                                <div draggable={!locked} onDragStart={(e) => e.dataTransfer.setData('text', cell.slotId!)} onClick={(e) => { e.stopPropagation(); if (!locked) setSelected(isSelected ? null : cell.slotId!) }}
                                  className={`group cursor-grab rounded px-1.5 py-1 ${isSelected ? 'ring-2 ring-primary-500 bg-primary-100' : 'bg-primary-50'} text-primary-800`}>
                                  <div className="flex items-start justify-between gap-1">
                                    <p className="font-semibold leading-tight">{cell.sub}</p>
                                    {!locked && <button type="button" onClick={(e) => { e.stopPropagation(); deleteSlot(cell.slotId!) }} aria-label="Supprimer" className="text-red-400 opacity-0 group-hover:opacity-100">×</button>}
                                  </div>
                                  {cell.teacher && <p className="text-[10px] text-gray-500 leading-tight truncate">{cell.teacher}</p>}
                                </div>
                              ) : (
                                <div className="rounded px-1.5 py-1 bg-sand-100 text-gray-500" title="Créneau existant (non modifiable ici)">
                                  <p className="font-semibold leading-tight">{cell.sub}</p>
                                  {cell.teacher && <p className="text-[10px] leading-tight truncate">{cell.teacher}</p>}
                                </div>
                              )
                            ) : (
                              <div className={`min-h-[28px] rounded ${selected ? 'border border-dashed border-primary-300' : ''}`}><span className="text-gray-200">·</span></div>
                            )}
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
        <input type="hidden" name="slots" value={JSON.stringify(session.slots.map((s) => ({ classSubjectId: s.classSubjectId, classId: s.classId, teacherId: s.teacherId, day: s.day, start: session.periods[s.periodIndex].start, end: session.periods[s.periodIndex].end })))} />
        {state.errors?._form && <p className="w-full text-sm text-red-700">{state.errors._form.join(' ')}</p>}
        <SaveButton disabled={saveDisabled} count={session.slots.length} />
        <a href="/school/timetable" className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
        {conflicts === 0 && session.slots.length > 0 && !locked && <span className="text-xs font-medium text-emerald-600">✓ Aucun conflit</span>}
      </form>
    </div>
  )

  function onCellDrop(slotId: string, classId: string, day: number, periodIndex: number) {
    if (locked) return
    const slot = session.slots.find((s) => s.id === slotId)
    if (!slot) return
    if (slot.classId !== classId) { setMessage({ kind: 'error', text: 'Un cours ne peut être déplacé que dans sa propre classe.' }); return }
    if (cells.get(`${classId}|${day}|${periodIndex}`)) { setMessage({ kind: 'error', text: 'Cette case est déjà occupée.' }); return }
    tryMove(slotId, day, periodIndex)
  }
}
