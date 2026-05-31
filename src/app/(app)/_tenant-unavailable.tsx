import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Full-screen notice shown to a school user whose tenant has been suspended or
// archived by a super admin. No school data is exposed — only a status message
// and a sign-out action. Rendered by the (app) layout in place of children.

async function signOutAction() {
  'use server'
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export function TenantUnavailable({
  status,
  schoolName,
  userEmail,
}: {
  status: 'suspended' | 'archived'
  schoolName: string
  userEmail: string
}) {
  const isArchived = status === 'archived'
  const title = isArchived ? 'Établissement archivé' : 'Accès suspendu'
  const message = isArchived
    ? "Cet établissement a été archivé et n'est plus accessible. Vos données sont conservées. Contactez l'administration de la plateforme pour toute question."
    : "L'accès à cet établissement a été temporairement suspendu. Vos données sont intactes. Veuillez contacter l'administration de la plateforme pour rétablir l'accès."

  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <span
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
            isArchived ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-600'
          }`}
        >
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            {isArchived ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4m16 0l-1 12a2 2 0 01-2 2H7a2 2 0 01-2-2L4 7m16 0l-1.5-3H5.5L4 7m6 5h4" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M12 3l9 16H3l9-16z" />
            )}
          </svg>
        </span>

        <h1 className="mt-5 text-xl font-bold text-gray-900">{title}</h1>
        {schoolName && <p className="mt-1 text-sm font-medium text-gray-600">{schoolName}</p>}
        <p className="mt-4 text-sm leading-relaxed text-gray-500">{message}</p>

        <form action={signOutAction} className="mt-6">
          <button
            type="submit"
            className="inline-flex w-full justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Se déconnecter
          </button>
        </form>
        {userEmail && <p className="mt-3 text-xs text-gray-400">Connecté en tant que {userEmail}</p>}
      </div>
    </div>
  )
}
