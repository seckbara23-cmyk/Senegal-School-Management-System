import { AutoMarkRead } from '@/components/AutoMarkRead'
import { formatRelativeTime } from '@/lib/notifications'
import type { ThreadHeader, ThreadMessage } from '@/lib/messaging'

const ROLE_LABEL: Record<string, string> = { parent: 'Parent', teacher: 'Enseignant', school_admin: 'Administration' }

export function Conversation({ header, messages, otherName, otherRole, backHref, replyAction, markRead, threadId, locked }: {
  header: ThreadHeader
  messages: ThreadMessage[]
  otherName: string
  otherRole: string
  backHref: string
  replyAction: (formData: FormData) => void | Promise<void>
  markRead: (threadId: string) => Promise<void>
  threadId: string
  locked?: boolean
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 pb-8">
      <AutoMarkRead action={markRead} threadId={threadId} />

      <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
        <a href={backHref} className="text-sm text-primary-600 hover:underline">← Messages</a>
        <h1 className="mt-1 text-lg font-bold tracking-tight text-gray-900">{otherName} <span className="text-sm font-normal text-gray-400">· {otherRole}</span></h1>
        <p className="text-sm text-gray-500">{header.subject ? header.subject + ' · ' : ''}À propos de {header.studentName}</p>
      </div>

      <div className="space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400">Aucun message pour le moment.</p>
        ) : messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-sm ${m.mine ? 'bg-primary-600 text-white' : 'bg-white border border-sand-200 text-gray-800'}`}>
              {!m.mine && <p className="mb-0.5 text-[11px] font-semibold text-gray-400">{ROLE_LABEL[m.senderRole] ?? m.senderRole}</p>}
              <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              <p className={`mt-1 text-[10px] ${m.mine ? 'text-white/70' : 'text-gray-400'}`}>{formatRelativeTime(m.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>

      {locked ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">L&apos;école est en lecture seule — l&apos;envoi de messages est désactivé.</p>
      ) : (
        <form action={replyAction} className="sticky bottom-0 flex items-end gap-2 rounded-xl border border-sand-200 bg-white p-2 shadow-sm">
          <input type="hidden" name="thread_id" value={threadId} />
          <textarea name="body" required rows={2} maxLength={4000} placeholder="Écrire un message…"
            className="block flex-1 resize-none rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600" />
          <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700">Envoyer</button>
        </form>
      )}
    </div>
  )
}
