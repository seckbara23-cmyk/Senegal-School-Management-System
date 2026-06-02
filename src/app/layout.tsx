import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import PWA from '@/components/PWA'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'EduSen — La gestion scolaire pour les écoles sénégalaises',
  description:
    'Plateforme de gestion scolaire tout-en-un pour les établissements au Sénégal. Gérez élèves, présences, paiements et communication en français.',
  applicationName: 'EduSen',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  // Improves the installed (home-screen) experience on iOS Safari, which does
  // not read the web app manifest for standalone display / status bar.
  appleWebApp: {
    capable: true,
    title: 'EduSen',
    statusBarStyle: 'default',
  },
}

// theme-color tints the mobile browser chrome and the installed PWA title bar.
// Matches the Senegal-green header band (primary-800) used across the app.
export const viewport: Viewport = {
  themeColor: '#054D2C',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <PWA />
        {children}
      </body>
    </html>
  )
}
