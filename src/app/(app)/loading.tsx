// Lightweight skeleton shown during (app) route transitions / server fetches.
export default function AppLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement…">
      {/* Header band placeholder */}
      <div className="h-24 animate-pulse rounded-xl bg-sand-200" />
      {/* KPI row placeholder */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-sand-200" />
        ))}
      </div>
      {/* Content block placeholder */}
      <div className="h-64 animate-pulse rounded-xl bg-sand-200" />
    </div>
  )
}
