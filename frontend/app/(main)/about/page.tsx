import Image from 'next/image'
import Link from 'next/link'
import Copy from '@/lib/copy'
import { Sparkles, Trees, BadgeCheck, Heart } from 'lucide-react'

const values = [
  { icon: Sparkles, title: 'Curated Excellence', description: 'Every property we list is personally verified. We visit, we stay, we approve. No shortcuts, no compromises.' },
  { icon: Trees, title: 'Rooted in Nature', description: 'We believe earthy and nature are not opposites. Our properties blend comfort with the raw beauty of India.' },
  { icon: BadgeCheck, title: 'Honest Pricing', description: 'What you see is what you pay. No hidden charges, no last-minute surprises. Just transparent, fair pricing.' },
  { icon: Heart, title: 'Guest First', description: 'Every decision we make starts with one question — is this better for our guests? That will never change.' },
]

interface TeamMember {
  name: string
  role: string
  initial: string
  image?: string
  imagePosition?: string
  description: string
}

const team: TeamMember[] = [
  {
    name: 'Megha Gupta',
    role: 'Founder',
    initial: 'M',
    image: '/team/megha.jpeg',
    description: 'Megha Gupta holds a Master’s in International Relations, International Business, and International Law, bringing a global perspective to the brand. She spent 12 years in art school and was awarded the Chitra Visharad, shaping her eye for design and detail. Inspired by her travels and unique Airbnb stays, she created Concept Stay as thoughtfully designed homes that reflect global cultures, artistic influences, heritage charm, and warm comfort.',
  },
  {
    name: 'Ajay Gupta',
    role: 'Operations',
    initial: 'A',
    image: '/team/ajay.jpeg',
    description: 'Ajay Gupta heads operations at Concept Stay, bringing over 40 years of industrial experience in manufacturing. His background builds strong systems, discipline, and efficiency across day-to-day operations. From maintenance coordination to operational planning and execution, he ensures every property is managed with consistency and reliability.',
  },
  {
    name: 'Sunita Gupta',
    role: 'Design & Cleaning Management',
    initial: 'S',
    image: '/team/sunita.jpeg',
    description: 'Sunita Gupta looks after design aesthetics, decor detailing, and cleaning management across Concept Stay. She ensures every property feels warm, well-styled, and thoughtfully arranged for guests. Her attention to detail keeps each home fresh, welcoming, and comfortable.',
  },
  {
    name: 'Pratiksha',
    role: 'Co-Host',
    initial: 'P',
    image: '/team/pratiksha.jpeg',
    description: 'Pratiksha is a friendly and dedicated co-host at Concept Stay, committed to making every stay comfortable, smooth, and memorable. With a strong focus on hospitality and guest experience, she takes care of the little details that make a big difference—from ensuring properties are well-prepared and maintained to assisting guests throughout their stay with warmth, quick communication, and thoughtful care.',
  },
  {
    name: 'Laasya Nalluri',
    role: 'Marketing & Creative Strategy',
    initial: 'L',
    image: '/team/laasya.jpeg',
    description: 'Laasya Nalluri leads marketing and brand communication, shaping Concept Stay’s digital presence through social strategy, content direction, and positioning. Her approach blends analytics with creative execution to grow visibility, storytelling, and brand engagement.',
  },
  {
    name: 'Mohammed',
    role: 'Tech Head',
    initial: 'M',
    description: 'Mohammed leads the digital experience at Concept Stay with a focus on clarity, speed, and ease of use. He built the website to reflect the brand’s warmth and heritage-inspired identity, helping guests explore properties and connect with Concept Stay seamlessly online.',
  },
  {
    name: 'Naveen Kumar BR',
    role: 'Business Advisory & Taxation',
    initial: 'N',
    description: 'Naveen Kumar BR provides strategic guidance on financial planning, business structuring, and tax matters. His expertise ensures strong oversight, compliance, and long-term stability for Concept Stay’s growth.',
  },
]

const stats = [
  { number: '5+', label: 'Properties' },
  { number: '30+', label: 'Rooms' },
  { number: '4.9', label: 'Average Rating' },
  { number: '2,000+', label: 'Happy Guests' },
]

export default function AboutPage() {
  return (
    <div style={{ backgroundColor: '#ffffff', minHeight: '100vh' }}>

      {/* Hero */}
      <div style={{
        backgroundColor: 'var(--color-bg-soft)',
        padding: 'clamp(64px, 10vw, 120px) 24px',
        textAlign: 'center'
      }}>
        <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '16px', fontWeight: '600' }}>
          Our Story
        </p>
        <h1 style={{ fontSize: 'clamp(32px, 5vw, 64px)', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '24px', lineHeight: '1.15', maxWidth: '800px', margin: '0 auto 24px' }}>
          About Concept Stay
        </h1>
        <div style={{ width: '60px', height: '2px', backgroundColor: 'var(--color-terra)', margin: '0 auto 24px' }} />
        <p style={{ fontSize: '16px', color: 'var(--color-text-secondary)', maxWidth: '620px', margin: '0 auto', lineHeight: '1.8' }}>
          Concept Stay offers warm, heritage-inspired homes designed for comfort, calm, and effortless city living. Perfect for corporate travellers, families, wedding guests, and anyone looking for a stay that feels personal, elegant, and memorable.
        </p>
      </div>

      {/* Story Section */}
      <section style={{ padding: 'clamp(64px, 8vw, 100px) 24px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '48px', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--color-terra)', fontWeight: '600', marginBottom: '16px' }}>
              About Concept Stay
            </p>
            <h2 style={{ fontSize: 'clamp(26px, 3vw, 38px)', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '24px', lineHeight: '1.2' }}>
              Heritage-inspired stays with calm and character
            </h2>
            <p style={{ fontSize: '15px', color: 'var(--color-text-secondary)', lineHeight: '1.9', marginBottom: '20px' }}>
              Concept Stay brings together the warmth of earthy living with the charm of heritage-inspired spaces. Thoughtfully designed with comfort, calm, and character, our stays offer a homely experience with a touch of quiet luxury.
            </p>
            <p style={{ fontSize: '15px', color: 'var(--color-text-secondary)', lineHeight: '1.9' }}>
              Located across well-connected neighbourhoods in Kolkata, our properties are ideal for corporate travellers, families, wedding guests, and guests visiting the city for celebrations, work, or leisure. Whether it is a short visit or an extended stay, each space is designed to feel warm, personal, and memorable.
            </p>
          </div>

          {/* Visual placeholder */}
          <div style={{
            backgroundColor: 'var(--color-bg-soft)', borderRadius: '12px',
            height: '380px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexDirection: 'column', gap: '12px'
          }}>
            <div style={{ fontSize: '64px', color: 'var(--color-terra)', fontWeight: '800', letterSpacing: '-2px' }}>ES</div>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', letterSpacing: '3px', textTransform: 'uppercase' }}>Est. 2022</p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ backgroundColor: 'var(--color-text-primary)', padding: 'clamp(48px, 6vw, 80px) 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0' }}>
          {stats.map((stat, i) => (
            <div key={stat.label} style={{
              textAlign: 'center', padding: '32px 24px',
              borderRight: i < stats.length - 1 ? '1px solid #333' : 'none'
            }}>
              <p style={{ fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: '800', color: 'var(--color-terra)', marginBottom: '8px', lineHeight: '1' }}>
                {stat.number}
              </p>
              <p style={{ fontSize: '12px', color: 'rgba(250,248,245,0.6)', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: '600' }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Values */}
      <section style={{ padding: 'clamp(64px, 8vw, 100px) 24px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '16px', fontWeight: '600' }}>
            What We Stand For
          </p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            Our Values
          </h2>
          <div style={{ width: '60px', height: '2px', backgroundColor: 'var(--color-terra)', margin: '0 auto' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
          {values.map((value, i) => (
            <div key={i} style={{
              backgroundColor: '#ffffff', border: '1px solid var(--color-border)',
              borderRadius: '12px', padding: '32px 28px'
            }}>
              <value.icon size={28} style={{ color: 'var(--color-terra)', marginBottom: '16px' }} />
              <div style={{ width: '32px', height: '2px', backgroundColor: 'var(--color-terra)', marginBottom: '16px' }} />
              <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '12px' }}>{value.title}</h3>
              <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.8' }}>{value.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Team */}
      <section style={{ backgroundColor: 'var(--color-bg-soft)', padding: 'clamp(64px, 8vw, 100px) 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '16px', fontWeight: '600' }}>
              About the Team
            </p>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '16px' }}>
              Meet the Team
            </h2>
            <div style={{ width: '60px', height: '2px', backgroundColor: 'var(--color-terra)', margin: '0 auto' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {team.map((member, i) => (
              <div key={i} style={{
                backgroundColor: '#ffffff', borderRadius: '12px',
                padding: '32px 28px', border: '1px solid var(--color-border)', textAlign: 'center'
              }}>
                {member.image ? (
                  <div style={{
                    width: '84px', height: '84px', margin: '0 auto 20px',
                    position: 'relative', borderRadius: '50%', overflow: 'hidden',
                    border: '2px solid var(--color-terra)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
                  }}>
                    <Image
                      src={member.image}
                      alt={member.name}
                      fill
                      style={{ objectFit: 'cover', objectPosition: member.imagePosition || 'top center' }}
                      unoptimized
                    />
                  </div>
                ) : (
                  <div style={{
                    width: '72px', height: '72px', backgroundColor: 'var(--color-terra)',
                    borderRadius: '50%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', margin: '0 auto 20px',
                    fontSize: '28px', fontWeight: '800', color: '#f6eddc'
                  }}>
                    {member.initial}
                  </div>
                )}
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '6px' }}>{member.name}</h3>
                <p style={{ fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-terra)', fontWeight: '600', marginBottom: '16px' }}>{member.role}</p>
                <div style={{ width: '32px', height: '2px', backgroundColor: 'var(--color-border)', margin: '0 auto 16px' }} />
                <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.7' }}>{member.description}</p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '48px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '28px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', fontWeight: '700', marginBottom: '12px' }}>
              Special Mention
            </p>
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '12px' }}>
              Uday, Gajendra, Bappa & Moumuni
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.8' }}>
              A heartfelt mention to Uday, Gajendra, Bappa, and Moumuni for the wonderful work they do in keeping our properties clean, fresh, and guest-ready. Their dedication, attention to detail, and consistent effort play a big role in creating the warm and comfortable experience that Concept Stay is known for. From maintaining spotless spaces to ensuring every corner feels cared for, their contribution helps make each stay pleasant, welcoming, and worry-free for our guests. Their hard work behind the scenes is truly valued and deeply appreciated.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(64px, 8vw, 100px) 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '16px' }}>
          Ready to find your escape?
        </h2>
        <p style={{ fontSize: '15px', color: 'var(--color-text-secondary)', marginBottom: '32px', maxWidth: '480px', margin: '0 auto 32px', lineHeight: '1.7' }}>
          {Copy.aboutCTA}
        </p>
        <Link
          href="/properties"
          style={{
            display: 'inline-block', backgroundColor: 'var(--color-terra)',
            color: '#f6eddc', padding: '18px 48px', fontSize: '13px',
            letterSpacing: '2px', fontWeight: '700', textTransform: 'uppercase',
            textDecoration: 'none', borderRadius: '8px'
          }}
        >
          Explore Properties
        </Link>
      </section>
    </div>
  )
}

