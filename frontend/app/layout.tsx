import type { Metadata } from 'next'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import Providers from './providers'
import './globals.css'
import { Figtree, Fraunces } from 'next/font/google'

const figtree = Figtree({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700', '800'], variable: '--font-figtree', display: 'swap' })
const fraunces = Fraunces({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-fraunces', display: 'swap' })

export const metadata: Metadata = {
  title: {
    default: 'Concept Stay | Unique Earthy Properties Across India',
    template: '%s | Concept Stay',
  },
  description: 'Discover and book one-of-a-kind earthy villas, cottages, and estates across India. Perfect for boutique stays, destination weddings, and corporate retreats.',
  keywords: [
    'Concept Stay',
    'ConceptStay',
    'conceptstay.in',
    'earthy properties',
    'luxury villas India',
    'heritage stays India',
    'boutique resort booking',
    'destination wedding venues India',
    'corporate retreats India',
  ],
  metadataBase: new URL('https://conceptstay.in'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: 'https://conceptstay.in',
    siteName: 'Concept Stay',
    title: 'Concept Stay | Unique Earthy Properties Across India',
    description: 'Discover and book one-of-a-kind earthy villas, cottages, and estates across India. Perfect for stays, weddings, and corporate retreats.',
    images: [
      {
        url: 'https://conceptstay.in/og-image.jpg',
        secureUrl: 'https://conceptstay.in/og-image.jpg',
        width: 1024,
        height: 1024,
        type: 'image/jpeg',
        alt: 'Concept Stay — Unique Earthy Properties Across India',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Concept Stay | Unique Earthy Properties Across India',
    description: 'Discover and book one-of-a-kind earthy villas, cottages, and estates across India. Perfect for stays, weddings, and corporate retreats.',
    images: ['https://conceptstay.in/og-image.jpg'],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Concept Stay',
  },
  icons: {
    icon: [
      { url: '/favicon.ico?v=3', sizes: 'any' },
      { url: '/icons/favicon-32x32.png?v=3', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-48x48.png?v=3', sizes: '48x48', type: 'image/png' },
      { url: '/icons/icon-192x192.png?v=3', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png?v=3', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico?v=3',
    apple: [
      { url: '/apple-touch-icon.png?v=3', sizes: '180x180', type: 'image/png' },
    ],
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': 'https://conceptstay.in/#website',
      url: 'https://conceptstay.in',
      name: 'Concept Stay',
      alternateName: ['Concept Stay', 'ConceptStay India', 'conceptstay.in'],
      description: 'Discover and book unique earthy properties across India. Boutique villas, heritage stays, wedding estates, and retreats.',
    },
    {
      '@type': 'Organization',
      '@id': 'https://conceptstay.in/#organization',
      name: 'Concept Stay',
      url: 'https://conceptstay.in',
      logo: 'https://conceptstay.in/Untitled_design-removebg-preview.png',
    },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${figtree.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body suppressHydrationWarning style={{ backgroundColor: 'var(--color-bg-page)', margin: 0, overflowX: 'hidden' }}>
        <Providers>
          <Navbar />
          <main style={{ paddingTop: '72px', minHeight: '100vh' }}>
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  )
}