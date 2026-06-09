'use client'

import { useEffect, useState } from 'react'

// Minimal shape of the (non-standard, Chromium-only) beforeinstallprompt event.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'edusen-install-dismissed'

/**
 * Small, non-intrusive "Installer EduSen" banner shown only when the browser
 * actually offers installation (Chromium fires `beforeinstallprompt`). It is
 * dismissible and remembers the dismissal, never blocks the page (renders
 * nothing until the event fires), and hides once the app is installed. iOS
 * Safari does not fire this event — users add to the home screen via the Share
 * menu, so nothing is shown there.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Already installed (standalone) or previously dismissed → never show.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS standalone flag
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return
    let dismissed = false
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      /* localStorage unavailable — treat as not dismissed */
    }
    if (dismissed) return

    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // suppress the default mini-infobar; we show our own UI
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    const onInstalled = () => {
      setVisible(false)
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function remember() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  async function handleInstall() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    // Whatever the choice, the prompt can only be used once — hide it.
    setVisible(false)
    setDeferred(null)
    remember()
  }

  function handleDismiss() {
    setVisible(false)
    remember()
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Installer EduSen"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-sm rounded-2xl border border-sand-200 bg-white p-4 shadow-2xl shadow-primary-900/15 sm:left-4 sm:right-auto"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">Installer EduSen</p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
            Ajoutez EduSen à votre écran d’accueil pour un accès rapide.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-1"
            >
              Installer
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-sand-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-sand-300"
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Fermer"
          className="-mr-1 -mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-sand-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-sand-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
