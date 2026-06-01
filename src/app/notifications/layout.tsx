// Neutral authenticated shell for the notification center. Lives OUTSIDE the
// (app) route group so it does not inherit the school-admin sidebar — it works
// the same for school_admin, teacher, parent, student, finance_officer and
// super_admin. The page itself handles auth + the role-aware back link.

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-sand-100">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  )
}
