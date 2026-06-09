import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import PWA from '@/components/PWA'
import InstallPrompt from '@/components/InstallPrompt'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://scolatech.app'),
  title: 'ScolaTech',
  description:
    'Plateforme de gestion scolaire pour les établissements sénégalais.',
  applicationName: 'ScolaTech',
  manifest: '/manifest.json',
  openGraph: {
    title: 'ScolaTech',
    description:
      'Plateforme de gestion scolaire pour les établissements sénégalais.',
    url: 'https://scolatech.app',
    siteName: 'ScolaTech',
    locale: 'fr_SN',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'ScolaTech',
    description:
      'Plateforme de gestion scolaire pour les établissements sénégalais.',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icons/icon-maskable-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  // Improves the installed (home-screen) experience on iOS Safari, which does
  // not read the web app manifest for standalone display / status bar.
  appleWebApp: {
    capable: true,
    title: 'ScolaTech',
    statusBarStyle: 'default',
  },
}

// theme-color tints the mobile browser chrome and the installed PWA title bar.
// Matches the manifest theme_color (Senegal green).
export const viewport: Viewport = {
  themeColor: '#0F7A3F',
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
        <InstallPrompt />
      </body>
    </html>
  )
}
