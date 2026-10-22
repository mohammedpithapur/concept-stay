import { Suspense } from 'react'
import type { Metadata } from 'next'
import ExperiencesClient from './ExperiencesClient'

export const metadata: Metadata = {
  title: 'Experiences | Concept Stay',
  description: 'Local activities, food walks and journeys led by trusted local operators - book a slot on Concept Stay',
}

export default function ExperiencesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 48, textAlign: 'center' }}>Loading experiences…</div>}>
      <ExperiencesClient />
    </Suspense>
  )
}
