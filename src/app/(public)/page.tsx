export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">School Management System</h1>
            </div>
            <div className="flex items-center space-x-4">
              <a href="/login" className="text-gray-500 hover:text-gray-900">Login</a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-16 px-4 sm:py-24 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-6xl">
            Multi-Tenant School Management
          </h2>
          <p className="mt-6 max-w-2xl mx-auto text-xl text-gray-500">
            A comprehensive SaaS platform for managing schools in Senegal. Built for scalability, security, and mobile-first experience.
          </p>
          <div className="mt-10">
            <a
              href="/login"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-6 rounded-md"
            >
              Get Started
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}

