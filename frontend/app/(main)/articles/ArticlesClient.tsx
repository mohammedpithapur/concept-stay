'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Search, Clock, Calendar, BookOpen, ArrowRight, Tag } from 'lucide-react'
import { listPublicArticles } from '@/lib/api'
import type { Article } from '@/lib/types'

export default function ArticlesClient() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState<string>('All')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadArticles() {
      setLoading(true)
      setError(null)
      try {
        const res = await listPublicArticles({ limit: 30 })
        setArticles(res.items || [])
      } catch (err: unknown) {
        console.error('Failed to load articles:', err)
        setError('Unable to load articles right now. Please check back shortly.')
      } finally {
        setLoading(false)
      }
    }
    loadArticles()
  }, [])

  // Collect unique tags
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>()
    articles.forEach(a => (a.tags || []).forEach(t => tagsSet.add(t)))
    return ['All', ...Array.from(tagsSet)]
  }, [articles])

  // Filter articles
  const filteredArticles = useMemo(() => {
    return articles.filter(a => {
      const matchSearch =
        !search.trim() ||
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        (a.excerpt && a.excerpt.toLowerCase().includes(search.toLowerCase()))
      const matchTag = selectedTag === 'All' || (a.tags || []).includes(selectedTag)
      return matchSearch && matchTag
    })
  }, [articles, search, selectedTag])

  return (
    <div style={{ backgroundColor: 'var(--color-bg-primary)', minHeight: '100vh', paddingBottom: '80px' }}>
      {/* Hero Header */}
      <section className="surface-deep"
        style={{
          backgroundColor: 'var(--color-deep)',
          borderBottom: '1px solid var(--color-border)',
          padding: '64px 24px 56px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <span
            style={{
              fontSize: '11px',
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: 'var(--color-terra)',
              fontWeight: 700,
              display: 'inline-block',
              marginBottom: '12px',
            }}
          >
            Journal & Travel Stories
          </span>
          <h1
            style={{
              fontSize: 'clamp(28px, 4vw, 44px)',
              fontWeight: 800,
              color: 'var(--color-text-primary)',
              lineHeight: 1.25,
              marginBottom: '16px',
            }}
          >
            Stories, Guides & Retreats
          </h1>
          <p
            style={{
              fontSize: 'clamp(14px, 2vw, 17px)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.65,
              maxWidth: '620px',
              margin: '0 auto 32px',
            }}
          >
            Curated travel inspiration, secret local getaways, mindful living, and the philosophy behind our hand-crafted stays.
          </p>

          {/* Search Bar */}
          <div
            style={{
              maxWidth: '480px',
              margin: '0 auto',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '16px',
                color: 'var(--color-text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search articles, destinations, tips…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '14px 18px 14px 44px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--color-border)',
                borderRadius: '100px',
                fontSize: '14px',
                color: 'var(--color-text-primary)',
                outline: 'none',
                boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: '14px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontSize: '16px',
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Content Container */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px 0' }}>
        {/* Tag Pills */}
        {allTags.length > 1 && (
          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '36px',
              justifyContent: 'center',
            }}
          >
            {allTags.map(tag => {
              const active = selectedTag === tag
              return (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '100px',
                    border: `1.5px solid ${active ? 'var(--color-terra)' : 'var(--color-border)'}`,
                    backgroundColor: active ? 'var(--color-brand)' : '#ffffff',
                    color: active ? '#ffffff' : 'var(--color-text-secondary)',
                    fontSize: '13px',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                border: '3px solid var(--color-border)',
                borderTopColor: 'var(--color-terra)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 16px',
              }}
            />
            <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading stories…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              backgroundColor: '#fff',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              maxWidth: '500px',
              margin: '0 auto',
            }}
          >
            <p style={{ color: '#C62828', fontSize: '14px', marginBottom: '16px' }}>{error}</p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                backgroundColor: 'var(--color-brand)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredArticles.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '80px 20px',
              backgroundColor: '#ffffff',
              border: '1px solid var(--color-border)',
              borderRadius: '16px',
              maxWidth: '600px',
              margin: '0 auto',
            }}
          >
            <BookOpen size={48} style={{ color: 'var(--color-terra)', margin: '0 auto 16px', opacity: 0.8 }} />
            <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              No Articles Found
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
              {search || selectedTag !== 'All'
                ? 'No articles match your current search or tag filters.'
                : 'Our travel journal is being updated with inspiring stories. Check back very soon!'}
            </p>
            {(search || selectedTag !== 'All') && (
              <button
                onClick={() => {
                  setSearch('')
                  setSelectedTag('All')
                }}
                style={{
                  padding: '10px 22px',
                  backgroundColor: 'var(--color-brand)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '100px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        )}

        {/* Articles Grid */}
        {!loading && !error && filteredArticles.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: '32px',
            }}
          >
            {filteredArticles.map(article => {
              const formattedDate = new Date(article.created_at).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })

              return (
                <article
                  key={article.id}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--color-border)',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-4px)'
                    e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.08)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.04)'
                  }}
                >
                  {/* Cover Image */}
                  <Link
                    href={`/articles/${article.slug}`}
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '220px',
                      display: 'block',
                      backgroundColor: 'var(--color-bg-soft)',
                      overflow: 'hidden',
                    }}
                  >
                    {article.cover_image_url ? (
                      <Image
                        src={article.cover_image_url}
                        alt={article.title}
                        fill
                        style={{ objectFit: 'cover' }}
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        unoptimized
                      />
                    ) : (
                      <div className="surface-deep"
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'var(--color-deep)',
                          color: 'var(--color-terra)',
                        }}
                      >
                        <BookOpen size={44} opacity={0.6} />
                      </div>
                    )}
                  </Link>

                  {/* Body */}
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    {/* Meta info */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        fontSize: '12px',
                        color: 'var(--color-text-muted)',
                        marginBottom: '12px',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={13} style={{ color: 'var(--color-terra)' }} />
                        {formattedDate}
                      </span>
                      <span>•</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={13} style={{ color: 'var(--color-terra)' }} />
                        {article.read_time_minutes} min read
                      </span>
                    </div>

                    {/* Title */}
                    <Link
                      href={`/articles/${article.slug}`}
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <h2
                        style={{
                          fontSize: '19px',
                          fontWeight: 700,
                          color: 'var(--color-text-primary)',
                          lineHeight: 1.35,
                          marginBottom: '10px',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {article.title}
                      </h2>
                    </Link>

                    {/* Excerpt */}
                    {article.excerpt && (
                      <p
                        style={{
                          fontSize: '14px',
                          color: 'var(--color-text-secondary)',
                          lineHeight: 1.6,
                          marginBottom: '18px',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          flex: 1,
                        }}
                      >
                        {article.excerpt}
                      </p>
                    )}

                    {/* Tags */}
                    {article.tags && article.tags.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          gap: '6px',
                          flexWrap: 'wrap',
                          marginBottom: '20px',
                        }}
                      >
                        {article.tags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            style={{
                              fontSize: '11px',
                              backgroundColor: 'var(--color-bg-card)',
                              border: '1px solid var(--color-border)',
                              color: 'var(--color-text-secondary)',
                              padding: '3px 9px',
                              borderRadius: '999px',
                              fontWeight: 600,
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer / Read Link */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '16px',
                        borderTop: '1px solid var(--color-border)',
                        marginTop: 'auto',
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                        By {article.author_name}
                      </span>
                      <Link
                        href={`/articles/${article.slug}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '13px',
                          fontWeight: 700,
                          color: 'var(--color-terra)',
                          textDecoration: 'none',
                        }}
                      >
                        Read Story <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
