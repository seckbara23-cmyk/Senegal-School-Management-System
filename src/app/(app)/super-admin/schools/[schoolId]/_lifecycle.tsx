'use client'

import { suspendSchool, reactivateSchool, archiveSchool } from '../actions'
import { ConfirmButton } from './_confirm'

// Super-admin tenant lifecycle controls. The available transitions depend on
// the school's current subscription_status:
//   active    → Suspend, Archive
//   suspended → Reactivate, Archive
//   archived  → Reactivate (un-archive)
export function SchoolLifecycle({ schoolId, status }: { schoolId: string; status: string }) {
  const hiddens = { school_id: schoolId }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status !== 'active' && (
        <ConfirmButton
          action={reactivateSchool}
          hiddens={hiddens}
          trigger="Réactiver"
          message="Réactiver cet établissement ?"
          confirmLabel="Réactiver"
          tone="primary"
        />
      )}

      {status === 'active' && (
        <ConfirmButton
          action={suspendSchool}
          hiddens={hiddens}
          trigger="Suspendre"
          message="Suspendre l'accès ? Les utilisateurs de l'école seront bloqués ; les données sont conservées."
          confirmLabel="Suspendre"
          tone="danger"
        />
      )}

      {status === 'suspended' && (
        <ConfirmButton
          action={suspendSchool}
          hiddens={hiddens}
          trigger="Re-suspendre"
          message="Suspendre l'accès ? Les utilisateurs de l'école seront bloqués ; les données sont conservées."
          confirmLabel="Suspendre"
          tone="danger"
        />
      )}

      {status !== 'archived' && (
        <ConfirmButton
          action={archiveSchool}
          hiddens={hiddens}
          trigger="Archiver"
          message="Archiver cet établissement ? Il deviendra un tenant historique, masqué de la liste active."
          confirmLabel="Archiver"
          tone="neutral"
        />
      )}
    </div>
  )
}
