'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Calendar, Clock, User, ArrowLeft, Share2, Check, Sparkles, BookOpen } from 'lucide-react'
import { getArticleBySlugOrId } from '@/lib/api'
import type { Article } from '@/lib/types'
import MarkdownRenderer from '@/components/shared/MarkdownRenderer'

export default function ArticleDetailPage() {
  const { slug } = useParams()
  const router = useRouter()
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const articleSlug = typeof slug === 'string' ? slug : Array.isArray(slug) ? slug[0] : ''

  useEffect(() => {
    if (!articleSlug) return
    const currentSlug = articleSlug
    async function loadArticle() {
      setLoading(true)
      setError(null)
      try {
        const data = await getArticleBySlugOrId(currentSlug)
        setArticle(data)
      } catch (err: unknown) {
        console.error('Failed to load article:', err)
        setError('Article not found or has been removed.')
      } finally {
        setLoading(false)
      }
    }
    loadArticle()
  }, [articleSlug])

  const handleShare = async () => {
    if (!article) return
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.excerpt || article.title,
          url,
        })
        return
      } catch {
        // User dismissed share dialog
      }
    }
    // Fallback: Copy link
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Ignore clipboard write error
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg-primary)' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            border: '3px solid var(--color-border)',
            borderTopColor: 'var(--color-terra)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            marginBottom: '16px',
          }}
        />
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading story…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error || !article) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
        <BookOpen size={48} style={{ color: 'var(--color-terra)', marginBottom: '16px', opacity: 0.8 }} />
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '10px' }}>
          Story Not Found
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px', marginBottom: '24px', maxWidth: '420px' }}>
          {error || 'The story you are looking for may have been unpublished or moved.'}
        </p>
        <Link
          href="/articles"
          style={{
            padding: '12px 24px',
            backgroundColor: 'var(--color-terra)',
            color: '#fff',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 700,
          }}
        >
          ← Back to All Stories
        </Link>
      </div>
    )
  }

  const formattedDate = new Date(article.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <article style={{ backgroundColor: '#ffffff', minHeight: '100vh', paddingBottom: '100px' }}>
      {/* Top Breadcrumb & Nav */}
      <div
        style={{
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-deep)',
          padding: '16px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '860px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/articles"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--color-text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <ArrowLeft size={16} /> All Stories
          </Link>

          <button
            onClick={handleShare}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              backgroundColor: '#ffffff',
              border: '1px solid var(--color-border)',
              borderRadius: '999px',
              color: 'var(--color-text-primary)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {copied ? <Check size={14} style={{ color: '#16a34a' }} /> : <Share2 size={14} />}
            {copied ? 'Link Copied!' : 'Share'}
          </button>
        </div>
      </div>

      {/* Hero Header */}
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 24px 32px' }}>
        {/* Tags */}
        {article.tags && article.tags.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {article.tags.map(tag => (
              <span
                key={tag}
                style={{
                  fontSize: '11px',
                  backgroundColor: 'var(--color-deep)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-terra)',
                  padding: '4px 12px',
                  borderRadius: '999px',
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Title */}
        <h1
          style={{
            fontSize: 'clamp(26px, 4.5vw, 42px)',
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            lineHeight: 1.25,
            marginBottom: '20px',
          }}
        >
          {article.title}
        </h1>

        {/* Excerpt */}
        {article.excerpt && (
          <p
            style={{
              fontSize: 'clamp(16px, 2.2vw, 19px)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.6,
              marginBottom: '28px',
              fontStyle: 'italic',
            }}
          >
            {article.excerpt}
          </p>
        )}

        {/* Author & Meta row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '20px',
            borderTop: '1px solid var(--color-border)',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-deep)',
                border: '1.5px solid var(--color-terra)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-terra)',
                fontWeight: 700,
                fontSize: '14px',
              }}
            >
              {article.author_name.charAt(0)}
            </div>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                {article.author_name}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>
                Concept Stay Journal
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Calendar size={14} style={{ color: 'var(--color-terra)' }} />
              {formattedDate}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={14} style={{ color: 'var(--color-terra)' }} />
              {article.read_time_minutes} min read
            </span>
          </div>
        </div>
      </div>

      {/* Cover Image */}
      {article.cover_image_url && (
        <div style={{ maxWidth: '1000px', margin: '0 auto 48px', padding: '0 24px' }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 'clamp(280px, 45vw, 520px)',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 16px 40px rgba(0,0,0,0.08)',
            }}
          >
            <Image
              src={article.cover_image_url}
              alt={article.title}
              fill
              style={{ objectFit: 'cover' }}
              priority
              unoptimized
            />
          </div>
        </div>
      )}

      {/* Article Content */}
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '0 24px' }}>
        <MarkdownRenderer content={article.content} />

        {/* Bottom Share & Tags */}
        <div
          style={{
            marginTop: '56px',
            paddingTop: '28px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Share this story:
            </span>
            <button
              onClick={handleShare}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: 'var(--color-terra)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {copied ? <Check size={14} /> : <Share2 size={14} />}
              {copied ? 'Link Copied!' : 'Share with Friends'}
            </button>
          </div>

          <Link
            href="/articles"
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--color-terra)',
              textDecoration: 'none',
            }}
          >
            ← Browse More Articles
          </Link>
        </div>

        {/* CTA Card */}
        <div
          style={{
            marginTop: '64px',
            backgroundColor: 'var(--color-deep)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            padding: '40px 32px',
            textAlign: 'center',
          }}
        >
          <Sparkles size={28} style={{ color: 'var(--color-terra)', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
            Experience Concept Stay Yourself
          </h3>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', maxWidth: '520px', margin: '0 auto 24px', lineHeight: 1.6 }}>
            Immerse yourself in our hand-picked sanctuaries designed for calm, connection, and slow living.
          </p>
          <Link
            href="/properties"
            style={{
              display: 'inline-block',
              padding: '14px 28px',
              backgroundColor: 'var(--color-terra)',
              color: '#f6eddc',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            Explore Our Properties
          </Link>
        </div>
      </div>
    </article>
  )
}
