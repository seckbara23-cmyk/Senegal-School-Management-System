// Branded 404. Rendered inside the root layout, so the design system applies.
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-50 px-4">
      <div className="max-w-md text-center">
        <p className="text-5xl font-extrabold text-primary-700">404</p>
        <h1 className="mt-3 text-xl font-bold text-gray-900">Page introuvable</h1>
        <p className="mt-2 text-sm text-gray-500">
          La page que vous recherchez n&apos;existe pas ou a été déplacée.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href="/dashboard"
            className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            Retour à l&apos;accueil
          </a>
        </div>
      </div>
    </div>
  )
}
