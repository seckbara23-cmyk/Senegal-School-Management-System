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
    // ── Announcements (per-announcement detail pages, Phase 36.7) ─────────────
    case 'announcement_published': {
      const annId = meta(m, 'announcement_id')
      switch (role) {
        case 'school_admin': return annId ? `/school/announcements/${annId}`  : '/school/announcements'
        case 'teacher':      return annId ? `/teacher/announcements/${annId}` : '/teacher/announcements'
        case 'parent':       return annId ? `/parent/announcements/${annId}`  : '/parent/announcements'
        case 'student':      return annId ? `/student/announcements/${annId}` : '/student/announcements'
        default:             return FALLBACK
      }
    }

    // ── Invoices (created / overdue) ──────────────────────────────────────────
    case 'invoice_created':
    case 'invoice_overdue': {
      const invoiceId = meta(m, 'invoice_id')
      switch (role) {
        case 'school_admin': return invoiceId ? `/school/finance/invoices/${invoiceId}`  : '/school/finance/invoices'
        case 'parent':       return invoiceId ? `/parent/finance/invoices/${invoiceId}`  : '/parent/finance'
        case 'student':      return invoiceId ? `/student/finance/invoices/${invoiceId}` : '/student/finance'
        default:             return FALLBACK
      }
    }

    // ── Payment recorded (recipients: school_admin + finance_officer) ──────────
    case 'payment_recorded': {
      const paymentId = meta(m, 'payment_id')
      switch (role) {
        case 'school_admin':    return paymentId ? `/school/finance/payments/${paymentId}`          : '/school/finance/payments'
        case 'finance_officer': return paymentId ? `/finance-officer/payments/${paymentId}`         : '/finance-officer/payments'
        default:                return FALLBACK
      }
    }

    // ── Attendance recorded (recipients: parent + student) ────────────────────
    case 'attendance_recorded': {
      const sessionId = meta(m, 'attendance_session_id')
      switch (role) {
        case 'school_admin': return sessionId ? `/school/attendance/${sessionId}`  : '/school/attendance'
        case 'teacher':      return sessionId ? `/teacher/attendance/${sessionId}` : '/teacher/attendance'
        case 'parent':       return sessionId ? `/parent/attendance/${sessionId}`  : '/parent/attendance'
        case 'student':      return sessionId ? `/student/attendance/${sessionId}` : '/student/attendance'
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

    // ── Timetable changes — portal timetable views (no per-slot page) ─────────
    case 'timetable_created':
    case 'timetable_updated':
    case 'timetable_deleted':
      switch (role) {
        case 'school_admin': return '/school/timetable'
        case 'teacher':      return '/teacher/timetable'
        case 'parent':       return '/parent/timetable'
        case 'student':      return '/student/timetable'
        default:             return FALLBACK
      }

    // ── Exam results published (recipients: student + parents) ────────────────
    case 'exam_results_published': {
      const sessionId = meta(m, 'exam_session_id')
      switch (role) {
        case 'school_admin': return sessionId ? `/school/exams/${sessionId}/results` : '/school/exams'
        case 'parent':       return '/parent/exams'
        case 'student':      return sessionId ? `/student/exams/${sessionId}` : '/student/exams'
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

    // ── Homework assigned (recipients: parent + student) ─────────────────────
    case 'homework_assigned':
      switch (role) {
        case 'teacher': return '/teacher/homework'
        case 'parent':  return '/parent/homework'
        case 'student': return '/student/homework'
        default:        return FALLBACK
      }

    // ── Payment reminder (recipients: parent + student) ─────────────────────
    case 'invoice_reminder': {
      const invoiceId = meta(m, 'invoice_id')
      switch (role) {
        case 'parent':  return invoiceId ? `/parent/finance/invoices/${invoiceId}`  : '/parent/finance'
        case 'student': return invoiceId ? `/student/finance/invoices/${invoiceId}` : '/student/finance'
        default:        return FALLBACK
      }
    }

    // ── New message (parent ↔ teacher) ───────────────────────────────────────
    case 'message_received': {
      const threadId = meta(m, 'thread_id')
      switch (role) {
        case 'teacher': return threadId ? `/teacher/messages/${threadId}` : '/teacher/messages'
        case 'parent':  return threadId ? `/parent/messages/${threadId}`  : '/parent/messages'
        default:        return FALLBACK
      }
    }

    default:
      return FALLBACK
  }
}
