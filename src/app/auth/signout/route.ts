import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('Error signing out:', error)
  }

  revalidatePath('/', 'layout')

  // Redirect to the landing page with headers that prevent every caching
  // layer (browser, CDN, proxy) from storing the response.  Without these,
  // a cached redirect could bypass the updated landing page.
  const url = new URL('/', request.url)
  const response = NextResponse.redirect(url, { status: 302 })
  response.headers.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  )
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')
  return response
}
