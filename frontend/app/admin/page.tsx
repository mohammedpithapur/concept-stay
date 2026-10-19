'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import PushSubscribeButton from '@/components/shared/PushSubscribeButton'
import {
  listPropertyGroups, createPropertyGroup, updatePropertyGroup, deletePropertyGroup,
  addPropertyGroupMember, removePropertyGroupMember, updatePropertyGroupMember,
  listAdminProperties, deleteAdminProperty, duplicateAdminProperty, buildApiUrl,
  getAdminDashboard, listAdminBookings, updateAdminBookingStatus, updateAdminBookingWithRefund,
  createAdminReview, deleteAdminReview, fetchPropertyReviews,
  listICalLinks, createICalLink, deleteICalLink, syncPropertyICal, getICalExportUrl,
  listAdminEvents, updateAdminEventStatus, getAdminAnalytics,
  getAdminPayments, getAdminSettlements, getPaymentSummary,
  listAdminArticles, createAdminArticle, updateAdminArticle, deleteAdminArticle,
  type PropertyGroup, type CreateReviewPayload, type AdminBooking, type AdminDashboard, type ICalLink,
  type EventRequest, type EventStatus, type AdminAnalyticsResponse,
  type AdminPayment, type AdminPaymentList, type SettlementBatch, type PaymentSummary,
} from '@/lib/api'
import type { Property, Review, Article } from '@/lib/types'
import { Printer, Building2, Users, Calendar, Download, Share2, Plus, Trash2, Edit3, Star, Check, X, Bed, Mail, Phone, Wallet, BadgeCheck, Clock, RefreshCw, AlertTriangle, CheckCircle, XCircle, CreditCard, BookOpen, Eye, FileText, Sparkles, Upload, Image as ImageIcon } from 'lucide-react'
import { uploadPropertyImage } from '@/lib/supabase/storage'
import CalendarModal from './properties/CalendarModal'
import MarkdownRenderer from '@/components/shared/MarkdownRenderer'

const BOOKINGS_PER_PAGE = 15
const E2E_SKIP_AUTH = process.env.NEXT_PUBLIC_E2E_SKIP_AUTH === '1'

const E2E_SEED_PROPERTY: Property = {
  id: 'e2e-seed-property',
  name: 'Seed Property',
  description: 'Seed property used by Playwright tests',
  price_per_night: 12500,
  cleaning_fee: 1500,
  max_guests: 4,
  bedrooms: 2,
  bathrooms: 1,
  bathrooms_detail: [],
  spaces_detail: [],
  city: 'Goa',
  state: 'Goa',
  country: 'India',
  latitude: 15.2993,
  longitude: 74.124,
  is_published: true,
  min_nights: 1,
  pets_allowed: false,
  pet_charge_per_night: 0,
  images: [],
  amenities: [],
  avg_rating: 4.8,
  review_count: 12,
  created_at: '2026-05-31T00:00:00.000Z',
  address: 'Test Address',
  contact_phone: '9999999999',
  contact_email: 'test@example.com',
  check_in_time: '2:00 PM',
  check_out_time: '11:00 AM',
  house_rules: [],
}

const statusColors: Record<string, { bg: string, color: string }> = {
  confirmed: { bg: '#E8F5E9', color: '#2E7D32' },
  pending: { bg: '#FFF8E7', color: '#F57F17' },
  completed: { bg: '#E3F2FD', color: '#1565C0' },
  cancelled: { bg: '#FFEBEE', color: '#C62828' },
}

export default function AdminPage() {
  const router = useRouter()
  const { user, loading } = useRequireAuth({ requireAdmin: true })
  const { fetchWithAuth, accessToken } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')

  // ── Dashboard stats ───────────────────────────────────────────────────────
  const [dashStats, setDashStats] = useState<AdminDashboard | null>(null)

  // ── Analytics state ───────────────────────────────────────────────────────
  const [analyticsData, setAnalyticsData] = useState<AdminAnalyticsResponse | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [timeframeMode, setTimeframeMode] = useState<'daily' | 'monthly'>('monthly')
  const [metricMode, setMetricMode] = useState<'revenue' | 'bookings' | 'nights'>('revenue')

  // ── Bookings state ────────────────────────────────────────────────────────
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [bookingsTotal, setBookingsTotal] = useState(0)
  const [bookingsPage, setBookingsPage] = useState(1)
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [searchBooking, setSearchBooking] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [voucherBooking, setVoucherBooking] = useState<AdminBooking | null>(null)
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null)

  // ── Groups state ──────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<PropertyGroup[]>([])
  const [apiProperties, setApiProperties] = useState<Property[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [addingMemberGroupId, setAddingMemberGroupId] = useState<string | null>(null)
  const [memberPropertyId, setMemberPropertyId] = useState('')
  const [memberIsWhole, setMemberIsWhole] = useState(false)
  const [groupError, setGroupError] = useState('')
  const [groupSuccess, setGroupSuccess] = useState('')

  // ── Reviews state ─────────────────────────────────────────────────────────
  const [reviewProperty, setReviewProperty] = useState<{ id: string; name: string } | null>(null)
  const [propertyReviews, setPropertyReviews] = useState<Review[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null)
  const [editReviewForm, setEditReviewForm] = useState<{ guest_name: string; rating: number; comment: string; platform: string }>({ guest_name: '', rating: 5, comment: '', platform: '' })
  const [newReview, setNewReview] = useState({ guest_name: '', rating: 5, comment: '', platform: '' })
  const [addingReview, setAddingReview] = useState(false)
  const [reviewModalError, setReviewModalError] = useState('')

  // ── iCal state ────────────────────────────────────────────────────────────
  const [icalLinks, setIcalLinks] = useState<Record<string, ICalLink[]>>({})
  const [icalInputs, setIcalInputs] = useState<Record<string, { name: string; url: string }>>({})
  const [icalSaving, setIcalSaving] = useState<Record<string, boolean>>({})
  const [icalCopied, setIcalCopied] = useState<Record<string, boolean>>({})

  // ── Events state ──────────────────────────────────────────────────────────
  const [events, setEvents] = useState<EventRequest[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsSearch, setEventsSearch] = useState('')
  const [eventsStatusFilter, setEventsStatusFilter] = useState('')
  const eventsSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Payments & Settlements state ──────────────────────────────────────────
  const [paymentsData, setPaymentsData] = useState<AdminPaymentList | null>(null)
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null)
  const [settlements, setSettlements] = useState<SettlementBatch[]>([])
  const [settlementsLoading, setSettlementsLoading] = useState(false)
  const [paymentsSearch, setPaymentsSearch] = useState('')
  const [paymentsStatusFilter, setPaymentsStatusFilter] = useState('')
  const [paymentsPage, setPaymentsPage] = useState(1)

  // ── Calendar / date-blocking state ───────────────────────────────────────
  const [calendarProperty, setCalendarProperty] = useState<{ id: string; name: string } | null>(null)

  // ── Featured property toggle state ───────────────────────────────────────
  const [featuredLoading, setFeaturedLoading] = useState<Record<string, boolean>>({})

  // ── Confirmation Modal state ─────────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    subtitle?: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    isDanger?: boolean
    onConfirm?: () => Promise<void> | void
    isNoticeOnly?: boolean
    noticeActionLabel?: string
    onNoticeAction?: () => void
  }>({
    isOpen: false,
    title: '',
  })

  // ── Load bookings ─────────────────────────────────────────────────────────
  const loadBookings = useCallback(async (page = 1, search = '', status = '') => {
    if (loading || !user) return
    setBookingsLoading(true)
    try {
      const data = await listAdminBookings(
        { search: search || undefined, status: status || undefined, page, limit: BOOKINGS_PER_PAGE },
        fetchWithAuth,
      )
      setBookings(data.items)
      setBookingsTotal(data.total)
      setBookingsPage(data.page)
    } catch { /* noop */ } finally {
      setBookingsLoading(false)
    }
  }, [fetchWithAuth, loading, user])

  // ── Load dashboard stats ──────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    if (loading || !user) return
    try {
      const [stats, props] = await Promise.all([
        getAdminDashboard(fetchWithAuth),
        listAdminProperties(fetchWithAuth),
      ])
      setDashStats(stats)
      setApiProperties(props)
    } catch { /* noop */ }
  }, [fetchWithAuth, loading, user])

  // ── Load groups ───────────────────────────────────────────────────────────
  const loadGroups = useCallback(async () => {
    if (loading || !user) return
    setGroupsLoading(true)
    try {
      const [gs, props] = await Promise.all([
        listPropertyGroups(fetchWithAuth),
        listAdminProperties(fetchWithAuth),
      ])
      setGroups(gs)
      setApiProperties(props)
    } catch {
      setGroupError('Failed to load groups')
    } finally {
      setGroupsLoading(false)
    }
  }, [fetchWithAuth, loading, user])

  // ── Load iCal links for a property ───────────────────────────────────────
  const loadIcalLinks = useCallback(async (propertyId: string) => {
    try {
      const links = await listICalLinks(propertyId, fetchWithAuth)
      setIcalLinks(prev => ({ ...prev, [propertyId]: links }))
    } catch { /* noop */ }
  }, [fetchWithAuth])

  // ── Load event requests ───────────────────────────────────────────────────
  const loadEvents = useCallback(async (search = '', status = '') => {
    if (loading || !user) return
    setEventsLoading(true)
    try {
      const data = await listAdminEvents(fetchWithAuth, status || undefined, search || undefined)
      setEvents(data)
    } catch { /* noop */ }
    finally { setEventsLoading(false) }
  }, [fetchWithAuth, loading, user])

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    try {
      const data = await getAdminAnalytics(fetchWithAuth)
      setAnalyticsData(data)
    } catch { /* noop */ }
    finally { setAnalyticsLoading(false) }
  }, [fetchWithAuth])

  const loadPayments = useCallback(async (page = 1, search = '', status = '') => {
    if (loading || !user) return
    setPaymentsLoading(true)
    setSettlementsLoading(true)
    try {
      const [pmts, summary, sett] = await Promise.all([
        getAdminPayments(fetchWithAuth, { page, search: search || undefined, status: status || undefined, limit: 20 }),
        getPaymentSummary(fetchWithAuth),
        getAdminSettlements(fetchWithAuth),
      ])
      setPaymentsData(pmts)
      setPaymentSummary(summary)
      setSettlements(sett.settlements || [])
    } catch { /* noop */ }
    finally { setPaymentsLoading(false); setSettlementsLoading(false) }
  }, [fetchWithAuth, loading, user])

  // ── Articles state ────────────────────────────────────────────────────────
  const [adminArticles, setAdminArticles] = useState<Article[]>([])
  const [articlesTotal, setArticlesTotal] = useState(0)
  const [articlesPage, setArticlesPage] = useState(1)
  const [articlesLoading, setArticlesLoading] = useState(false)
  const [searchArticle, setSearchArticle] = useState('')
  const [isArticleModalOpen, setIsArticleModalOpen] = useState(false)
  const [editingArticle, setEditingArticle] = useState<Article | null>(null)
  const [articleForm, setArticleForm] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    cover_image_url: '',
    author_name: 'Concept Stay Team',
    read_time_minutes: 3,
    tags: '',
    is_published: true,
  })
  const [articleSaving, setArticleSaving] = useState(false)
  const [articleError, setArticleError] = useState<string | null>(null)
  const [articleSuccess, setArticleSuccess] = useState<string | null>(null)
  const [articleEditorTab, setArticleEditorTab] = useState<'write' | 'preview'>('write')
  const [coverUploading, setCoverUploading] = useState(false)
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null)
  const articleFileInputRef = useRef<HTMLInputElement>(null)

  const handleCoverFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverUploading(true)
    setCoverUploadError(null)
    try {
      const publicUrl = await uploadPropertyImage(file, undefined, fetchWithAuth)
      setArticleForm(f => ({ ...f, cover_image_url: publicUrl }))
    } catch (err: unknown) {
      console.error('Failed to upload article cover image:', err)
      setCoverUploadError(err instanceof Error ? err.message : 'Failed to upload image')
    } finally {
      setCoverUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  const loadArticles = useCallback(async (page = 1, search = '') => {
    if (loading || !user) return
    setArticlesLoading(true)
    try {
      const data = await listAdminArticles(fetchWithAuth, { page, limit: 20, search: search || undefined })
      setAdminArticles(data.items || [])
      setArticlesTotal(data.total || 0)
      setArticlesPage(page)
    } catch {
      // ignore
    } finally {
      setArticlesLoading(false)
    }
  }, [fetchWithAuth, loading, user])

  const openNewArticleModal = () => {
    setEditingArticle(null)
    setArticleForm({
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      cover_image_url: '',
      author_name: 'Concept Stay Team',
      read_time_minutes: 3,
      tags: '',
      is_published: true,
    })
    setArticleError(null)
    setArticleSuccess(null)
    setCoverUploadError(null)
    setCoverUploading(false)
    setArticleEditorTab('write')
    setIsArticleModalOpen(true)
  }

  const openEditArticleModal = (art: Article) => {
    setEditingArticle(art)
    setArticleForm({
      title: art.title,
      slug: art.slug,
      excerpt: art.excerpt || '',
      content: art.content,
      cover_image_url: art.cover_image_url || '',
      author_name: art.author_name || 'Concept Stay Team',
      read_time_minutes: art.read_time_minutes || 3,
      tags: (art.tags || []).join(', '),
      is_published: art.is_published,
    })
    setArticleError(null)
    setArticleSuccess(null)
    setCoverUploadError(null)
    setCoverUploading(false)
    setArticleEditorTab('write')
    setIsArticleModalOpen(true)
  }

  const handleSaveArticle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!articleForm.title.trim()) { setArticleError('Title is required'); return }
    if (!articleForm.content.trim()) { setArticleError('Content is required'); return }

    setArticleSaving(true)
    setArticleError(null)
    try {
      const tagsList = articleForm.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)

      const payload = {
        title: articleForm.title.trim(),
        slug: articleForm.slug.trim() || undefined,
        excerpt: articleForm.excerpt.trim() || undefined,
        content: articleForm.content,
        cover_image_url: articleForm.cover_image_url.trim() ? articleForm.cover_image_url.trim() : null,
        author_name: articleForm.author_name.trim() || 'Concept Stay Team',
        read_time_minutes: Number(articleForm.read_time_minutes) || 3,
        tags: tagsList,
        is_published: articleForm.is_published,
      }

      if (editingArticle) {
        await updateAdminArticle(fetchWithAuth, editingArticle.id, payload)
        setArticleSuccess('Article updated successfully!')
      } else {
        await createAdminArticle(fetchWithAuth, payload)
        setArticleSuccess('Article created successfully!')
      }

      await loadArticles(1, searchArticle)
      setTimeout(() => {
        setIsArticleModalOpen(false)
      }, 900)
    } catch (err: unknown) {
      setArticleError(err instanceof Error ? err.message : 'Failed to save article')
    } finally {
      setArticleSaving(false)
    }
  }

  const handleDeleteArticle = async (articleId: string, title: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Article',
      subtitle: `Are you sure you want to delete "${title}"?`,
      description: 'This will permanently remove this article from the database and public blog.',
      confirmLabel: 'Delete Article',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteAdminArticle(fetchWithAuth, articleId)
          await loadArticles(articlesPage, searchArticle)
        } catch {
          alert('Failed to delete article')
        }
      },
    })
  }

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    const textarea = document.getElementById('article-content-textarea') as HTMLTextAreaElement | null
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentText = articleForm.content
    const selectedText = currentText.substring(start, end) || 'text'
    const newText = currentText.substring(0, start) + prefix + selectedText + suffix + currentText.substring(end)
    setArticleForm(prev => ({ ...prev, content: newText }))
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length)
    }, 50)
  }

  // ── Effects: load data when tab changes ──────────────────────────────────
  useEffect(() => {
    if (activeTab === 'overview') { void loadDashboard(); void loadBookings(1, '', '') }
    if (activeTab === 'analytics') { void loadAnalytics() }
    if (activeTab === 'bookings') { void loadBookings(1, searchBooking, statusFilter) }
    if (activeTab === 'groups')   { void loadGroups() }
    if (activeTab === 'properties') {
      listAdminProperties(fetchWithAuth).then(setApiProperties).catch(() => {})
      listPropertyGroups(fetchWithAuth).then(setGroups).catch(() => {})
    }
    if (activeTab === 'ical') {
      listAdminProperties(fetchWithAuth).then(props => {
        setApiProperties(props)
        props.forEach(p => loadIcalLinks(p.id))
      }).catch(() => {})
    }
    if (activeTab === 'events') {
      void loadEvents(eventsSearch, eventsStatusFilter)
    }
    if (activeTab === 'payments') {
      void loadPayments(1, paymentsSearch, paymentsStatusFilter)
    }
    if (activeTab === 'articles') {
      void loadArticles(1, searchArticle)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // ── Loading guard — must come AFTER all hooks ──────────────────────────────
  if (loading || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--color-gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const totalRevenue = dashStats?.total_revenue ?? 0
  const confirmedBookings = dashStats?.confirmed_bookings ?? (dashStats ? Math.max(0, (dashStats.total_bookings || 0) - (dashStats.pending_bookings || 0)) : 0)
  const pendingBookings = dashStats?.pending_bookings ?? 0
  const completedBookings = dashStats?.completed_bookings ?? 0
  const totalBookingsCount = dashStats?.total_bookings ?? 0

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })



  const handleUpdateBookingStatus = async (id: string, status: string) => {
    try {
      const updated = await updateAdminBookingStatus(id, status, fetchWithAuth)
      setBookings(prev => prev.map(b => b.id === id ? updated : b))
    } catch { /* noop */ }
  }

  const handleCancelWithRefund = (booking: AdminBooking) => {
    const isPaid = (booking as AdminBooking & { payment_status?: string }).payment_status === 'paid'
    setConfirmModal({
      isOpen: true,
      title: 'Cancel Booking',
      subtitle: `Cancel booking ${booking.booking_ref}?`,
      description: isPaid
        ? `This will cancel the booking and issue a full refund of ₹${booking.total.toLocaleString('en-IN')} to the guest.`
        : 'This action will cancel the booking.',
      confirmLabel: 'Cancel Booking',
      cancelLabel: 'Keep Booking',
      isDanger: true,
      onConfirm: async () => {
        try {
          const updated = await updateAdminBookingWithRefund(booking.id, 'cancelled', undefined, fetchWithAuth)
          setBookings(prev => prev.map(b => b.id === booking.id ? updated : b))
        } catch (e) {
          setConfirmModal({
            isOpen: true,
            title: 'Cancellation Failed',
            subtitle: (e as Error).message || 'Failed to cancel booking.',
            isNoticeOnly: true,
            noticeActionLabel: 'OK',
          })
        }
      }
    })
  }

  const handleDeleteProperty = (propertyId: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Property',
      subtitle: `Are you sure you want to delete "${name}"?`,
      description: 'This action will permanently remove the property listing. This cannot be undone.',
      confirmLabel: 'Delete Property',
      cancelLabel: 'Cancel',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteAdminProperty(propertyId, fetchWithAuth)
          setApiProperties(prev => prev.filter(p => p.id !== propertyId))
        } catch {
          setConfirmModal({
            isOpen: true,
            title: 'Delete Failed',
            subtitle: 'Failed to delete property.',
            isNoticeOnly: true,
            noticeActionLabel: 'OK',
          })
        }
      }
    })
  }

  const handleToggleFeatured = async (propertyId: string, currentFeatured: boolean) => {
    setFeaturedLoading(prev => ({ ...prev, [propertyId]: true }))
    try {
      const res = await fetchWithAuth(buildApiUrl(`/admin/properties/${propertyId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_featured: !currentFeatured }),
      })
      if (!res.ok) throw new Error('Failed to update featured status')
      setApiProperties(prev => prev.map(p => p.id === propertyId ? { ...p, is_featured: !currentFeatured } : p))
    } catch {
      // noop — will revert on next reload
    } finally {
      setFeaturedLoading(prev => ({ ...prev, [propertyId]: false }))
    }
  }

  const handleIcalSync = async (propertyId: string) => {
    const input = icalInputs[propertyId]
    if (!input?.url?.trim()) return
    setIcalSaving(prev => ({ ...prev, [propertyId]: true }))
    try {
      await createICalLink(propertyId, {
        calendar_name: input.name.trim() || 'Import',
        ical_url: input.url.trim(),
        direction: 'import',
      }, fetchWithAuth)
      setIcalInputs(prev => ({ ...prev, [propertyId]: { name: '', url: '' } }))
      await loadIcalLinks(propertyId)
    } catch { /* noop */ } finally {
      setIcalSaving(prev => ({ ...prev, [propertyId]: false }))
    }
  }

  const handleManualSync = async (propertyId: string) => {
    setIcalSaving(prev => ({ ...prev, [propertyId]: true }))
    try {
      await syncPropertyICal(propertyId, fetchWithAuth)
      await loadIcalLinks(propertyId)
    } catch { /* noop */ } finally {
      setIcalSaving(prev => ({ ...prev, [propertyId]: false }))
    }
  }

  const handleIcalDelete = async (propertyId: string, linkId: string) => {
    try {
      await deleteICalLink(linkId, fetchWithAuth)
      setIcalLinks(prev => ({ ...prev, [propertyId]: (prev[propertyId] || []).filter(l => l.id !== linkId) }))
    } catch { /* noop */ }
  }

  const handleCopyIcal = (propertyId: string, url: string) => {
    navigator.clipboard.writeText(url)
    setIcalCopied(prev => ({ ...prev, [propertyId]: true }))
    setTimeout(() => setIcalCopied(prev => ({ ...prev, [propertyId]: false })), 2000)
  }

  // Debounced search for bookings
  const handleBookingSearch = (value: string) => {
    setSearchBooking(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadBookings(1, value, statusFilter), 400)
  }

  const handleAdminDownloadPDF = async (ref: string) => {
    const element = document.getElementById('admin-voucher-content')
    if (!element) return
    const btns = element.querySelectorAll<HTMLElement>('button')
    btns.forEach(b => { b.style.display = 'none' })
    try {
      const html2canvas = (await import('html2canvas')).default
      const jsPDF = (await import('jspdf')).default
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdfWidth = 148
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfWidth, pdfHeight] })
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      pdf.save(`voucher-${ref}.pdf`)
    } catch (err) {
      console.error('PDF download error:', err)
    } finally {
      btns.forEach(b => { b.style.display = '' })
    }
  }

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value)
    void loadBookings(1, searchBooking, value)
  }

  // Debounced search for event requests
  const handleEventsSearch = (value: string) => {
    setEventsSearch(value)
    if (eventsSearchTimer.current) clearTimeout(eventsSearchTimer.current)
    eventsSearchTimer.current = setTimeout(() => loadEvents(value, eventsStatusFilter), 400)
  }

  const handleEventsStatusFilter = (value: string) => {
    setEventsStatusFilter(value)
    void loadEvents(eventsSearch, value)
  }

  const handleUpdateEventStatus = async (id: string, status: EventStatus) => {
    try {
      const updated = await updateAdminEventStatus(id, status, fetchWithAuth)
      setEvents(prev => prev.map(ev => ev.id === id ? updated : ev))
    } catch { alert('Failed to update event status') }
  }

  const getProperty = (id: string) => apiProperties.find(p => p.id === id)
  const propertiesForDisplay = apiProperties.length > 0
    ? apiProperties
    : (E2E_SKIP_AUTH ? [E2E_SEED_PROPERTY] : [])

  const renderBookingCard = (booking: AdminBooking, showActions = false) => {
    const property = getProperty(booking.property_id)
    if (!property) return null
    const isExpanded = expandedBookingId === booking.id
    const toggle = () => setExpandedBookingId(isExpanded ? null : booking.id)

    return (
      <div key={booking.id} style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
        {/* Summary row — always visible, click to toggle */}
        <div
          onClick={toggle}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer', gap: '10px' }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: '13px', color: 'var(--color-gold)', fontWeight: '800', marginBottom: '2px' }}>{booking.booking_ref}</p>
            <p style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: '600', marginBottom: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{booking.guest_name}</p>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{property.name}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <span style={{ backgroundColor: statusColors[booking.status]?.bg, color: statusColors[booking.status]?.color, padding: '4px 8px', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', borderRadius: '999px' }}>
              {booking.status}
            </span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)' }}>&#8377;{booking.total.toLocaleString('en-IN')}</span>
            <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: 1 }}>{isExpanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div style={{ borderTop: '1px solid var(--color-border)', padding: '14px 16px', backgroundColor: 'var(--color-bg-card)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', marginBottom: '12px' }}>
              {[
                { label: 'Check In', value: formatDate(booking.check_in) },
                { label: 'Check Out', value: formatDate(booking.check_out) },
                { label: 'Guests', value: `${booking.guests}${(booking.pets || 0) > 0 ? ` + ${booking.pets} pet${(booking.pets || 0) > 1 ? 's' : ''}` : ''}` },
                { label: 'Nights', value: `${booking.nights}` },
              ].map(detail => (
                <div key={detail.label} style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '8px 12px' }}>
                  <p style={{ fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', marginBottom: '2px' }}>{detail.label}</p>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '700' }}>{detail.value}</p>
                </div>
              ))}
            </div>

            {showActions && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {booking.status === 'pending' && (
                  <>
                    <button onClick={e => { e.stopPropagation(); handleUpdateBookingStatus(booking.id, 'confirmed') }} style={{ padding: '8px 12px', backgroundColor: '#E8F5E9', color: '#2E7D32', border: 'none', fontSize: '12px', cursor: 'pointer', fontWeight: '800', borderRadius: '8px' }}>
                      Confirm
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleCancelWithRefund(booking) }} style={{ padding: '8px 12px', backgroundColor: '#FFEBEE', color: '#C62828', border: 'none', fontSize: '12px', cursor: 'pointer', fontWeight: '800', borderRadius: '8px' }}>
                      {(booking as AdminBooking & { payment_status?: string }).payment_status === 'paid' ? 'Cancel + Refund' : 'Cancel'}
                    </button>
                  </>
                )}
                {booking.status === 'confirmed' && (
                  <button onClick={e => { e.stopPropagation(); handleUpdateBookingStatus(booking.id, 'completed') }} style={{ padding: '8px 12px', backgroundColor: '#E3F2FD', color: '#1565C0', border: 'none', fontSize: '12px', cursor: 'pointer', fontWeight: '800', borderRadius: '8px' }}>
                    Complete
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); setVoucherBooking(booking) }} style={{ padding: '8px 12px', backgroundColor: 'var(--color-bg-soft)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', fontSize: '12px', cursor: 'pointer', borderRadius: '8px', fontWeight: '700' }}>
                  Voucher
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }


  const loadPropertyReviews = async (propertyId: string) => {
    setReviewsLoading(true)
    setReviewModalError('')
    try {
      setPropertyReviews(await fetchPropertyReviews(propertyId))
    } catch { 
      setReviewModalError('Failed to load reviews')
    } finally { 
      setReviewsLoading(false) 
    }
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return
    setGroupError('')
    try {
      const g = await createPropertyGroup(newGroupName.trim(), fetchWithAuth)
      setGroups(prev => [g, ...prev])
      setNewGroupName('')
      setGroupSuccess('Group created!')
      setTimeout(() => setGroupSuccess(''), 2500)
    } catch { setGroupError('Failed to create group') }
  }

  const handleRenameGroup = async (groupId: string) => {
    if (!editingGroupName.trim()) return
    setGroupError('')
    try {
      const updated = await updatePropertyGroup(groupId, editingGroupName.trim(), fetchWithAuth)
      setGroups(prev => prev.map(g => g.id === groupId ? updated : g))
      setEditingGroupId(null)
      setGroupSuccess('Group renamed!')
      setTimeout(() => setGroupSuccess(''), 2500)
    } catch { setGroupError('Failed to rename group') }
  }

  const handleDeleteGroup = (groupId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Group',
      subtitle: 'Delete this group?',
      description: 'Properties in this group will not be deleted.',
      confirmLabel: 'Delete Group',
      cancelLabel: 'Cancel',
      isDanger: true,
      onConfirm: async () => {
        setGroupError('')
        try {
          await deletePropertyGroup(groupId, fetchWithAuth)
          setGroups(prev => prev.filter(g => g.id !== groupId))
          if (expandedGroup === groupId) setExpandedGroup(null)
        } catch { setGroupError('Failed to delete group') }
      }
    })
  }
  const handleAddMember = async (groupId: string) => {
    if (!memberPropertyId) return
    setGroupError('')
    try {
      const updated = await addPropertyGroupMember(groupId, memberPropertyId, memberIsWhole, fetchWithAuth)
      setGroups(prev => prev.map(g => g.id === groupId ? updated : g))
      setAddingMemberGroupId(null)
      setMemberPropertyId('')
      setMemberIsWhole(false)
    } catch (e: unknown) {
      setGroupError(e instanceof Error ? e.message : 'Failed to add member')
    }
  }

  const handleRemoveMember = async (groupId: string, memberId: string) => {
    setGroupError('')
    try {
      const updated = await removePropertyGroupMember(groupId, memberId, fetchWithAuth)
      setGroups(prev => prev.map(g => g.id === groupId ? updated : g))
    } catch { setGroupError('Failed to remove member') }
  }

  const handleToggleWhole = async (groupId: string, memberId: string, current: boolean) => {
    try {
      const updated = await updatePropertyGroupMember(groupId, memberId, !current, fetchWithAuth)
      setGroups(prev => prev.map(g => g.id === groupId ? updated : g))
    } catch { setGroupError('Failed to update member') }
  }

  const handleAddReview = async (propertyId: string) => {
    if (!newReview.guest_name.trim()) return
    setAddingReview(true)
    setReviewModalError('')
    try {
      const payload: CreateReviewPayload = {
        property_id: propertyId,
        guest_name: newReview.guest_name.trim(),
        rating: newReview.rating,
        comment: newReview.comment.trim() || undefined,
        platform: newReview.platform.trim() || undefined,
      }
      await createAdminReview(payload, fetchWithAuth)
      setNewReview({ guest_name: '', rating: 5, comment: '', platform: '' })
      await loadPropertyReviews(propertyId)
      const refreshedProps = await listAdminProperties(fetchWithAuth)
      setApiProperties(refreshedProps)
    } catch { setReviewModalError('Failed to add review') }
    setAddingReview(false)
  }

  const handleUpdateReview = async (reviewId: string, propertyId: string) => {
    setReviewModalError('')
    try {
      await fetchWithAuth(buildApiUrl(`/admin/reviews/${reviewId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editReviewForm),
      })
      setEditingReviewId(null)
      await loadPropertyReviews(propertyId)
      const refreshedProps = await listAdminProperties(fetchWithAuth)
      setApiProperties(refreshedProps)
    } catch { setReviewModalError('Failed to update review') }
  }

  const handleDeleteReview = (reviewId: string, propertyId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Review',
      subtitle: 'Delete this review?',
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete Review',
      cancelLabel: 'Cancel',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteAdminReview(reviewId, fetchWithAuth)
          await loadPropertyReviews(propertyId)
          const refreshedProps = await listAdminProperties(fetchWithAuth)
          setApiProperties(refreshedProps)
        } catch { setReviewModalError('Failed to delete review') }
      }
    })
  }

  const handleDuplicateProperty = (propertyId: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Duplicate Property',
      subtitle: `Create a copy of "${name}"?`,
      description: 'A new draft listing with the same details and photos will be created.',
      confirmLabel: 'Duplicate',
      cancelLabel: 'Cancel',
      isDanger: false,
      onConfirm: async () => {
        try {
          const newProp = await duplicateAdminProperty(propertyId, fetchWithAuth)
          setApiProperties(prev => [newProp, ...prev])
          router.push(`/admin/properties?id=${newProp.id}`)
        } catch (e: unknown) {
          setConfirmModal({
            isOpen: true,
            title: 'Duplication Failed',
            subtitle: e instanceof Error ? e.message : 'Failed to duplicate property.',
            description: 'Please check your connection and try again.',
            isNoticeOnly: true,
            noticeActionLabel: 'OK',
          })
        }
      }
    })
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'analytics', label: 'Reports & Analytics' },
    { id: 'bookings', label: 'Bookings' },
    { id: 'payments', label: 'Payments' },
    { id: 'properties', label: 'Properties' },
    { id: 'groups', label: 'Groups' },
    { id: 'ical', label: 'iCal Sync' },
    { id: 'events', label: 'Events' },
    { id: 'articles', label: 'Articles / Blog' },
  ]

  const cardStyle = { backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }
  const buttonStyle = {
    border: '1px solid var(--color-gold)',
    backgroundColor: '#ffffff',
    color: 'var(--color-text-primary)',
    padding: '10px 20px',
    fontSize: '13px',
    fontWeight: '700' as const,
    letterSpacing: '1px',
    borderRadius: '8px',
    cursor: 'pointer',
    textTransform: 'uppercase' as const,
  }
  const primaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: 'var(--color-gold)',
  }

  // Show spinner while checking session / redirecting
  if (loading || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--color-gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: '#ffffff', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ backgroundColor: 'var(--color-navbar)', padding: '32px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <p style={{ color: 'var(--color-gold)', fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '600' }}>Admin Panel</p>
            <h1 style={{ color: 'var(--color-text-primary)', fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: '800' }}>
              Concept Stay Dashboard
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <PushSubscribeButton token={accessToken} showTestButton={true} />
            <button onClick={() => router.push('/')} style={buttonStyle} onMouseEnter={e => { const target = e.currentTarget as HTMLButtonElement; target.style.borderColor = 'var(--color-gold)'; target.style.color = 'var(--color-gold)' }} onMouseLeave={e => { const target = e.currentTarget as HTMLButtonElement; target.style.borderColor = 'var(--color-gold)'; target.style.color = 'var(--color-text-primary)' }}>
              View Site
            </button>
            <Link href="/admin/properties" style={{ ...primaryButtonStyle, display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
              + Add Property
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'flex', overflowX: 'auto' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '16px 24px',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--color-gold)' : '2px solid transparent',
                backgroundColor: 'transparent',
                color: activeTab === tab.id ? 'var(--color-gold)' : 'var(--color-text-muted)',
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? '700' : '500',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '40px' }}>
              {[
                { label: 'Total Revenue', value: `&#8377;${totalRevenue.toLocaleString('en-IN')}`, color: 'var(--color-gold)' },
                { label: 'Confirmed Bookings', value: confirmedBookings, color: '#2E7D32' },
                { label: 'Pending Bookings', value: pendingBookings, color: '#F57F17' },
                { label: 'Total Properties', value: dashStats?.total_properties ?? apiProperties.length, color: '#1565C0' },
                { label: 'Completed Stays', value: completedBookings, color: '#6A1B9A' },
                { label: 'Total Bookings', value: totalBookingsCount, color: '#00838F' },
              ].map(stat => (
                <div key={stat.label} style={cardStyle}>
                  <p style={{ fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '12px', fontWeight: '600' }}>{stat.label}</p>
                  <p style={{ fontSize: '32px', color: stat.color, fontWeight: '800' }}
                    dangerouslySetInnerHTML={{ __html: String(stat.value) }}
                  />
                </div>
              ))}
            </div>

            {/* Recent Bookings */}
            <div style={{ ...cardStyle, marginBottom: '16px', boxShadow: '0 8px 24px rgba(26,26,26,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Recent Bookings</h2>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Latest confirmed and pending stays at a glance</p>
                </div>
                <button onClick={() => setActiveTab('bookings')} style={{ background: 'none', border: 'none', color: 'var(--color-gold)', fontSize: '13px', cursor: 'pointer', fontWeight: '700' }}>
                  View All →
                </button>
              </div>
              <div className="hidden md:block" style={{ overflowX: 'auto' }}>
                <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      {['Ref', 'Guest', 'Property', 'Dates', 'Amount', 'Status'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.slice(0, 4).map((booking, i) => {
                      const property = getProperty(booking.property_id)
                      return (
                        <tr key={booking.id} style={{ borderBottom: '1px solid var(--color-bg-soft)', backgroundColor: i % 2 === 0 ? '#ffffff' : 'var(--color-bg-card)' }}>
                          <td data-label="Ref" style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--color-gold)', fontWeight: '700' }}>{booking.booking_ref}</td>
                          <td style={{ padding: '14px 16px' }}>
                            <div className="responsive-table-label">Guest</div>
                            <p style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '700', marginBottom: '2px' }}>{booking.guest_name}</p>
                            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{booking.guest_email}</p>
                          </td>
                          <td data-label="Property" style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{property?.name}</td>
                          <td style={{ padding: '14px 16px' }}>
                            <div className="responsive-table-label">Dates</div>
                            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{formatDate(booking.check_in)}</p>
                            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>to {formatDate(booking.check_out)}</p>
                          </td>
                          <td data-label="Amount" style={{ padding: '14px 16px', fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: '700' }}>&#8377;{booking.total.toLocaleString('en-IN')}</td>
                          <td style={{ padding: '14px 16px' }}>
                            <div className="responsive-table-label">Status</div>
                            <span style={{ backgroundColor: statusColors[booking.status]?.bg, color: statusColors[booking.status]?.color, padding: '4px 10px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', borderRadius: '6px' }}>
                              {booking.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex md:hidden flex-col gap-3">
                {bookings.slice(0, 4).map(booking => renderBookingCard(booking))}
              </div>
            </div>

            {/* Properties Summary */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-text-primary)' }}>Properties</h2>
                <button onClick={() => setActiveTab('properties')} style={{ background: 'none', border: 'none', color: 'var(--color-gold)', fontSize: '13px', cursor: 'pointer', fontWeight: '700' }}>
                  Manage All →
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {(apiProperties.slice(0, 3) || []).map(property => (
                  <div key={property.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '16px', border: '1px solid var(--color-border)', borderRadius: '10px' }}>
                    {(() => {
                      const src = property.images?.find(i => i.is_primary)?.image_url || property.images?.[0]?.image_url
                      if (src && !src.startsWith('blob:')) {
                        return (
                          <Image
                            src={src}
                            alt={property.name}
                            width={64}
                            height={48}
                            unoptimized
                            style={{ width: '64px', height: '48px', objectFit: 'cover', flexShrink: 0, borderRadius: '6px' }}
                            onError={e => {
                              (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800'
                            }}
                          />
                        )
                      }
                      return (
                        <Image
                          src="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800"
                          alt={property.name}
                          width={64}
                          height={48}
                          unoptimized
                          style={{ width: '64px', height: '48px', objectFit: 'cover', flexShrink: 0, borderRadius: '6px' }}
                        />
                      )
                    })()}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: '700', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{property.name}</p>
                      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>&#8377;{property.price_per_night.toLocaleString('en-IN')}/night · <Star size={12} fill="currentColor" style={{ display: 'inline-block', verticalAlign: '-1px', color: 'var(--color-gold)' }} /> {property.avg_rating}</p>
                    </div>
                    <span style={{ fontSize: '11px', backgroundColor: '#E8F5E9', color: '#2E7D32', padding: '3px 8px', fontWeight: '700', flexShrink: 0, borderRadius: '6px' }}>Live</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Reports & Analytics Tab */}
        {activeTab === 'analytics' && (
          <div>
            {/* Header controls & Export */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Reports & Performance Analytics</h2>
                <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Financial trends, occupancy performance, and property breakdown</p>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Timeframe Mode Selector */}
                <div style={{ display: 'flex', backgroundColor: 'var(--color-bg-card)', padding: '4px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                  <button
                    onClick={() => setTimeframeMode('monthly')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: timeframeMode === 'monthly' ? 'var(--color-gold)' : 'transparent',
                      color: timeframeMode === 'monthly' ? '#1A1A1A' : 'var(--color-text-muted)',
                      fontSize: '13px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Monthly (12 Mo)
                  </button>
                  <button
                    onClick={() => setTimeframeMode('daily')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: timeframeMode === 'daily' ? 'var(--color-gold)' : 'transparent',
                      color: timeframeMode === 'daily' ? '#1A1A1A' : 'var(--color-text-muted)',
                      fontSize: '13px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Daily (30 Days)
                  </button>
                </div>

                {/* CSV Export Button */}
                <button
                  onClick={() => {
                    if (!analyticsData) return
                    const items = timeframeMode === 'monthly' ? analyticsData.monthly_stats : analyticsData.daily_stats
                    const headers = timeframeMode === 'monthly' ? 'Month,Revenue,Bookings,Nights\n' : 'Date,Revenue,Bookings,Nights\n'
                    const csvContent = 'data:text/csv;charset=utf-8,' + headers + items.map(e => `${'month' in e ? e.month : e.date},${e.revenue},${e.bookings},${e.nights || 0}`).join('\n')
                    const encodedUri = encodeURI(csvContent)
                    const link = document.createElement('a')
                    link.setAttribute('href', encodedUri)
                    link.setAttribute('download', `conceptstay_analytics_${timeframeMode}.csv`)
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                  }}
                  style={{
                    ...buttonStyle,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Download size={14} /> Export CSV
                </button>
              </div>
            </div>

            {analyticsLoading && (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ width: '40px', height: '40px', border: '3px solid var(--color-gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Loading analytical reports…</p>
              </div>
            )}

            {!analyticsLoading && analyticsData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                {/* Key Performance Indicators (KPIs) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  <div style={{ padding: '20px 24px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px' }}>
                    <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--color-text-muted)', fontWeight: '700', marginBottom: '8px' }}>Total Revenue</p>
                    <p style={{ fontSize: '28px', fontWeight: '800', color: 'var(--color-gold)' }}>&#8377;{analyticsData.summary.total_revenue.toLocaleString('en-IN')}</p>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Gross earnings from all stays</p>
                  </div>
                  <div style={{ padding: '20px 24px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px' }}>
                    <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--color-text-muted)', fontWeight: '700', marginBottom: '8px' }}>Confirmed Bookings</p>
                    <p style={{ fontSize: '28px', fontWeight: '800', color: '#2E7D32' }}>{analyticsData.summary.total_bookings}</p>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Successful reservation count</p>
                  </div>
                  <div style={{ padding: '20px 24px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px' }}>
                    <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--color-text-muted)', fontWeight: '700', marginBottom: '8px' }}>Total Nights Booked</p>
                    <p style={{ fontSize: '28px', fontWeight: '800', color: '#1565C0' }}>{analyticsData.summary.total_nights} Nights</p>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Combined length of stay</p>
                  </div>
                  <div style={{ padding: '20px 24px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px' }}>
                    <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--color-text-muted)', fontWeight: '700', marginBottom: '8px' }}>Avg. Daily Rate (ADR)</p>
                    <p style={{ fontSize: '28px', fontWeight: '800', color: '#6A1B9A' }}>&#8377;{analyticsData.summary.avg_daily_rate.toLocaleString('en-IN')}</p>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Revenue earned per night stayed</p>
                  </div>
                </div>

                {/* Airbnb-style Interactive Performance Graph Card */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                      <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                        {timeframeMode === 'monthly' ? 'Monthly Performance (12 Months)' : 'Daily Performance (Last 30 Days)'}
                      </h3>
                      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Visual trajectory of revenue and booking volume</p>
                    </div>

                    {/* Metric Switcher */}
                    <div style={{ display: 'flex', backgroundColor: 'var(--color-bg-card)', padding: '4px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                      <button
                        onClick={() => setMetricMode('revenue')}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: metricMode === 'revenue' ? '#ffffff' : 'transparent',
                          color: metricMode === 'revenue' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          boxShadow: metricMode === 'revenue' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                        }}
                      >
                        Revenue (₹)
                      </button>
                      <button
                        onClick={() => setMetricMode('bookings')}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: metricMode === 'bookings' ? '#ffffff' : 'transparent',
                          color: metricMode === 'bookings' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          boxShadow: metricMode === 'bookings' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                        }}
                      >
                        Bookings
                      </button>
                      <button
                        onClick={() => setMetricMode('nights')}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: metricMode === 'nights' ? '#ffffff' : 'transparent',
                          color: metricMode === 'nights' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          boxShadow: metricMode === 'nights' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                        }}
                      >
                        Nights
                      </button>
                    </div>
                  </div>

                  {/* Dynamic Bar Chart View */}
                  {(() => {
                    const dataList = timeframeMode === 'monthly' ? analyticsData.monthly_stats : analyticsData.daily_stats
                    const maxValue = Math.max(
                      ...dataList.map(item => {
                        if (metricMode === 'revenue') return item.revenue
                        if (metricMode === 'bookings') return item.bookings
                        return item.nights || 0
                      }),
                      1
                    )

                    return (
                      <div style={{ overflowX: 'auto' }}>
                        <div style={{ minWidth: timeframeMode === 'daily' ? '840px' : 'auto', height: '260px', display: 'flex', alignItems: 'flex-end', gap: timeframeMode === 'daily' ? '10px' : '20px', padding: '24px 12px 12px', borderBottom: '1px solid var(--color-border)', position: 'relative' }}>
                          {dataList.map((item, idx) => {
                            const val = metricMode === 'revenue' ? item.revenue : metricMode === 'bookings' ? item.bookings : (item.nights || 0)
                            const label = 'month' in item ? item.month : item.date
                            const heightPct = Math.max(14, Math.round((val / maxValue) * 190))

                            return (
                              <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', position: 'relative' }}>
                                {/* Value Label */}
                                <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--color-text-secondary)', marginBottom: '8px', whiteSpace: 'nowrap' }}>
                                  {val > 0 ? (metricMode === 'revenue' ? `₹${val.toLocaleString('en-IN')}` : val) : '—'}
                                </div>

                                {/* Dynamic Bar */}
                                <div
                                  title={`${label}: ${metricMode === 'revenue' ? `₹${item.revenue.toLocaleString('en-IN')}` : metricMode === 'bookings' ? `${item.bookings} bookings` : `${item.nights || 0} nights`}`}
                                  style={{
                                    width: '100%',
                                    maxWidth: timeframeMode === 'daily' ? '24px' : '44px',
                                    height: `${heightPct}px`,
                                    background: val > 0
                                      ? metricMode === 'revenue'
                                        ? 'linear-gradient(180deg, #D4AF37 0%, #AA820A 100%)'
                                        : metricMode === 'bookings'
                                        ? 'linear-gradient(180deg, #2E7D32 0%, #1B5E20 100%)'
                                        : 'linear-gradient(180deg, #1565C0 0%, #0D47A1 100%)'
                                      : 'var(--color-bg-soft)',
                                    borderRadius: '6px 6px 2px 2px',
                                    transition: 'height 0.3s ease',
                                    cursor: 'pointer',
                                  }}
                                />

                                {/* Time Label */}
                                <p style={{ fontSize: timeframeMode === 'daily' ? '10px' : '12px', color: 'var(--color-text-secondary)', fontWeight: '700', marginTop: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  {label}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* Airbnb-style Property Performance Breakdown Table */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                      <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Property Performance Breakdown</h3>
                      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Revenue and occupancy comparison across all listed properties</p>
                    </div>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                          {['Property', 'Location', 'Base Rate', 'Bookings', 'Nights Booked', 'Total Revenue', 'ADR'].map(h => (
                            <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Property' || h === 'Location' ? 'left' : 'right', fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.property_performance.map((prop, i) => {
                          const adr = prop.nights_booked > 0 ? Math.round(prop.total_revenue / prop.nights_booked) : 0
                          return (
                            <tr key={prop.property_id} style={{ borderBottom: '1px solid var(--color-bg-soft)', backgroundColor: i % 2 === 0 ? '#ffffff' : 'var(--color-bg-card)' }}>
                              <td style={{ padding: '14px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  {prop.image_url ? (
                                    <Image src={prop.image_url} alt={prop.name} width={48} height={36} style={{ width: '48px', height: '36px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} unoptimized />
                                  ) : (
                                    <div style={{ width: '48px', height: '36px', borderRadius: '6px', backgroundColor: 'var(--color-bg-soft)', flexShrink: 0 }} />
                                  )}
                                  <div>
                                    <p style={{ fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: '700', marginBottom: '2px' }}>{prop.name}</p>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{prop.city}, {prop.state}</td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'right', fontWeight: '600' }}>&#8377;{prop.price_per_night.toLocaleString('en-IN')}</td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'right', fontWeight: '700' }}>{prop.bookings_count}</td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'right', fontWeight: '700' }}>{prop.nights_booked} nights</td>
                              <td style={{ padding: '14px 16px', fontSize: '14px', color: 'var(--color-gold)', textAlign: 'right', fontWeight: '800' }}>&#8377;{prop.total_revenue.toLocaleString('en-IN')}</td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--color-text-primary)', textAlign: 'right', fontWeight: '700' }}>&#8377;{adr.toLocaleString('en-IN')}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Payments & Settlements</h2>
              <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
                Compare what guests paid vs what Razorpay has actually transferred to your bank account
              </p>
            </div>

            {/* Summary Cards */}
            {paymentsLoading && !paymentSummary ? (
              <div style={{ display: 'flex', gap: '24px', marginBottom: '32px' }}>
                {[0,1,2,3].map(i => <div key={i} style={{ flex: 1, height: '120px', backgroundColor: 'var(--color-bg-card)', borderRadius: '16px', border: '1px solid var(--color-border)', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
                <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
              </div>
            ) : paymentSummary ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                {/* Collected */}
                <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '24px', borderTop: '3px solid #4CAF50' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <Wallet size={15} color="#4CAF50" />
                    <p style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', margin: 0 }}>Total Collected</p>
                  </div>
                  <p style={{ fontSize: '28px', fontWeight: '800', color: '#2E7D32', marginBottom: '4px' }}>₹{paymentSummary.total_collected_rupees.toLocaleString('en-IN')}</p>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{paymentSummary.paid_transactions} paid transactions</p>
                  <p style={{ fontSize: '11px', color: '#4CAF50', marginTop: '6px', fontWeight: '600' }}>Captured by Razorpay</p>
                </div>

                {/* Settled to Bank */}
                <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '24px', borderTop: '3px solid #C8A951' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <BadgeCheck size={15} color="#C8A951" />
                    <p style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', margin: 0 }}>Settled to Bank</p>
                  </div>
                  <p style={{ fontSize: '28px', fontWeight: '800', color: 'var(--color-gold)', marginBottom: '4px' }}>₹{paymentSummary.total_settled_rupees.toLocaleString('en-IN')}</p>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{paymentSummary.settlement_batches} settlement batches</p>
                  <p style={{ fontSize: '11px', color: 'var(--color-gold)', marginTop: '6px', fontWeight: '600' }}>Actually in your bank</p>
                </div>

                {/* Pending with Razorpay */}
                <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '24px', borderTop: '3px solid #FF9800' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <Clock size={15} color="#FF9800" />
                    <p style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', margin: 0 }}>Pending Transfer</p>
                  </div>
                  <p style={{ fontSize: '28px', fontWeight: '800', color: '#E65100', marginBottom: '4px' }}>₹{paymentSummary.pending_with_razorpay_rupees.toLocaleString('en-IN')}</p>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Being processed by Razorpay</p>
                  <p style={{ fontSize: '11px', color: '#FF9800', marginTop: '6px', fontWeight: '600' }}>Expected in 1-2 business days</p>
                </div>

                {/* Refunded */}
                <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '24px', borderTop: '3px solid #F44336' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <RefreshCw size={15} color="#F44336" />
                    <p style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', margin: 0 }}>Total Refunded</p>
                  </div>
                  <p style={{ fontSize: '28px', fontWeight: '800', color: '#C62828', marginBottom: '4px' }}>₹{paymentSummary.total_refunded_rupees.toLocaleString('en-IN')}</p>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Returned to guests</p>
                  <p style={{ fontSize: '11px', color: '#F44336', marginTop: '6px', fontWeight: '600' }}>Refunded via Razorpay</p>
                </div>
              </div>
            ) : null}

            {paymentSummary?.razorpay_error && (
              <div style={{ backgroundColor: '#FFF8E7', border: '1px solid #FFE082', borderRadius: '10px', padding: '14px 18px', marginBottom: '24px', fontSize: '13px', color: '#5D4037', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <AlertTriangle size={16} color="#F57F17" style={{ flexShrink: 0, marginTop: '1px' }} />
                <div><strong>Note:</strong> Could not fetch real-time settlement data from Razorpay. Settlement figures may not reflect current balances.
                <br /><span style={{ fontSize: '11px', opacity: 0.7 }}>{paymentSummary.razorpay_error}</span></div>
              </div>
            )}

            {/* Razorpay Settlement Batches */}
            {settlements.length > 0 && (
              <div style={{ ...cardStyle, marginBottom: '24px' }}>
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Settlement Batches</h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Each row = one bank transfer from Razorpay to your account (with UTR reference number)</p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                        {['Settlement ID', 'Date Settled', 'Amount', 'Razorpay Fees', 'Transactions', 'UTR Number', 'Status'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.map((s, i) => (
                        <tr key={s.settlement_id} style={{ borderBottom: '1px solid var(--color-bg-soft)', backgroundColor: i % 2 === 0 ? '#ffffff' : 'var(--color-bg-card)' }}>
                          <td style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{s.settlement_id}</td>
                          <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '600', whiteSpace: 'nowrap' }}>
                            {s.settled_at ? new Date(s.settled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: '14px', color: '#2E7D32', fontWeight: '800' }}>₹{s.amount_rupees.toLocaleString('en-IN')}</td>
                          <td style={{ padding: '12px 14px', fontSize: '13px', color: '#C62828', fontWeight: '600' }}>₹{s.fees_rupees.toLocaleString('en-IN')}</td>
                          <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>{s.transaction_count}</td>
                          <td style={{ padding: '12px 14px', fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{s.utr || '—'}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ backgroundColor: s.status === 'processed' ? '#E8F5E9' : '#FFF8E7', color: s.status === 'processed' ? '#2E7D32' : '#F57F17', padding: '4px 10px', fontSize: '11px', fontWeight: '700', borderRadius: '999px', textTransform: 'uppercase' }}>
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Transactions Table */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>All Transactions</h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{paymentsData?.total ?? 0} total Razorpay transactions</p>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Search by Order ID, Payment ID, Guest..."
                    value={paymentsSearch}
                    onChange={e => {
                      setPaymentsSearch(e.target.value)
                      setPaymentsPage(1)
                      void loadPayments(1, e.target.value, paymentsStatusFilter)
                    }}
                    style={{ padding: '9px 14px', fontSize: '13px', border: '1px solid var(--color-border)', borderRadius: '8px', outline: 'none', width: '260px' }}
                  />
                  <select
                    value={paymentsStatusFilter}
                    onChange={e => {
                      setPaymentsStatusFilter(e.target.value)
                      setPaymentsPage(1)
                      void loadPayments(1, paymentsSearch, e.target.value)
                    }}
                    style={{ padding: '9px 14px', fontSize: '13px', border: '1px solid var(--color-border)', borderRadius: '8px', outline: 'none', backgroundColor: '#fff' }}
                  >
                    <option value="">All Statuses</option>
                    <option value="paid">Paid</option>
                    <option value="created">Pending</option>
                    <option value="refunded">Refunded</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>

              {paymentsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                  <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                        {['Date', 'Booking Ref', 'Guest', 'Property', 'Razorpay Order ID', 'Payment ID', 'Amount', 'Status'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(paymentsData?.items ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                            No transactions found
                          </td>
                        </tr>
                      ) : (paymentsData?.items ?? []).map((p: AdminPayment, i: number) => {
                        const statusConfig: Record<string, { bg: string; color: string; icon: React.ReactNode; label: string }> = {
                          paid:     { bg: '#E8F5E9', color: '#2E7D32', icon: <CheckCircle size={12} />, label: 'Paid' },
                          created:  { bg: '#FFF8E7', color: '#F57F17', icon: <Clock size={12} />,        label: 'Pending' },
                          refunded: { bg: '#E3F2FD', color: '#1565C0', icon: <RefreshCw size={12} />,    label: 'Refunded' },
                          failed:   { bg: '#FFEBEE', color: '#C62828', icon: <XCircle size={12} />,      label: 'Failed' },
                        }
                        const sc = statusConfig[p.status] ?? { bg: '#F5F5F5', color: '#757575', icon: null, label: p.status }
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid var(--color-bg-soft)', backgroundColor: i % 2 === 0 ? '#ffffff' : 'var(--color-bg-card)' }}>
                            <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                              {p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{ fontSize: '13px', color: 'var(--color-gold)', fontWeight: '800' }}>{p.booking_ref || '—'}</span>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <p style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '600', marginBottom: '2px' }}>{p.guest_name || '—'}</p>
                              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{p.guest_email || ''}</p>
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--color-text-secondary)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.property_name || '—'}</td>
                            <td style={{ padding: '12px 14px', fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.razorpay_order_id}</td>
                            <td style={{ padding: '12px 14px', fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.razorpay_payment_id || '—'}</td>
                            <td style={{ padding: '12px 14px', fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: '800', whiteSpace: 'nowrap' }}>₹{p.amount_rupees.toLocaleString('en-IN')}</td>
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{ backgroundColor: sc.bg, color: sc.color, padding: '4px 10px', fontSize: '11px', fontWeight: '700', borderRadius: '999px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{sc.icon}{sc.label}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  {paymentsData && paymentsData.total > 20 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
                      <button
                        onClick={() => { const p = paymentsPage - 1; setPaymentsPage(p); void loadPayments(p, paymentsSearch, paymentsStatusFilter) }}
                        disabled={paymentsPage <= 1}
                        style={{ padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: '8px', cursor: paymentsPage <= 1 ? 'not-allowed' : 'pointer', opacity: paymentsPage <= 1 ? 0.4 : 1, fontSize: '13px', backgroundColor: '#fff' }}
                      >← Prev</button>
                      <span style={{ padding: '8px 16px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                        Page {paymentsPage} of {Math.ceil(paymentsData.total / 20)}
                      </span>
                      <button
                        onClick={() => { const p = paymentsPage + 1; setPaymentsPage(p); void loadPayments(p, paymentsSearch, paymentsStatusFilter) }}
                        disabled={paymentsPage >= Math.ceil(paymentsData.total / 20)}
                        style={{ padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: '8px', cursor: paymentsPage >= Math.ceil(paymentsData.total / 20) ? 'not-allowed' : 'pointer', opacity: paymentsPage >= Math.ceil(paymentsData.total / 20) ? 0.4 : 1, fontSize: '13px', backgroundColor: '#fff' }}
                      >Next →</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bookings Tab */}
        {activeTab === 'bookings' && (
          <div>
            {/* Voucher Modal */}
            {voucherBooking && (
              <div onClick={() => setVoucherBooking(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                <div id="admin-voucher-content" onClick={e => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '0', maxWidth: '520px', width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
                  {/* Property Hero Image */}
                  {(() => {
                    const vProp = getProperty(voucherBooking.property_id)
                    const heroImg = vProp?.images?.find(i => i.is_primary)?.image_url || vProp?.images?.[0]?.image_url
                    return heroImg ? (
                      <div style={{ position: 'relative', height: '160px', width: '100%' }}>
                        <Image
                          src={heroImg}
                          alt={vProp?.name ?? ''}
                          fill
                          style={{ objectFit: 'cover' }}
                          unoptimized
                          onError={e => {
                            (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800'
                          }}
                        />
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 55%)' }}>
                          <div style={{ position: 'absolute', bottom: '16px', left: '20px', right: '52px' }}>
                            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>{vProp?.city}, {vProp?.state}</p>
                            <h3 style={{ color: '#ffffff', fontSize: '18px', fontWeight: '800', lineHeight: '1.2' }}>{vProp?.name}</h3>
                          </div>
                        </div>
                      </div>
                    ) : vProp ? (
                      <div style={{ padding: '24px 28px 0', backgroundColor: 'var(--color-navbar)' }}>
                        <p style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text-primary)' }}>{vProp.name}</p>
                        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{vProp.city}, {vProp.state}</p>
                      </div>
                    ) : null
                  })()}
                  <div style={{ padding: '28px 28px 28px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div>
                      <p style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', marginBottom: '6px' }}>Booking Voucher</p>
                      <p style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-gold)' }}>{voucherBooking.booking_ref}</p>
                    </div>
                    <button onClick={() => setVoucherBooking(null)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--color-text-muted)', lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    {[
                      { label: 'Guest', value: voucherBooking.guest_name },
                      { label: 'Email', value: voucherBooking.guest_email },
                      { label: 'Phone', value: voucherBooking.guest_phone || '—' },
                      { label: 'Property', value: getProperty(voucherBooking.property_id)?.name || '—' },
                      { label: 'Check In', value: formatDate(voucherBooking.check_in) },
                      { label: 'Check Out', value: formatDate(voucherBooking.check_out) },
                      { label: 'Guests', value: String(voucherBooking.guests) },
                      { label: 'Pets', value: String(voucherBooking.pets || 0) },
                      { label: 'Nights', value: String(voucherBooking.nights) },
                      { label: 'Status', value: voucherBooking.status.toUpperCase() },
                    ].map(row => (
                      <div key={row.label} style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-card)', borderRadius: '8px' }}>
                        <p style={{ fontSize: '10px', letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', marginBottom: '4px' }}>{row.label}</p>
                        <p style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '600' }}>{row.value}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '2px' }}>Total Amount</p>
                      <p style={{ fontSize: '28px', fontWeight: '800', color: 'var(--color-text-primary)' }}>&#8377;{voucherBooking.total.toLocaleString('en-IN')}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleAdminDownloadPDF(voucherBooking.booking_ref)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 16px', backgroundColor: 'var(--color-gold)', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', color: 'var(--color-text-primary)' }}>
                        <Download style={{ width: '15px', height: '15px' }} />
                        Download PDF
                      </button>
                      <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 16px', backgroundColor: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', color: 'var(--color-text-primary)' }}>
                        <Printer style={{ width: '15px', height: '15px' }} />
                        Print
                      </button>
                    </div>
                  </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search by guest name, email or booking ref..."
                value={searchBooking}
                onChange={e => handleBookingSearch(e.target.value)}
                style={{ flex: 1, minWidth: 0, padding: '12px 16px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '14px', color: 'var(--color-text-primary)', outline: 'none', backgroundColor: '#ffffff' }}
              />
              <select
                value={statusFilter}
                onChange={e => handleStatusFilter(e.target.value)}
                style={{ padding: '12px 16px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '14px', color: 'var(--color-text-primary)', outline: 'none', backgroundColor: '#ffffff', cursor: 'pointer' }}
              >
                <option value="">All Statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
              {bookingsLoading ? (
                <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-muted)' }}>Loading bookings…</div>
              ) : (
                <>
                  {/* Desktop Booking Table */}
                  <div className="hidden md:block" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--color-navbar)' }}>
                          {['Ref', 'Guest', 'Property', 'Check In', 'Check Out', 'Guests', 'Amount', 'Status', 'Actions'].map(h => (
                            <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-gold)', fontWeight: '700', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bookings.map((booking, i) => {
                          const property = getProperty(booking.property_id)
                          return (
                            <tr key={booking.id} style={{ borderBottom: '1px solid var(--color-bg-soft)', backgroundColor: i % 2 === 0 ? '#ffffff' : 'var(--color-bg-card)' }}>
                              <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--color-gold)', fontWeight: '700', whiteSpace: 'nowrap' }}>{booking.booking_ref}</td>
                              <td style={{ padding: '14px 16px' }}>
                                <p style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '700', marginBottom: '2px', whiteSpace: 'nowrap' }}>{booking.guest_name}</p>
                                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{booking.guest_phone}</p>
                              </td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{property?.name || '—'}</td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{formatDate(booking.check_in)}</td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{formatDate(booking.check_out)}</td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                {booking.guests}{(booking.pets || 0) > 0 ? ` + ${booking.pets} pet${booking.pets > 1 ? 's' : ''}` : ''}
                              </td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '700', whiteSpace: 'nowrap' }}>&#8377;{booking.total.toLocaleString('en-IN')}</td>
                              <td style={{ padding: '14px 16px' }}>
                                <span style={{ backgroundColor: statusColors[booking.status]?.bg, color: statusColors[booking.status]?.color, padding: '4px 10px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', whiteSpace: 'nowrap', borderRadius: '6px' }}>
                                  {booking.status}
                                </span>
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  {booking.status === 'pending' && (
                                    <>
                                      <button onClick={() => handleUpdateBookingStatus(booking.id, 'confirmed')} style={{ padding: '6px 10px', backgroundColor: '#E8F5E9', color: '#2E7D32', border: 'none', fontSize: '12px', cursor: 'pointer', fontWeight: '700', borderRadius: '6px' }}>Confirm</button>
                                      <button onClick={() => handleCancelWithRefund(booking)} style={{ padding: '6px 10px', backgroundColor: '#FFEBEE', color: '#C62828', border: 'none', fontSize: '12px', cursor: 'pointer', fontWeight: '700', borderRadius: '6px' }}>
                                        {(booking as AdminBooking & { payment_status?: string }).payment_status === 'paid' ? 'Cancel+Refund' : 'Cancel'}
                                      </button>
                                    </>
                                  )}
                                  {booking.status === 'confirmed' && (
                                    <button onClick={() => handleUpdateBookingStatus(booking.id, 'completed')} style={{ padding: '6px 10px', backgroundColor: '#E3F2FD', color: '#1565C0', border: 'none', fontSize: '12px', cursor: 'pointer', fontWeight: '700', borderRadius: '6px' }}>Complete</button>
                                  )}
                                  <button onClick={() => setVoucherBooking(booking)} style={{ padding: '6px 10px', backgroundColor: 'var(--color-bg-soft)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', fontSize: '12px', cursor: 'pointer', borderRadius: '6px', fontWeight: '600' }}>Voucher</button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Booking Cards */}
                  <div className="flex md:hidden flex-col gap-3 p-4">
                    {bookings.map(booking => renderBookingCard(booking, true))}
                  </div>

                  {bookings.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-muted)' }}>No bookings found</div>
                  )}

                  {/* Pagination */}
                  {bookingsTotal > BOOKINGS_PER_PAGE && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid var(--color-border)', flexWrap: 'wrap', gap: '12px' }}>
                      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                        Showing {((bookingsPage - 1) * BOOKINGS_PER_PAGE) + 1}–{Math.min(bookingsPage * BOOKINGS_PER_PAGE, bookingsTotal)} of {bookingsTotal} bookings
                      </p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          disabled={bookingsPage <= 1}
                          onClick={() => loadBookings(bookingsPage - 1, searchBooking, statusFilter)}
                          style={{ padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: '8px', backgroundColor: '#fff', cursor: bookingsPage <= 1 ? 'not-allowed' : 'pointer', opacity: bookingsPage <= 1 ? 0.4 : 1, fontSize: '13px', fontWeight: '600' }}
                        >← Prev</button>
                        <span style={{ padding: '8px 14px', fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Page {bookingsPage} of {Math.ceil(bookingsTotal / BOOKINGS_PER_PAGE)}</span>
                        <button
                          disabled={bookingsPage >= Math.ceil(bookingsTotal / BOOKINGS_PER_PAGE)}
                          onClick={() => loadBookings(bookingsPage + 1, searchBooking, statusFilter)}
                          style={{ padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: '8px', backgroundColor: '#fff', cursor: bookingsPage >= Math.ceil(bookingsTotal / BOOKINGS_PER_PAGE) ? 'not-allowed' : 'pointer', opacity: bookingsPage >= Math.ceil(bookingsTotal / BOOKINGS_PER_PAGE) ? 0.4 : 1, fontSize: '13px', fontWeight: '600' }}>Next →</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Properties Tab */}
        {activeTab === 'properties' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
              <button onClick={() => router.push('/admin/properties')} style={primaryButtonStyle}>
                + Add New Property
              </button>
            </div>

            {E2E_SKIP_AUTH && (
              <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', marginBottom: '4px' }}>E2E Seed</p>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{E2E_SEED_PROPERTY.name}</h3>
                </div>
                <Link href={`/properties/${E2E_SEED_PROPERTY.id}`} style={{ ...buttonStyle, display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
                  View
                </Link>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {propertiesForDisplay.map(property => {
                const thumbSrc = property.images?.find(i => i.is_primary)?.image_url || property.images?.[0]?.image_url
                return (
                  <div key={property.id} style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }} className="flex flex-col md:flex-row gap-5 items-stretch md:items-center">
                    {thumbSrc && !thumbSrc.startsWith('blob:') ? (
                      <div className="relative w-full h-48 md:w-[120px] md:h-[90px] flex-shrink-0 rounded-lg overflow-hidden">
                        <Image
                          src={thumbSrc}
                          alt={property.name}
                          fill
                          style={{ objectFit: 'cover' }}
                          unoptimized
                          onError={e => {
                            (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800'
                          }}
                        />
                      </div>
                    ) : (
                      <div className="relative w-full h-48 md:w-[120px] md:h-[90px] flex-shrink-0 rounded-lg overflow-hidden">
                        <Image
                          src="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800"
                          alt={property.name}
                          fill
                          style={{ objectFit: 'cover' }}
                          unoptimized
                        />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{property.name}</h3>
                        <span style={{
                          backgroundColor: property.is_published ? '#E8F5E9' : '#FFF8E7',
                          color: property.is_published ? '#2E7D32' : '#F57F17',
                          padding: '3px 10px', fontSize: '11px', fontWeight: '700', borderRadius: '6px'
                        }}>{property.is_published ? 'Published' : 'Draft'}</span>
                        {property.is_featured && (
                          <span style={{
                            backgroundColor: '#FFFBE7',
                            color: '#B7791F',
                            padding: '3px 10px', fontSize: '11px', fontWeight: '700', borderRadius: '6px',
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                          }}>
                            <Star size={11} fill="currentColor" />
                            Featured
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>{property.city}, {property.state}</p>
                      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                        {[
                          `${property.bedrooms} beds`, `${property.bathrooms} baths`,
                          `${property.max_guests} guests`,
                          `${property.review_count} reviews`, property.pets_allowed ? 'Pet friendly' : 'No pets',
                        ].map(label => (
                          <span key={label} style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '500' }}>{label}</span>
                        ))}
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Star size={11} fill="currentColor" color="var(--color-gold)" />{property.avg_rating}
                        </span>
                      </div>
                    </div>

                    <div className="text-left md:text-right flex-shrink-0 mt-4 md:mt-0">
                      <p style={{ fontSize: '22px', color: 'var(--color-text-primary)', fontWeight: '800', marginBottom: '4px' }}>&#8377;{property.price_per_night.toLocaleString('en-IN')}</p>
                      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>per night</p>
                      <div className="flex gap-2 flex-wrap justify-start md:justify-end">
                        <button
                          onClick={() => setCalendarProperty({ id: property.id, name: property.name })}
                          title="View & manage calendar"
                          style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        ><Calendar size={14} /> Calendar</button>
                        <button
                          onClick={() => handleToggleFeatured(property.id, !!property.is_featured)}
                          disabled={!!featuredLoading[property.id]}
                          title={property.is_featured ? 'Remove from featured on home page' : 'Feature this property on the home page'}
                          style={{
                            padding: '8px 14px',
                            border: property.is_featured ? '1.5px solid #B7791F' : '1px solid var(--color-border)',
                            borderRadius: '8px',
                            backgroundColor: property.is_featured ? '#FFFBE7' : '#ffffff',
                            color: property.is_featured ? '#B7791F' : 'var(--color-text-primary)',
                            fontSize: '13px',
                            cursor: featuredLoading[property.id] ? 'not-allowed' : 'pointer',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            opacity: featuredLoading[property.id] ? 0.6 : 1,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <Star size={13} fill={property.is_featured ? 'currentColor' : 'none'} />
                          {featuredLoading[property.id] ? '...' : property.is_featured ? 'Featured' : 'Set Featured'}
                        </button>
                        <button onClick={() => router.push(`/admin/properties?id=${property.id}`)} style={buttonStyle}>Edit</button>
                        <Link href={`/properties/${property.id}`} style={{ ...buttonStyle, display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>View</Link>
                        <button onClick={() => handleDuplicateProperty(property.id, property.name)} style={buttonStyle}>Duplicate</button>
                        <button
                          onClick={() => {
                            setReviewProperty({ id: property.id, name: property.name })
                            loadPropertyReviews(property.id)
                          }}
                          style={{ padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: '8px', backgroundColor: '#ffffff', color: 'var(--color-text-primary)', fontSize: '13px', cursor: 'pointer', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <Star size={14} fill="currentColor" style={{ color: 'var(--color-gold)' }} /> Reviews
                        </button>
                        <button onClick={() => handleDeleteProperty(property.id, property.name)} style={{ padding: '8px 16px', border: '1px solid #FFCDD2', borderRadius: '8px', backgroundColor: '#FFEBEE', color: '#C62828', fontSize: '13px', cursor: 'pointer', fontWeight: '700' }}>Delete</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Groups Tab */}
        {activeTab === 'groups' && (
          <div>
            {groupError && (
              <div style={{ marginBottom: '16px', padding: '12px 16px', backgroundColor: '#FFEBEE', borderRadius: '8px', color: '#C62828', fontSize: '14px', fontWeight: '600' }}>{groupError}<button onClick={() => setGroupError('')} style={{ marginLeft: '10px', background: 'none', border: 'none', color: '#C62828', cursor: 'pointer', fontWeight: '800' }}>×</button></div>
            )}
            {groupSuccess && (
              <div style={{ marginBottom: '16px', padding: '12px 16px', backgroundColor: '#E8F5E9', borderRadius: '8px', color: '#2E7D32', fontSize: '14px', fontWeight: '600' }}>{groupSuccess}</div>
            )}

            {/* Create Group */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 8px 24px rgba(26,26,26,0.04)' }}>
              <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Property Groups</h2>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>Group sub-properties together for shared availability calendar blocking.</p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  id="new-group-name"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
                  placeholder="Group name (e.g. Earthy Villa Estate)"
                  style={{ flex: 1, minWidth: '200px', padding: '12px 16px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '14px', outline: 'none', color: 'var(--color-text-primary)' }}
                />
                <button
                  onClick={handleCreateGroup}
                  style={{ padding: '12px 24px', backgroundColor: 'var(--color-gold)', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', letterSpacing: '0.5px' }}
                >
                  + Create Group
                </button>
              </div>
            </div>

            {/* Groups List */}
            {groupsLoading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-muted)' }}>Loading groups…</div>
            ) : groups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-muted)', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                  <Building2 size={36} style={{ color: 'var(--color-gold)' }} />
                </div>
                <p style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>No groups yet</p>
                <p style={{ fontSize: '13px' }}>Create your first group above to group sub-properties</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {groups.map(group => {
                  const isExpanded = expandedGroup === group.id
                  const isEditingName = editingGroupId === group.id
                  const masterMember = group.members.find(m => m.is_whole_property)

                  return (
                    <div key={group.id} style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '14px', boxShadow: '0 8px 24px rgba(26,26,26,0.04)', overflow: 'hidden' }}>
                      {/* Group header */}
                      <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setExpandedGroup(isExpanded ? null : group.id)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                          <Building2 size={20} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
                          {isEditingName ? (
                            <input
                              autoFocus
                              value={editingGroupName}
                              onChange={e => setEditingGroupName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleRenameGroup(group.id); if (e.key === 'Escape') setEditingGroupId(null) }}
                              onClick={e => e.stopPropagation()}
                              style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--color-gold)', borderRadius: '6px', fontSize: '16px', fontWeight: '700', outline: 'none' }}
                            />
                          ) : (
                            <div>
                              <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '2px' }}>{group.name}</h3>
                              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{group.members.length} propert{group.members.length === 1 ? 'y' : 'ies'} · {masterMember ? `Master: ${masterMember.property.name}` : 'No master set'}</p>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          {isEditingName ? (
                            <>
                              <button onClick={() => handleRenameGroup(group.id)} style={{ padding: '7px 14px', backgroundColor: 'var(--color-gold)', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>Save</button>
                              <button onClick={() => setEditingGroupId(null)} style={{ padding: '7px 14px', backgroundColor: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setEditingGroupId(group.id); setEditingGroupName(group.name) }} style={{ padding: '7px 14px', backgroundColor: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>Rename</button>
                              <button onClick={() => handleDeleteGroup(group.id)} style={{ padding: '7px 14px', backgroundColor: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', color: '#C62828' }}>Delete</button>
                              <span style={{ color: 'var(--color-text-muted)', fontSize: '18px' }}>{isExpanded ? '▲' : '▼'}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expanded panel */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid var(--color-border)', padding: '20px 24px', backgroundColor: 'var(--color-bg-card)' }}>
                          {/* Members */}
                          <h4 style={{ fontSize: '13px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-gold)', marginBottom: '12px', fontWeight: '700' }}>Members</h4>
                          {group.members.length === 0 ? (
                            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>No properties in this group yet.</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                              {group.members.map(member => (
                                <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px 16px', backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                    <span style={{ display: 'flex', alignItems: 'center' }}>{member.is_whole_property ? <Building2 size={16} style={{ color: 'var(--color-gold)' }} /> : <Bed size={16} style={{ color: 'var(--color-text-muted)' }} />}</span>
                                    <div style={{ minWidth: 0 }}>
                                      <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.property.name}</p>
                                      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{member.property.city}, {member.property.state} · {member.is_whole_property ? <strong>Whole Property</strong> : 'Sub-property'}</p>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                                    <button onClick={() => handleToggleWhole(group.id, member.id, member.is_whole_property)} style={{ padding: '6px 12px', backgroundColor: member.is_whole_property ? '#E3F2FD' : 'var(--color-bg-soft)', border: `1px solid ${member.is_whole_property ? '#90CAF9' : 'var(--color-border)'}`, borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', color: member.is_whole_property ? '#1565C0' : 'var(--color-text-secondary)' }}>{member.is_whole_property ? 'Unset Master' : 'Set as Master'}</button>
                                    <button onClick={() => handleRemoveMember(group.id, member.id)} style={{ padding: '6px 12px', backgroundColor: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', color: '#C62828' }}>Remove</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add member */}
                          {addingMemberGroupId === group.id ? (
                            <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
                              <h5 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '12px' }}>Add Property to Group</h5>
                              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                <div style={{ flex: 1, minWidth: '200px' }}>
                                  <label style={{ fontSize: '11px', letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block', fontWeight: '700' }}>Property</label>
                                  <select
                                    value={memberPropertyId}
                                    onChange={e => setMemberPropertyId(e.target.value)}
                                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '14px', outline: 'none', backgroundColor: '#fff', cursor: 'pointer' }}
                                  >
                                    <option value="">Select a property…</option>
                                    {apiProperties.map(p => (
                                      <option key={p.id} value={p.id}>{p.name} — {p.city}</option>
                                    ))}
                                  </select>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '600', cursor: 'pointer', paddingBottom: '10px' }}>
                                  <input type="checkbox" checked={memberIsWhole} onChange={e => setMemberIsWhole(e.target.checked)} />
                                  Whole Property (master)
                                </label>
                                <button onClick={() => handleAddMember(group.id)} style={{ padding: '10px 20px', backgroundColor: 'var(--color-gold)', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>Add</button>
                                <button onClick={() => { setAddingMemberGroupId(null); setMemberPropertyId(''); setMemberIsWhole(false) }} style={{ padding: '10px 20px', backgroundColor: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => { setAddingMemberGroupId(group.id); setGroupError('') }} style={{ padding: '9px 18px', backgroundColor: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>+ Add Property</button>
                          )}

                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* iCal Tab */}
        {activeTab === 'ical' && (
          <div>
            <div style={{ ...cardStyle, marginBottom: '24px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '8px' }}>iCal Calendar Sync</h2>
              <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-gold)', marginBottom: '16px' }} />
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', lineHeight: '1.7', maxWidth: '760px' }}>
                Keep your availability in sync across all platforms. Import calendars from Airbnb or Booking.com to block those dates here automatically. Export your calendar link to paste into other platforms.
              </p>
            </div>

            {(apiProperties || []).map(property => {
              const exportUrl = getICalExportUrl(property.id)
              const propLinks = icalLinks[property.id] || []
              const input = icalInputs[property.id] || { name: '', url: '' }
              const thumbSrc = property.images?.find(i => i.is_primary)?.image_url || property.images?.[0]?.image_url
              return (
                <div key={property.id} style={{ ...cardStyle, marginBottom: '16px', boxShadow: '0 8px 24px rgba(26,26,26,0.04)' }}>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
                    {thumbSrc
                      ? <Image src={thumbSrc} alt={property.name} width={60} height={45} style={{ width: '60px', height: '45px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                      : <div style={{ width: 60, height: 45, borderRadius: 8, backgroundColor: 'var(--color-bg-card)', flexShrink: 0 }} />
                    }
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>{property.name}</h3>
                      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{property.city}, {property.state}</p>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    {/* Export */}
                    <div style={{ padding: '20px', backgroundColor: '#f0f7f0', border: '1px solid #C8E6C9', borderRadius: '12px' }}>
                      <h4 style={{ fontSize: '13px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#2E7D32', marginBottom: '8px', fontWeight: '700' }}>Export Calendar</h4>
                      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '12px', lineHeight: '1.5' }}>
                        Copy this link and paste it into Airbnb, Booking.com or any other platform to sync your availability.
                      </p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <input readOnly value={exportUrl} style={{ flex: 1, padding: '10px 12px', border: '1px solid #C8E6C9', borderRadius: '8px', fontSize: '12px', color: 'var(--color-text-secondary)', backgroundColor: '#ffffff', outline: 'none' }} />
                        <button
                          onClick={() => handleCopyIcal(property.id, exportUrl)}
                          style={{ padding: '10px 16px', backgroundColor: icalCopied[property.id] ? '#4CAF50' : '#2E7D32', color: '#ffffff', border: 'none', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: '700', borderRadius: '8px', transition: 'background 0.3s' }}
                        >{icalCopied[property.id] ? <><Check size={13} style={{ display: 'inline', marginRight: '4px' }} />Copied!</> : 'Copy'}</button>
                      </div>
                    </div>

                    {/* Import */}
                    <div style={{ padding: '20px', backgroundColor: '#E3F2FD', border: '1px solid #BBDEFB', borderRadius: '12px' }}>
                      <h4 style={{ fontSize: '13px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1565C0', marginBottom: '8px', fontWeight: '700' }}>Import Calendar</h4>
                      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '12px', lineHeight: '1.5' }}>
                        Paste a calendar link from Airbnb or Booking.com to automatically block those dates here.
                      </p>
                      <input
                        placeholder="Name (e.g. Airbnb)"
                        value={input.name}
                        onChange={e => setIcalInputs(prev => ({ ...prev, [property.id]: { ...input, name: e.target.value } }))}
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #BBDEFB', borderRadius: '8px', fontSize: '12px', backgroundColor: '#ffffff', outline: 'none', marginBottom: '8px', boxSizing: 'border-box' }}
                      />
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <input
                          placeholder="Paste .ics URL here..."
                          value={input.url}
                          onChange={e => setIcalInputs(prev => ({ ...prev, [property.id]: { ...input, url: e.target.value } }))}
                          style={{ flex: 1, padding: '10px 12px', border: '1px solid #BBDEFB', borderRadius: '8px', fontSize: '12px', color: 'var(--color-text-secondary)', backgroundColor: '#ffffff', outline: 'none' }}
                        />
                        <button
                          disabled={!input.url?.trim() || icalSaving[property.id]}
                          onClick={() => handleIcalSync(property.id)}
                          style={{ padding: '10px 16px', backgroundColor: '#1565C0', color: '#ffffff', border: 'none', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: '700', borderRadius: '8px', opacity: !input.url?.trim() ? 0.5 : 1 }}
                        >{icalSaving[property.id] ? 'Saving…' : 'Sync'}</button>
                      </div>
                    </div>
                  </div>

                  {/* Connected Calendars */}
                  <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9f8f5', border: '1px solid var(--color-border)', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <p style={{ fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', margin: 0 }}>Connected Calendars</p>
                      {propLinks.some(l => l.direction === 'import') && (
                        <button
                          disabled={icalSaving[property.id]}
                          onClick={() => handleManualSync(property.id)}
                          style={{ padding: '4px 10px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', color: '#1565C0', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <RefreshCw size={11} className={icalSaving[property.id] ? 'animate-spin' : ''} />
                          {icalSaving[property.id] ? 'Syncing…' : 'Sync All'}
                        </button>
                      )}
                    </div>
                    {propLinks.length === 0 ? (
                      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>No calendars connected yet. Paste an import link above to get started.</p>
                    ) : (
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {propLinks.map(link => (
                          <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '999px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: link.direction === 'import' ? '#1565C0' : '#2E7D32' }} />
                            <span style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '600' }}>{link.calendar_name}</span>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{link.direction}</span>
                            {link.last_synced && <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>· synced {new Date(link.last_synced).toLocaleDateString('en-IN')}</span>}
                            <button onClick={() => handleIcalDelete(property.id, link.id)} style={{ background: 'none', border: 'none', color: '#C62828', cursor: 'pointer', fontSize: '15px', lineHeight: 1, fontWeight: '700', padding: '0 2px' }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Events Tab */}
        {activeTab === 'events' && (
          <div>
            <div style={{ ...cardStyle, marginBottom: '24px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '8px' }}>Event Inquiry Requests</h2>
              <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-gold)', marginBottom: '16px' }} />
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', lineHeight: '1.7', maxWidth: '760px' }}>
                View and manage wedding, corporate, and private event requests submitted by guests.
              </p>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                placeholder="Search by name, email, property, city..."
                value={eventsSearch}
                onChange={e => handleEventsSearch(e.target.value)}
                style={{
                  padding: '12px 16px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  flex: 1,
                  minWidth: '240px',
                }}
              />
              <select
                value={eventsStatusFilter}
                onChange={e => handleEventsStatusFilter(e.target.value)}
                style={{
                  padding: '12px 16px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#ffffff',
                  outline: 'none',
                  minWidth: '160px',
                }}
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="contacted">Contacted</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* List */}
            {eventsLoading ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
              </div>
            ) : events.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '64px 24px', color: 'var(--color-text-muted)' }}>
                <p style={{ fontSize: '16px' }}>No event inquiries found matching filters.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {events.map(ev => (
                  <div key={ev.id} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <span style={{
                          backgroundColor: ev.nature_of_event === 'Wedding' ? '#FCE4EC' : ev.nature_of_event === 'Corporate' ? '#E8EAF6' : '#F5F5F5',
                          color: ev.nature_of_event === 'Wedding' ? '#C2185B' : ev.nature_of_event === 'Corporate' ? '#3F51B5' : '#616161',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          borderRadius: '4px',
                          letterSpacing: '0.5px',
                        }}>
                          {ev.nature_of_event}
                        </span>
                        <h3 style={{ fontSize: '18px', fontWeight: '800', marginTop: '8px', color: 'var(--color-text-primary)' }}>
                          {ev.name}
                        </h3>
                        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <Mail size={13} style={{ color: 'var(--color-gold)' }} /> {ev.email} &bull; <Phone size={13} style={{ color: 'var(--color-gold)' }} /> {ev.phone}
                        </p>
                      </div>

                      {/* Status badges & actions */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{
                          backgroundColor:
                            ev.status === 'confirmed' ? '#E8F5E9' :
                            ev.status === 'contacted' ? '#E3F2FD' :
                            ev.status === 'pending' ? '#FFF8E7' : '#FFEBEE',
                          color:
                            ev.status === 'confirmed' ? '#2E7D32' :
                            ev.status === 'contacted' ? '#1565C0' :
                            ev.status === 'pending' ? '#F57F17' : '#C62828',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: '700',
                          borderRadius: '6px',
                          textTransform: 'capitalize',
                        }}>
                          {ev.status}
                        </span>

                        {ev.status !== 'confirmed' && ev.status !== 'cancelled' && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {ev.status === 'pending' && (
                              <button
                                onClick={() => handleUpdateEventStatus(ev.id, 'contacted')}
                                style={{ ...buttonStyle, padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}
                              >
                                Mark Contacted
                              </button>
                            )}
                            <button
                              onClick={() => handleUpdateEventStatus(ev.id, 'confirmed')}
                              style={{ ...buttonStyle, padding: '6px 12px', fontSize: '12px', cursor: 'pointer', backgroundColor: 'var(--color-gold)', border: 'none', fontWeight: '700' }}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => handleUpdateEventStatus(ev.id, 'cancelled')}
                              style={{ ...buttonStyle, padding: '6px 12px', fontSize: '12px', cursor: 'pointer', borderColor: '#C62828', color: '#C62828' }}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                      <div>
                        <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '2px', fontWeight: '600' }}>Destination / Property</p>
                        <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>{ev.destination} - {ev.hotel}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '2px', fontWeight: '600' }}>Dates</p>
                        <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{formatDate(ev.event_start_date)} to {formatDate(ev.event_end_date)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '2px', fontWeight: '600' }}>Guests / Rooms</p>
                        <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <Users size={14} style={{ color: 'var(--color-text-muted)' }} /> {ev.no_of_guests} guests {ev.requires_rooms ? <><Bed size={14} style={{ color: 'var(--color-text-muted)', marginLeft: '4px' }} /> {ev.no_of_rooms} rooms</> : '(No rooms)'}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '2px', fontWeight: '600' }}>Submitted On</p>
                        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{formatDate(ev.created_at)}</p>
                      </div>
                    </div>

                    {ev.additional_details && (
                      <div style={{ backgroundColor: 'var(--color-bg-soft)', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: 'var(--color-text-secondary)', borderLeft: '3px solid var(--color-gold)' }}>
                        <p style={{ fontWeight: '600', marginBottom: '4px', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Additional Details</p>
                        <p style={{ whiteSpace: 'pre-line' }}>{ev.additional_details}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Articles / Blog Tab */}
        {activeTab === 'articles' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                  Articles & Journal
                </h2>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', margin: 0 }}>
                  Publish stories, destination guides, and lifestyle blog posts with Markdown support.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '260px' }}>
                  <input
                    type="text"
                    placeholder="Search articles…"
                    value={searchArticle}
                    onChange={e => {
                      setSearchArticle(e.target.value)
                      void loadArticles(1, e.target.value)
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      backgroundColor: '#ffffff',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>
                <button
                  onClick={openNewArticleModal}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 20px',
                    backgroundColor: 'var(--color-gold)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={16} /> Write New Article
                </button>
              </div>
            </div>

            {/* Articles List */}
            {articlesLoading ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading articles…</p>
              </div>
            ) : adminArticles.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '60px 24px' }}>
                <BookOpen size={48} style={{ color: 'var(--color-gold)', margin: '0 auto 16px', opacity: 0.7 }} />
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                  No Articles Yet
                </h3>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '24px', maxWidth: '420px', margin: '0 auto 24px' }}>
                  {searchArticle ? 'No articles matched your search term.' : 'Write your first blog post or travel story to inspire guests and boost SEO!'}
                </p>
                <button
                  onClick={openNewArticleModal}
                  style={{
                    padding: '10px 22px',
                    backgroundColor: 'var(--color-gold)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  + Write Article Now
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {adminArticles.map(art => (
                  <div
                    key={art.id}
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid var(--color-border)',
                      borderRadius: '12px',
                      padding: '20px 24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '20px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: '280px' }}>
                      {art.cover_image_url ? (
                        <div style={{ position: 'relative', width: '80px', height: '60px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, backgroundColor: 'var(--color-bg-soft)' }}>
                          <Image src={art.cover_image_url} alt={art.title} fill style={{ objectFit: 'cover' }} unoptimized />
                        </div>
                      ) : (
                        <div style={{ width: '80px', height: '60px', borderRadius: '8px', backgroundColor: 'var(--color-navbar)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-gold)', flexShrink: 0 }}>
                          <FileText size={24} />
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                            {art.title}
                          </h3>
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              fontWeight: 700,
                              backgroundColor: art.is_published ? '#E8F5E9' : '#FFF3E0',
                              color: art.is_published ? '#2E7D32' : '#E65100',
                            }}
                          >
                            {art.is_published ? 'Published' : 'Draft'}
                          </span>
                        </div>

                        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '500px' }}>
                          {art.excerpt || art.content.slice(0, 100) + '…'}
                        </p>

                        <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span>By {art.author_name}</span>
                          <span>•</span>
                          <span>{new Date(art.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          <span>•</span>
                          <span>{art.read_time_minutes} min read</span>
                          <span>•</span>
                          <span style={{ fontFamily: 'monospace', color: 'var(--color-gold)' }}>/articles/{art.slug}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <Link
                        href={`/articles/${art.slug}`}
                        target="_blank"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          backgroundColor: '#ffffff',
                          color: 'var(--color-text-primary)',
                          fontSize: '12px',
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        <Eye size={13} /> View
                      </Link>
                      <button
                        onClick={() => openEditArticleModal(art)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          backgroundColor: '#ffffff',
                          color: 'var(--color-text-primary)',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <Edit3 size={13} /> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteArticle(art.id, art.title)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: '1px solid #FFCDD2',
                          backgroundColor: '#FFEBEE',
                          color: '#C62828',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* In-App Confirmation / Alert Modal */}
      {confirmModal.isOpen && (
        <div
          onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            backgroundColor: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff', borderRadius: '16px', maxWidth: '440px', width: '100%',
              padding: '28px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', border: '1px solid var(--color-border)',
              animation: 'editorSlideIn 0.2s ease-out'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0 }}>
                {confirmModal.title}
              </h3>
              <button
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--color-text-muted)', lineHeight: 1 }}
              >×</button>
            </div>

            {confirmModal.subtitle && (
              <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                {confirmModal.subtitle}
              </p>
            )}

            {confirmModal.description && (
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.5', marginBottom: '24px' }}>
                {confirmModal.description}
              </p>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
              {!confirmModal.isNoticeOnly && (
                <button
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  style={{
                    padding: '9px 18px', border: '1px solid var(--color-border)', borderRadius: '8px',
                    backgroundColor: '#ffffff', color: 'var(--color-text-primary)', fontSize: '13px',
                    fontWeight: '700', cursor: 'pointer'
                  }}
                >
                  {confirmModal.cancelLabel || 'Cancel'}
                </button>
              )}
              <button
                onClick={async () => {
                  const action = confirmModal.onConfirm || confirmModal.onNoticeAction
                  setConfirmModal(prev => ({ ...prev, isOpen: false }))
                  if (action) await action()
                }}
                style={{
                  padding: '9px 18px', border: 'none', borderRadius: '8px',
                  backgroundColor: confirmModal.isDanger ? '#C62828' : 'var(--color-gold)',
                  color: '#ffffff', fontSize: '13px', fontWeight: '800', cursor: 'pointer'
                }}
              >
                {confirmModal.confirmLabel || confirmModal.noticeActionLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Calendar Modal — opened by clicking the Calendar button on any property card */}
      {calendarProperty && (
        <CalendarModal
          propertyId={calendarProperty.id}
          propertyName={calendarProperty.name}
          onClose={() => setCalendarProperty(null)}
          fetchWithAuth={fetchWithAuth}
        />
      )}

      {/* Article Create / Edit Modal with Markdown Editor */}
      {isArticleModalOpen && (
        <div
          onClick={() => setIsArticleModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1050,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            overflowY: 'auto',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '940px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
              overflow: 'hidden',
              border: '1px solid var(--color-border)',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'var(--color-navbar)',
              }}
            >
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                  {editingArticle ? 'Edit Article' : 'Write New Article'}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                  Write your story with Markdown formatting and preview live.
                </p>
              </div>
              <button
                onClick={() => setIsArticleModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '22px',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {articleError && (
                <div style={{ padding: '10px 14px', backgroundColor: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: '8px', color: '#C62828', fontSize: '13px', marginBottom: '16px', fontWeight: 600 }}>
                  {articleError}
                </div>
              )}
              {articleSuccess && (
                <div style={{ padding: '10px 14px', backgroundColor: '#E8F5E9', border: '1px solid #C8E6C9', borderRadius: '8px', color: '#2E7D32', fontSize: '13px', marginBottom: '16px', fontWeight: 600 }}>
                  {articleSuccess}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px' }}>
                    Article Title *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Hidden Waterfalls of South Goa"
                    value={articleForm.title}
                    onChange={e => setArticleForm(f => ({ ...f, title: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px' }}>
                    URL Slug (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. hidden-waterfalls-south-goa (auto-generated if empty)"
                    value={articleForm.slug}
                    onChange={e => setArticleForm(f => ({ ...f, slug: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px' }}>
                  Cover Image
                </label>

                {/* Live Preview if cover image exists */}
                {articleForm.cover_image_url ? (
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '200px',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      marginBottom: '10px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-soft)',
                    }}
                  >
                    <Image
                      src={articleForm.cover_image_url}
                      alt="Cover Preview"
                      fill
                      style={{ objectFit: 'cover' }}
                      unoptimized
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '10px',
                        left: '10px',
                        backgroundColor: 'rgba(0,0,0,0.65)',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: '6px',
                        backdropFilter: 'blur(3px)',
                      }}
                    >
                      Cover Preview
                    </div>

                    {/* Quick Action Overlay Buttons */}
                    <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '8px', zIndex: 5 }}>
                      <button
                        type="button"
                        onClick={() => articleFileInputRef.current?.click()}
                        disabled={coverUploading}
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.92)',
                          color: 'var(--color-text-primary)',
                          border: '1px solid rgba(0,0,0,0.1)',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: coverUploading ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                          backdropFilter: 'blur(4px)',
                        }}
                      >
                        <RefreshCw size={12} style={coverUploading ? { animation: 'spin 1s linear infinite' } : {}} />
                        {coverUploading ? 'Uploading…' : 'Change Photo'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setArticleForm(f => ({ ...f, cover_image_url: '' }))}
                        style={{
                          backgroundColor: 'rgba(198,40,40,0.9)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        }}
                      >
                        <Trash2 size={12} />
                        Remove
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Upload or URL Controls */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="url"
                    placeholder="Paste image URL (https://...) or upload directly →"
                    value={articleForm.cover_image_url}
                    onChange={e => setArticleForm(f => ({ ...f, cover_image_url: e.target.value }))}
                    style={{
                      flex: 1,
                      minWidth: '220px',
                      padding: '10px 14px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                  <input
                    ref={articleFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/jpg"
                    onChange={handleCoverFileUpload}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => articleFileInputRef.current?.click()}
                    disabled={coverUploading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 16px',
                      backgroundColor: 'var(--color-navbar)',
                      border: '1px solid var(--color-gold)',
                      borderRadius: '8px',
                      color: 'var(--color-text-primary)',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: coverUploading ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                      opacity: coverUploading ? 0.7 : 1,
                    }}
                  >
                    {coverUploading ? (
                      <>
                        <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <Upload size={14} style={{ color: 'var(--color-gold)' }} />
                        {articleForm.cover_image_url ? 'Upload New Photo' : 'Upload Photo'}
                      </>
                    )}
                  </button>
                </div>
                {coverUploadError && (
                  <p style={{ fontSize: '12px', color: '#C62828', marginTop: '6px', fontWeight: 600 }}>
                    {coverUploadError}
                  </p>
                )}
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  Supports WebP, JPG, PNG up to 10MB. Images are automatically optimized and served via CDN.
                </p>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px' }}>
                  Short Excerpt / Summary
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief description shown in article card listings..."
                  value={articleForm.excerpt}
                  onChange={e => setArticleForm(f => ({ ...f, excerpt: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px' }}>
                    Author Name
                  </label>
                  <input
                    type="text"
                    value={articleForm.author_name}
                    onChange={e => setArticleForm(f => ({ ...f, author_name: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px' }}>
                    Est. Read Time (Minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={articleForm.read_time_minutes}
                    onChange={e => setArticleForm(f => ({ ...f, read_time_minutes: parseInt(e.target.value) || 3 }))}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px' }}>
                    Tags (comma separated)
                  </label>
                  <input
                    type="text"
                    placeholder="Travel, Goa, Retreat, Nature"
                    value={articleForm.tags}
                    onChange={e => setArticleForm(f => ({ ...f, tags: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px' }}>
                    Publication Status
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={articleForm.is_published}
                      onChange={e => setArticleForm(f => ({ ...f, is_published: e.target.checked }))}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    {articleForm.is_published ? 'Published (Live)' : 'Draft'}
                  </label>
                </div>
              </div>

              {/* Markdown Editor */}
              <div style={{ border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--color-bg-soft)', borderBottom: '1px solid var(--color-border)', padding: '6px 12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setArticleEditorTab('write')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: articleEditorTab === 'write' ? '#ffffff' : 'transparent',
                        color: articleEditorTab === 'write' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: articleEditorTab === 'write' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      ✍️ Write
                    </button>
                    <button
                      type="button"
                      onClick={() => setArticleEditorTab('preview')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: articleEditorTab === 'preview' ? '#ffffff' : 'transparent',
                        color: articleEditorTab === 'preview' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: articleEditorTab === 'preview' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      👁️ Preview
                    </button>
                  </div>

                  {articleEditorTab === 'write' && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {[
                        { label: 'B', tip: 'Bold', action: () => insertMarkdown('**', '**') },
                        { label: 'I', tip: 'Italic', action: () => insertMarkdown('*', '*') },
                        { label: 'H2', tip: 'Heading 2', action: () => insertMarkdown('\n## ') },
                        { label: 'H3', tip: 'Heading 3', action: () => insertMarkdown('\n### ') },
                        { label: '“ ”', tip: 'Quote', action: () => insertMarkdown('\n> ') },
                        { label: '• List', tip: 'Bullet List', action: () => insertMarkdown('\n- ') },
                        { label: '1. List', tip: 'Numbered List', action: () => insertMarkdown('\n1. ') },
                        { label: '🔗 Link', tip: 'Link', action: () => insertMarkdown('[Title](', ')') },
                        { label: '🖼️ Image', tip: 'Image', action: () => insertMarkdown('![Alt](', ')') },
                        { label: '< >', tip: 'Code block', action: () => insertMarkdown('\n```\n', '\n```\n') },
                      ].map(tool => (
                        <button
                          key={tool.tip}
                          type="button"
                          title={tool.tip}
                          onClick={tool.action}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#ffffff',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          {tool.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {articleEditorTab === 'write' ? (
                  <textarea
                    id="article-content-textarea"
                    rows={15}
                    placeholder="Write your article in Markdown here... Use ## for headings, **bold** text, > quotes, and images."
                    value={articleForm.content}
                    onChange={e => setArticleForm(f => ({ ...f, content: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '16px',
                      border: 'none',
                      outline: 'none',
                      fontSize: '14px',
                      lineHeight: '1.65',
                      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                      resize: 'vertical',
                      backgroundColor: '#ffffff',
                    }}
                  />
                ) : (
                  <div style={{ padding: '24px', minHeight: '320px', backgroundColor: '#fafafa', overflowY: 'auto' }}>
                    {articleForm.content.trim() ? (
                      <MarkdownRenderer content={articleForm.content} />
                    ) : (
                      <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                        Nothing to preview yet. Switch to the Write tab to draft your content.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '12px',
                backgroundColor: 'var(--color-navbar)',
              }}
            >
              <button
                type="button"
                onClick={() => setIsArticleModalOpen(false)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: '#ffffff',
                  color: 'var(--color-text-primary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveArticle}
                disabled={articleSaving}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: 'var(--color-gold)',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: articleSaving ? 'not-allowed' : 'pointer',
                  opacity: articleSaving ? 0.7 : 1,
                }}
              >
                {articleSaving ? 'Saving…' : editingArticle ? 'Update Article' : 'Publish Article'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual Property Reviews Modal */}
      {reviewProperty && (
        <div
          onClick={() => setReviewProperty(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              border: '1px solid var(--color-border)',
            }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--color-navbar)' }}>
              <div>
                <p style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-gold)', fontWeight: '700', marginBottom: '2px' }}>
                  Property Reviews
                </p>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0 }}>
                  {reviewProperty.name}
                </h3>
              </div>
              <button
                onClick={() => setReviewProperty(null)}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--color-text-muted)', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {reviewModalError && (
                <div style={{ padding: '10px 14px', backgroundColor: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: '8px', color: '#C62828', fontSize: '13px', fontWeight: '600' }}>
                  {reviewModalError}
                </div>
              )}

              {/* Add Review Form */}
              <div style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '18px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '14px' }}>
                  + Add Review for {reviewProperty.name}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block', fontWeight: '700' }}>Guest Name *</label>
                    <input
                      value={newReview.guest_name}
                      onChange={e => setNewReview(r => ({ ...r, guest_name: e.target.value }))}
                      placeholder="e.g. Sarah Jenkins"
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', outline: 'none', backgroundColor: '#fff', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block', fontWeight: '700' }}>Platform</label>
                    <input
                      value={newReview.platform}
                      onChange={e => setNewReview(r => ({ ...r, platform: e.target.value }))}
                      placeholder="Airbnb / Google / Direct"
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', outline: 'none', backgroundColor: '#fff', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block', fontWeight: '700' }}>Rating</label>
                    <select
                      value={newReview.rating}
                      onChange={e => setNewReview(r => ({ ...r, rating: parseInt(e.target.value) }))}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', outline: 'none', backgroundColor: '#fff', cursor: 'pointer', boxSizing: 'border-box' }}
                    >
                      {[5, 4, 3, 2, 1].map(n => (
                        <option key={n} value={n}>{'★'.repeat(n)} ({n}/5)</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block', fontWeight: '700' }}>Guest Feedback</label>
                  <textarea
                    value={newReview.comment}
                    onChange={e => setNewReview(r => ({ ...r, comment: e.target.value }))}
                    rows={3}
                    placeholder="What did the guest say about their stay?"
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', outline: 'none', backgroundColor: '#fff', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>
                <button
                  disabled={addingReview || !newReview.guest_name.trim()}
                  onClick={() => handleAddReview(reviewProperty.id)}
                  style={{
                    padding: '10px 22px',
                    backgroundColor: addingReview || !newReview.guest_name.trim() ? 'var(--color-bg-soft)' : 'var(--color-gold)',
                    color: addingReview || !newReview.guest_name.trim() ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '800',
                    cursor: addingReview || !newReview.guest_name.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {addingReview ? 'Adding…' : '+ Add Review'}
                </button>
              </div>

              {/* Existing Reviews List */}
              <div>
                <h4 style={{ fontSize: '13px', letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', marginBottom: '12px' }}>
                  Existing Reviews ({propertyReviews.length})
                </h4>

                {reviewsLoading ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Loading reviews…</p>
                ) : propertyReviews.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px', backgroundColor: 'var(--color-bg-soft)', borderRadius: '10px', border: '1px dashed var(--color-border)' }}>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)', marginBottom: '4px' }}>No reviews yet</p>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>Add the first review using the form above.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {propertyReviews.map(review => (
                      <div key={review.id} style={{ padding: '14px 16px', backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                        {editingReviewId === review.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <input value={editReviewForm.guest_name} onChange={e => setEditReviewForm(f => ({ ...f, guest_name: e.target.value }))} placeholder="Guest name" style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '13px', outline: 'none' }} />
                              <input value={editReviewForm.platform} onChange={e => setEditReviewForm(f => ({ ...f, platform: e.target.value }))} placeholder="Platform" style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '13px', outline: 'none' }} />
                            </div>
                            <select value={editReviewForm.rating} onChange={e => setEditReviewForm(f => ({ ...f, rating: parseInt(e.target.value) }))} style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '13px', outline: 'none', backgroundColor: '#fff', cursor: 'pointer' }}>
                              {[5,4,3,2,1].map(n => <option key={n} value={n}>{'★'.repeat(n)} ({n}/5)</option>)}
                            </select>
                            <textarea value={editReviewForm.comment} onChange={e => setEditReviewForm(f => ({ ...f, comment: e.target.value }))} rows={3} placeholder="Comment" style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '13px', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => handleUpdateReview(review.id, reviewProperty.id)} style={{ padding: '7px 14px', backgroundColor: 'var(--color-gold)', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>Save</button>
                              <button onClick={() => setEditingReviewId(null)} style={{ padding: '7px 14px', backgroundColor: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', margin: 0 }}>{review.guest_name}</p>
                                {review.platform && <span style={{ fontSize: '11px', backgroundColor: '#E3F2FD', color: '#1565C0', padding: '2px 8px', borderRadius: '999px', fontWeight: '700' }}>{review.platform}</span>}
                                <span style={{ display: 'inline-flex', gap: '1px' }}>
                                  {Array.from({ length: review.rating }).map((_, i) => <Star key={i} size={13} fill="currentColor" color="var(--color-gold)" />)}
                                </span>
                              </div>
                              {review.comment && <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.5', margin: '4px 0 0' }}>{review.comment}</p>}
                              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '6px', margin: 0 }}>{new Date(review.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                              <button onClick={() => { setEditingReviewId(review.id); setEditReviewForm({ guest_name: review.guest_name, rating: review.rating, comment: review.comment ?? '', platform: review.platform ?? '' }) }} style={{ padding: '6px 12px', backgroundColor: '#E3F2FD', border: '1px solid #BBDEFB', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', color: '#1565C0' }}>Edit</button>
                              <button onClick={() => handleDeleteReview(review.id, reviewProperty.id)} style={{ padding: '6px 12px', backgroundColor: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', color: '#C62828' }}>Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
