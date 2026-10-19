import { Suspense } from 'react'
import ArticlesClient from './ArticlesClient'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Journal & Stories | Concept Stay',
  description: 'Read the latest travel stories, destination guides, mindful living tips, and architectural inspirations from Concept Stay.',
}

export default function ArticlesPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading stories…</div>}>
      <ArticlesClient />
    </Suspense>
  )
}
