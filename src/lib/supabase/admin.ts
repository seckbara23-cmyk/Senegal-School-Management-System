import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS entirely.
// MUST only be imported from server-side code (Server Components, Server Actions, Route Handlers).
// NEVER import this in client components or expose the service role key to the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession:   false,
      },
    }
  )
}
