'use client'

import { useEffect, useRef } from 'react'

// Fires a server action once on mount to mark a thread's messages as read for the
// current viewer. Rendering this (instead of writing during render) keeps GETs
// side-effect free.
export function AutoMarkRead({ action, threadId }: { action: (threadId: string) => Promise<void>; threadId: string }) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    void action(threadId)
  }, [action, threadId])
  return null
}
