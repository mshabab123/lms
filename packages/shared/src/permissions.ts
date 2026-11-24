/**
 * Permission catalogue. Permissions are code constants; roles are database rows
 * that group permissions (seeded from DEFAULT_ROLES and editable in the admin UI).
 * The API is the enforcement point: every route declares one of these.
 */
export const PERMISSIONS = {
  // Identity & administration
  USER_READ: 'user.read',
  USER_WRITE: 'user.write',
  USER_DISABLE: 'user.disable',
  ROLE_READ: 'role.read',
  ROLE_WRITE: 'role.write',
  SETTING_READ: 'setting.read',
  SETTING_WRITE: 'setting.write',
  INTEGRATION_READ: 'integration.read',
  INTEGRATION_WRITE: 'integration.write',
  AUDIT_READ: 'audit.read',
  AUDIT_EXPORT: 'audit.export',
  MFA_RESET: 'mfa.reset',

  // Catalog
  PROGRAM_READ: 'program.read',
  PROGRAM_WRITE: 'program.write',
  PROGRAM_PUBLISH: 'program.publish',
  PROGRAM_MARKETING_EDIT: 'program.marketing_edit',

  // Delivery
  SECTION_READ: 'section.read',
  SECTION_WRITE: 'section.write',
  SESSION_READ: 'session.read',
  SESSION_HOST: 'session.host',
  SESSION_ATTEND: 'session.attend',
  RECORDING_MANAGE: 'recording.manage',

  // Enrollment
  ENROLLMENT_SELF: 'enrollment.self',
  ENROLLMENT_READ: 'enrollment.read',
  ENROLLMENT_MANAGE: 'enrollment.manage',
  ENROLLMENT_TRANSFER: 'enrollment.transfer',
  ROSTER_EXPORT: 'roster.export',

  // Content
  CONTENT_READ: 'content.read',
  CONTENT_WRITE: 'content.write',

  // Assessment & grades
  ASSESSMENT_TAKE: 'assessment.take',
  ASSESSMENT_WRITE: 'assessment.write',
  GRADE_READ_OWN: 'grade.read_own',
  GRADE_READ: 'grade.read',
  GRADE_WRITE: 'grade.write',
  GRADE_APPROVE: 'grade.approve',
  GRADE_AMEND: 'grade.amend',
  GRADE_APPEAL_SELF: 'grade_appeal.self',
  GRADE_APPEAL_RESOLVE: 'grade_appeal.resolve',

  // Attendance
  ATTENDANCE_READ_OWN: 'attendance.read_own',
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_CORRECT_REQUEST: 'attendance.correct_request',
  ATTENDANCE_CORRECT_APPROVE: 'attendance.correct_approve',

  // Completion & certificates
  COMPLETION_READ: 'completion.read',
  CERTIFICATE_READ_OWN: 'certificate.read_own',
  CERTIFICATE_READ: 'certificate.read',
  CERTIFICATE_APPROVE: 'certificate.approve',
  CERTIFICATE_REVOKE: 'certificate.revoke',

  // Commerce & finance
  ORDER_SELF: 'order.self',
  INVOICE_READ_OWN: 'invoice.read_own',
  PAYMENT_READ: 'payment.read',
  PAYMENT_RECONCILE: 'payment.reconcile',
  BANK_TRANSFER_RECORD: 'bank_transfer.record',
  INVOICE_READ: 'invoice.read',
  CREDIT_NOTE_ISSUE: 'credit_note.issue',
  REFUND_REQUEST: 'refund.request',
  REFUND_APPROVE: 'refund.approve',
  PRICE_WRITE: 'price.write',
  FINANCE_REPORT: 'finance.report',
  FINANCE_EXPORT: 'finance.export',
  DISCOUNT_EXCEPTION_APPROVE: 'discount_exception.approve',

  // Marketing
  COUPON_DRAFT: 'coupon.draft',
  COUPON_APPROVE: 'coupon.approve',
  LEAD_MANAGE: 'lead.manage',
  CAMPAIGN_DRAFT: 'campaign.draft',
  CAMPAIGN_SEND: 'campaign.send',
  MARKETING_STATS: 'marketing.stats',

  // Support
  TICKET_SELF: 'ticket.self',
  TICKET_MANAGE: 'ticket.manage',
  ACCOUNT_STATUS_READ: 'account_status.read',

  // Reporting & compliance
  DASHBOARD_EXECUTIVE: 'dashboard.executive',
  REPORT_READ: 'report.read',
  PRIVACY_REQUEST_SELF: 'privacy_request.self',
  PRIVACY_REQUEST_MANAGE: 'privacy_request.manage',
  BREACH_MANAGE: 'breach.manage',
  PROCESSING_RECORD_MANAGE: 'processing_record.manage',
  SECURITY_REPORT_READ: 'security_report.read',
  SURVEY_SELF: 'survey.self',

  // Sponsor
  SPONSOR_ENROLL: 'sponsor.enroll',
  SPONSOR_READ: 'sponsor.read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

export const ROLE_KEYS = {
  TRAINEE: 'trainee',
  INSTRUCTOR: 'instructor',
  PROGRAM_COORDINATOR: 'program_coordinator',
  ADMISSIONS_OFFICER: 'admissions_officer',
  MARKETING_OFFICER: 'marketing_officer',
  MARKETING_MANAGER: 'marketing_manager',
  FINANCE_OFFICER: 'finance_officer',
  FINANCE_MANAGER: 'finance_manager',
  SUPPORT_AGENT: 'support_agent',
  EXECUTIVE: 'executive',
  COMPLIANCE_OFFICER: 'compliance_officer',
  SYSTEM_ADMIN: 'system_admin',
  CORPORATE_SPONSOR: 'corporate_sponsor',
} as const;
export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

export interface DefaultRole {
  key: RoleKey;
  nameAr: string;
  nameEn: string;
  /** Staff roles require MFA and individual accounts. */
  isStaff: boolean;
  permissions: readonly Permission[];
}

const P = PERMISSIONS;

const TRAINEE_PERMS: Permission[] = [
  P.ENROLLMENT_SELF,
  P.ORDER_SELF,
  P.INVOICE_READ_OWN,
  P.SESSION_ATTEND,
  P.CONTENT_READ,
  P.ASSESSMENT_TAKE,
  P.GRADE_READ_OWN,
  P.GRADE_APPEAL_SELF,
  P.ATTENDANCE_READ_OWN,
  P.CERTIFICATE_READ_OWN,
  P.TICKET_SELF,
  P.PRIVACY_REQUEST_SELF,
  P.SURVEY_SELF,
];

const MARKETING_OFFICER_PERMS: Permission[] = [
  P.PROGRAM_READ,
  P.PROGRAM_MARKETING_EDIT,
  P.COUPON_DRAFT,
  P.LEAD_MANAGE,
  P.CAMPAIGN_DRAFT,
  P.MARKETING_STATS,
];

const FINANCE_OFFICER_PERMS: Permission[] = [
  P.PAYMENT_READ,
  P.PAYMENT_RECONCILE,
  P.BANK_TRANSFER_RECORD,
  P.INVOICE_READ,
  P.CREDIT_NOTE_ISSUE,
  P.REFUND_REQUEST,
];

/**
 * Default roles from spec section 4. Executive and compliance roles are read-only
 * by construction: they hold no write permission.
 */
export const DEFAULT_ROLES: readonly DefaultRole[] = [
  {
    key: 'trainee',
    nameAr: 'متدرب',
    nameEn: 'Trainee',
    isStaff: false,
    permissions: TRAINEE_PERMS,
  },
  {
    key: 'instructor',
    nameAr: 'مدرب',
    nameEn: 'Instructor',
    isStaff: true,
    permissions: [
      P.PROGRAM_READ,
      P.SECTION_READ,
      P.SESSION_READ,
      P.SESSION_HOST,
      P.RECORDING_MANAGE,
      P.ENROLLMENT_READ,
      P.CONTENT_READ,
      P.CONTENT_WRITE,
      P.ASSESSMENT_WRITE,
      P.GRADE_READ,
      P.GRADE_WRITE,
      P.ATTENDANCE_READ,
      P.ATTENDANCE_CORRECT_REQUEST,
    ],
  },
  {
    key: 'program_coordinator',
    nameAr: 'منسق البرامج',
    nameEn: 'Program Coordinator',
    isStaff: true,
    permissions: [
      P.PROGRAM_READ,
      P.PROGRAM_WRITE,
      P.PROGRAM_PUBLISH,
      P.SECTION_READ,
      P.SECTION_WRITE,
      P.SESSION_READ,
      P.RECORDING_MANAGE,
      P.ENROLLMENT_READ,
      P.CONTENT_READ,
      P.CONTENT_WRITE,
      P.ASSESSMENT_WRITE,
      P.GRADE_READ,
      P.GRADE_APPROVE,
      P.GRADE_AMEND,
      P.GRADE_APPEAL_RESOLVE,
      P.ATTENDANCE_READ,
      P.ATTENDANCE_CORRECT_APPROVE,
      P.COMPLETION_READ,
      P.CERTIFICATE_READ,
      P.CERTIFICATE_APPROVE,
      P.CERTIFICATE_REVOKE,
      P.REPORT_READ,
    ],
  },
  {
    key: 'admissions_officer',
    nameAr: 'مسؤول القبول',
    nameEn: 'Admissions Officer',
    isStaff: true,
    permissions: [
      P.PROGRAM_READ,
      P.SECTION_READ,
      P.ENROLLMENT_READ,
      P.ENROLLMENT_MANAGE,
      P.ENROLLMENT_TRANSFER,
      P.TICKET_MANAGE,
      P.USER_READ,
    ],
  },
  {
    key: 'marketing_officer',
    nameAr: 'مسؤول التسويق',
    nameEn: 'Marketing Officer',
    isStaff: true,
    permissions: MARKETING_OFFICER_PERMS,
  },
  {
    key: 'marketing_manager',
    nameAr: 'مدير التسويق',
    nameEn: 'Marketing Manager',
    isStaff: true,
    permissions: [...MARKETING_OFFICER_PERMS, P.COUPON_APPROVE, P.CAMPAIGN_SEND],
  },
  {
    key: 'finance_officer',
    nameAr: 'مسؤول مالي',
    nameEn: 'Finance Officer',
    isStaff: true,
    permissions: FINANCE_OFFICER_PERMS,
  },
  {
    key: 'finance_manager',
    nameAr: 'المدير المالي',
    nameEn: 'Finance Manager',
    isStaff: true,
    permissions: [
      ...FINANCE_OFFICER_PERMS,
      P.REFUND_APPROVE,
      P.DISCOUNT_EXCEPTION_APPROVE,
      P.FINANCE_REPORT,
      P.FINANCE_EXPORT,
    ],
  },
  {
    key: 'support_agent',
    nameAr: 'موظف الدعم',
    nameEn: 'Support Agent',
    isStaff: true,
    permissions: [P.TICKET_MANAGE, P.MFA_RESET, P.ACCOUNT_STATUS_READ, P.USER_READ],
  },
  {
    key: 'executive',
    nameAr: 'الإدارة التنفيذية',
    nameEn: 'Executive',
    isStaff: true,
    permissions: [P.DASHBOARD_EXECUTIVE, P.REPORT_READ, P.PROGRAM_READ, P.SECTION_READ],
  },
  {
    key: 'compliance_officer',
    nameAr: 'مسؤول الامتثال والأمن',
    nameEn: 'Compliance and Security Officer',
    isStaff: true,
    permissions: [
      P.AUDIT_READ,
      P.AUDIT_EXPORT,
      P.PRIVACY_REQUEST_MANAGE,
      P.BREACH_MANAGE,
      P.PROCESSING_RECORD_MANAGE,
      P.INTEGRATION_READ,
      P.SECURITY_REPORT_READ,
    ],
  },
  {
    key: 'system_admin',
    nameAr: 'مدير النظام',
    nameEn: 'System Admin',
    isStaff: true,
    permissions: [
      P.USER_READ,
      P.USER_WRITE,
      P.USER_DISABLE,
      P.ROLE_READ,
      P.ROLE_WRITE,
      P.SETTING_READ,
      P.SETTING_WRITE,
      P.INTEGRATION_READ,
      P.INTEGRATION_WRITE,
      P.AUDIT_READ,
      P.MFA_RESET,
      P.ACCOUNT_STATUS_READ,
    ],
  },
  {
    key: 'corporate_sponsor',
    nameAr: 'جهة راعية',
    nameEn: 'Corporate Sponsor',
    isStaff: false,
    permissions: [P.SPONSOR_ENROLL, P.SPONSOR_READ, P.PROGRAM_READ],
  },
];

/** Role assigned to self-registered accounts. */
export const TRAINEE_ROLE_KEY: RoleKey = 'trainee';
