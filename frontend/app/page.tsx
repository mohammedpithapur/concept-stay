import Hero from '@/components/layout/Hero'
import CategoryStrip from '@/components/property/CategoryStrip'
import FeaturedProperties from '@/components/property/FeaturedProperties'
import CTASection from '@/components/layout/CTASection'
import WhyChooseUs from '@/components/layout/WhyChooseUs'
import SecurityPayment from '@/components/layout/SecurityPayment'

export default function Home() {
  return (
    <>
      <Hero />
      <CategoryStrip />
      <FeaturedProperties />
      <CTASection />
      <WhyChooseUs />
     
    </>
  )
}