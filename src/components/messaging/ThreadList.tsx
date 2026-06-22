import { formatRelativeTime } from '@/lib/notifications'
import type { ThreadSummary } from '@/lib/messaging'

export function ThreadList({ threads, basePath, otherRole, title, subtitle, newHref }: {
  threads: ThreadSummary[]; basePath: string; otherRole: string; title: string; subtitle: string; newHref: string
}) {
  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <a href={newHref} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700">+ Nouveau message</a>
      </div>

      {threads.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Aucune conversation</p>
          <p className="mt-1 text-sm text-gray-500">Démarrez une conversation avec « Nouveau message ».</p>
        </div>
      ) : (
        <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          {threads.map((t) => (
            <a key={t.id} href={`${basePath}/${t.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-sand-50">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
                {t.otherName.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-gray-900">{t.otherName} <span className="font-normal text-gray-400">· {otherRole}</span></p>
                  <span className="shrink-0 text-xs text-gray-400">{formatRelativeTime(t.lastMessageAt)}</span>
                </div>
                <p className="truncate text-xs text-gray-500">{t.subject || `À propos de ${t.studentName}`}</p>
              </div>
              {t.unread > 0 && <span className="ml-1 shrink-0 rounded-full bg-primary-600 px-2 py-0.5 text-xs font-bold text-white">{t.unread}</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
