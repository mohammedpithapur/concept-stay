import React, { Suspense } from 'react'
import type { Metadata } from 'next'
import PropertiesClient from './PropertiesClient'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Property | Concept Stay',
  description: 'A hand-picked property - book now on Concept Stay',
  openGraph: {
    title: 'Property | Concept Stay',
    description: 'A hand-picked property - book now on Concept Stay',
    url: 'https://conceptstay.in/properties',
    siteName: 'Concept Stay',
    type: 'website',
    images: [
      {
        url: 'https://conceptstay.in/og-image.jpg',
        secureUrl: 'https://conceptstay.in/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Concept Stay Properties',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Property | Concept Stay',
    description: 'A hand-picked property - book now on Concept Stay',
    images: ['https://conceptstay.in/og-image.jpg'],
  },
}

export default function PropertiesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 48, textAlign: 'center' }}>Loading properties…</div>}>
      <PropertiesClient />
    </Suspense>
  )
}
