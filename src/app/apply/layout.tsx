import type { ReactNode } from 'react'

export const metadata = { title: 'Candidature en ligne · ScolaTech' }

export default function ApplyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-sand-50">
      <header className="border-b border-sand-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <span className="text-lg font-bold text-primary-700">ScolaTech</span>
          <span className="text-xs text-gray-400">· Candidature en ligne</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-2xl px-4 pb-8 pt-2 text-center text-xs text-gray-400">Propulsé par ScolaTech</footer>
    </div>
  )
}
