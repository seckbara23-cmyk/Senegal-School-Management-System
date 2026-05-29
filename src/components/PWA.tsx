'use client'

import { useEffect } from 'react'

export default function PWA() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // If the page is already controlled by a previous service worker, a new
    // worker taking control (via skipWaiting + clients.claim) fires
    // `controllerchange`. Reload once so the corrected worker controls this
    // page and stale app content is replaced immediately. New visitors with no
    // prior controller are skipped — they get the correct worker on first load.
    const hadController = !!navigator.serviceWorker.controller
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || refreshing) return
      refreshing = true
      window.location.reload()
    })

    navigator.serviceWorker.register('/sw.js')
      // Force an immediate update check so a newly deployed worker is picked up
      // without waiting for the browser's periodic check.
      .then((registration) => registration.update())
      .catch(() => {
        /* registration/update failure is non-fatal */
      })
  }, [])

  return null
}