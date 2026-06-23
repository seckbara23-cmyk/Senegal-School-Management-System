'use client'

import { useRef, useState } from 'react'
import { askCopilot } from './actions'
import type { CopilotAnswer } from '@/lib/copilot/types'

type Msg = { role: 'user'; text: string } | { role: 'assistant'; answer: CopilotAnswer }

function AnswerCard({ answer, onSuggestion }: { answer: CopilotAnswer; onSuggestion: (q: string) => void }) {
  return (
    <div className="max-w-[90%] space-y-3 rounded-2xl rounded-tl-sm border border-sand-200 bg-white px-4 py-3 shadow-sm">
      <div>
        <p className="text-sm font-bold text-gray-900">{answer.title}</p>
        <p className="mt-0.5 text-sm text-gray-700">{answer.summary}</p>
      </div>
      {answer.sections.map((s, i) => (
        <div key={i}>
          {s.heading && <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{s.heading}</p>}
          <ul className="mt-0.5 space-y-0.5">{s.lines.map((l, j) => <li key={j} className="text-sm text-gray-700">{l}</li>)}</ul>
        </div>
      ))}
      {answer.notice && <p className="text-xs text-amber-600">{answer.notice}</p>}
      {answer.links.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {answer.links.map((l, i) => <a key={i} href={l.href} className="rounded-lg border border-sand-200 bg-sand-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-sand-100">{l.label} →</a>)}
        </div>
      )}
      {answer.suggestions && answer.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {answer.suggestions.map((s, i) => <button key={i} type="button" onClick={() => onSuggestion(s)} className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100">{s}</button>)}
        </div>
      )}
    </div>
  )
}

export function CopilotChat({ suggestions }: { suggestions: string[] }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  async function send(q: string) {
    const query = q.trim()
    if (!query || pending) return
    setMessages((m) => [...m, { role: 'user', text: query }])
    setInput(''); setPending(true)
    try {
      const answer = await askCopilot(query)
      setMessages((m) => [...m, { role: 'assistant', answer }])
    } catch {
      setMessages((m) => [...m, { role: 'assistant', answer: { intent: 'unknown', title: 'Erreur', summary: 'Une erreur est survenue. Réessayez.', sections: [], links: [] } }])
    }
    setPending(false)
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.length === 0 ? (
        <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-900">Posez une question sur votre école</p>
          <p className="mt-1 text-xs text-gray-500">Réponses en lecture seule, calculées à partir de vos données. Aucune modification n’est effectuée.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100">{s}</button>)}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'user'
                ? <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary-600 px-4 py-2 text-sm text-white shadow-sm">{m.text}</div>
                : <AnswerCard answer={m.answer} onSuggestion={send} />}
            </div>
          ))}
          {pending && <div className="flex justify-start"><div className="rounded-2xl rounded-tl-sm border border-sand-200 bg-white px-4 py-2 text-sm text-gray-400 shadow-sm">…</div></div>}
          <div ref={endRef} />
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="sticky bottom-0 flex items-center gap-2 rounded-xl border border-sand-200 bg-white p-2 shadow-sm">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ex. « Résumé de Awa Diop » ou « Situation financière »" maxLength={300}
          className="flex-1 rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600" />
        <button type="submit" disabled={pending || !input.trim()} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">Demander</button>
      </form>
    </div>
  )
}
