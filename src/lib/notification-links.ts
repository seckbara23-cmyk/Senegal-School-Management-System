// ─── Notification deep-link routing (Phase 36.6) ────────────────────────────
//
// Maps a notification (type + metadata) to the page a given role should land on
// when they click it. Pure and total: it NEVER throws and always returns a
// usable href — when metadata is incomplete or no destination exists for the
// role/type, it falls back to /notifications.

export type NotificationRole =
  | 'school_admin'
  | 'teacher'
  | 'parent'
  | 'student'
  | 'super_admin'
  | 'finance_officer'

export type NotificationLike = {
  type:     string
  metadata: Record<string, unknown> | null
}

const FALLBACK = '/notifications'

// Safe string read from metadata.
function meta(m: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = m?.[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}

export function getNotificationHref(n: NotificationLike, role: NotificationRole): string {
  const m = n.metadata ?? {}

  switch (n.type) {
    // ── Announcements (list pages only — no per-announcement detail page) ──────
    case 'announcement_published':
      switch (role) {
        case 'school_admin': return '/school/announcements'
        case 'teacher':      return '/teacher/announcements'
        case 'parent':       return '/parent/announcements'
        case 'student':      return '/student/announcements'
        default:             return FALLBACK
      }

    // ── Invoices (created / overdue) ──────────────────────────────────────────
    case 'invoice_created':
    case 'invoice_overdue': {
      const invoiceId = meta(m, 'invoice_id')
      switch (role) {
        case 'school_admin': return invoiceId ? `/school/finance/invoices/${invoiceId}` : '/school/finance/invoices'
        case 'parent':       return '/parent/finance'   // no per-invoice detail in parent portal
        case 'student':      return '/student/finance'  // no per-invoice detail in student portal
        default:             return FALLBACK
      }
    }

    // ── Payment recorded (recipients: school_admin + finance_officer) ──────────
    case 'payment_recorded': {
      const paymentId = meta(m, 'payment_id')
      switch (role) {
        case 'school_admin': return paymentId ? `/school/finance/payments/${paymentId}` : '/school/finance/payments'
        // finance_officer has no dedicated portal yet → fallback.
        default:             return FALLBACK
      }
    }

    // ── Attendance recorded (recipients: parent + student) ────────────────────
    case 'attendance_recorded': {
      const sessionId = meta(m, 'attendance_session_id')
      switch (role) {
        case 'school_admin': return sessionId ? `/school/attendance/${sessionId}` : '/school/attendance'
        case 'teacher':      return sessionId ? `/teacher/attendance/${sessionId}` : '/teacher/attendance'
        case 'parent':       return '/parent/attendance'   // list only
        case 'student':      return '/student/attendance'  // list only
        default:             return FALLBACK
      }
    }

    // ── Assessment created (recipients: student + parents) ────────────────────
    case 'assessment_created': {
      const assessmentId = meta(m, 'assessment_id')
      switch (role) {
        case 'school_admin': return assessmentId ? `/school/academics/assessments/${assessmentId}` : '/school/academics/assessments'
        case 'teacher':      return assessmentId ? `/teacher/grades/${assessmentId}` : '/teacher/grades'
        case 'parent':       return '/parent/bulletins'   // closest view (grades), no assessment page
        case 'student':      return '/student/bulletins'
        default:             return FALLBACK
      }
    }

    // ── Bulletin published (future — no publish workflow yet) ─────────────────
    case 'bulletin_published': {
      const studentId = meta(m, 'student_id')
      switch (role) {
        case 'school_admin': return studentId ? `/school/academics/bulletins/${studentId}` : '/school/academics/bulletins'
        case 'parent':       return '/parent/bulletins'
        case 'student':      return '/student/bulletins'
        default:             return FALLBACK
      }
    }

    default:
      return FALLBACK
  }
}
