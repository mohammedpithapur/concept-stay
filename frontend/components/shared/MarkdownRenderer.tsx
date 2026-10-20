'use client'

import React from 'react'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  if (!content) return null

  // Simple, safe Markdown parser that handles core formatting without external deps
  const renderFormattedText = (text: string): React.ReactNode => {
    // Split by bold (**text**)
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</em>
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            style={{
              backgroundColor: 'var(--color-bg-soft)',
              color: 'var(--color-terra)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '0.88em',
              fontFamily: 'monospace',
            }}
          >
            {part.slice(1, -1)}
          </code>
        )
      }
      if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
        const linkText = part.substring(1, part.indexOf(']('))
        const linkUrl = part.substring(part.indexOf('](') + 2, part.length - 1)
        return (
          <a
            key={i}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-terra)', textDecoration: 'underline', fontWeight: 600 }}
          >
            {linkText}
          </a>
        )
      }
      return part
    })
  }

  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: string[] = []
  let listType: 'ul' | 'ol' = 'ul'
  let inCodeBlock = false
  let codeBlockLines: string[] = []

  const flushList = () => {
    if (listItems.length > 0) {
      if (listType === 'ul') {
        elements.push(
          <ul key={`ul-${elements.length}`} style={{ paddingLeft: '24px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {listItems.map((item, idx) => (
              <li key={idx} style={{ color: 'var(--color-text-secondary)', lineHeight: '1.7', fontSize: '15px' }}>
                {renderFormattedText(item)}
              </li>
            ))}
          </ul>
        )
      } else {
        elements.push(
          <ol key={`ol-${elements.length}`} style={{ paddingLeft: '24px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {listItems.map((item, idx) => (
              <li key={idx} style={{ color: 'var(--color-text-secondary)', lineHeight: '1.7', fontSize: '15px' }}>
                {renderFormattedText(item)}
              </li>
            ))}
          </ol>
        )
      }
      listItems = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const line = rawLine.trim()

    // Code block toggle
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        elements.push(
          <pre
            key={`code-${elements.length}`}
            style={{
              backgroundColor: '#1a1611',
              color: '#e8d5a3',
              padding: '16px 20px',
              borderRadius: '10px',
              overflowX: 'auto',
              fontSize: '13px',
              lineHeight: '1.5',
              fontFamily: 'monospace',
              marginBottom: '20px',
              border: '1px solid var(--color-border)',
            }}
          >
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        )
        codeBlockLines = []
        inCodeBlock = false
      } else {
        flushList()
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine)
      continue
    }

    // Horizontal Rule
    if (line === '---' || line === '***' || line === '___') {
      flushList()
      elements.push(
        <hr key={`hr-${elements.length}`} style={{ border: 'none', height: '1px', backgroundColor: 'var(--color-border)', margin: '32px 0' }} />
      )
      continue
    }

    // Image: ![alt](url)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (imgMatch) {
      flushList()
      elements.push(
        <div key={`img-${elements.length}`} style={{ margin: '28px 0', textAlign: 'center' }}>
          <img
            src={imgMatch[2]}
            alt={imgMatch[1] || 'Article image'}
            style={{ maxWidth: '100%', maxHeight: '480px', objectFit: 'cover', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
          />
          {imgMatch[1] && (
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '8px', fontStyle: 'italic' }}>
              {imgMatch[1]}
            </p>
          )}
        </div>
      )
      continue
    }

    // Headers
    if (line.startsWith('# ')) {
      flushList()
      elements.push(
        <h1 key={`h1-${elements.length}`} style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: '32px', marginBottom: '16px', lineHeight: 1.3 }}>
          {line.slice(2)}
        </h1>
      )
      continue
    }
    if (line.startsWith('## ')) {
      flushList()
      elements.push(
        <h2 key={`h2-${elements.length}`} style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '28px', marginBottom: '14px', lineHeight: 1.35 }}>
          {line.slice(3)}
        </h2>
      )
      continue
    }
    if (line.startsWith('### ')) {
      flushList()
      elements.push(
        <h3 key={`h3-${elements.length}`} style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '24px', marginBottom: '12px', lineHeight: 1.4 }}>
          {line.slice(4)}
        </h3>
      )
      continue
    }

    // Blockquote / Tip
    if (line.startsWith('> ')) {
      flushList()
      const quoteContent = line.slice(2)
      elements.push(
        <blockquote
          key={`quote-${elements.length}`}
          style={{
            borderLeft: '3px solid var(--color-terra)',
            padding: '12px 18px',
            backgroundColor: 'var(--color-bg-card)',
            margin: '20px 0',
            borderRadius: '0 8px 8px 0',
            color: 'var(--color-text-secondary)',
            fontSize: '15px',
            lineHeight: '1.7',
            fontStyle: 'italic',
          }}
        >
          {renderFormattedText(quoteContent)}
        </blockquote>
      )
      continue
    }

    // Unordered List
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (listType !== 'ul' && listItems.length > 0) flushList()
      listType = 'ul'
      listItems.push(line.slice(2))
      continue
    }

    // Ordered List
    const olMatch = line.match(/^\d+\.\s+(.*)$/)
    if (olMatch) {
      if (listType !== 'ol' && listItems.length > 0) flushList()
      listType = 'ol'
      listItems.push(olMatch[1])
      continue
    }

    // Blank line
    if (line === '') {
      flushList()
      continue
    }

    // Standard Paragraph
    flushList()
    elements.push(
      <p key={`p-${elements.length}`} style={{ fontSize: '15px', lineHeight: '1.8', color: 'var(--color-text-secondary)', marginBottom: '18px' }}>
        {renderFormattedText(line)}
      </p>
    )
  }

  flushList()

  return (
    <div className={`markdown-body ${className}`} style={{ wordBreak: 'break-word' }}>
      {elements}
    </div>
  )
}
