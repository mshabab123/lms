import type { Locale } from '@mzn/shared';

type TemplateKey =
  'verify_email' | 'password_reset' | 'staff_invite' | 'email_otp' | 'account_exists' | 'mfa_reset';

interface Rendered {
  subject: string;
  text: string;
}

const templates: Record<TemplateKey, Record<Locale, (p: Record<string, string>) => Rendered>> = {
  verify_email: {
    ar: (p) => ({
      subject: 'تأكيد بريدك الإلكتروني — مزن',
      text: `مرحباً ${p.name}،\n\nلتأكيد بريدك الإلكتروني افتح الرابط التالي:\n${p.link}\n\nينتهي الرابط خلال 24 ساعة.`,
    }),
    en: (p) => ({
      subject: 'Confirm your email — MZN',
      text: `Hello ${p.name},\n\nConfirm your email address:\n${p.link}\n\nThe link expires in 24 hours.`,
    }),
  },
  password_reset: {
    ar: (p) => ({
      subject: 'إعادة تعيين كلمة المرور — مزن',
      text: `لإعادة تعيين كلمة المرور افتح الرابط:\n${p.link}\n\nينتهي خلال 30 دقيقة. إذا لم تطلب ذلك فتجاهل هذه الرسالة.`,
    }),
    en: (p) => ({
      subject: 'Reset your password — MZN',
      text: `Reset your password:\n${p.link}\n\nThe link expires in 30 minutes. Ignore this email if you did not request it.`,
    }),
  },
  staff_invite: {
    ar: (p) => ({
      subject: 'تم إنشاء حسابك في منصة مزن',
      text: `مرحباً ${p.name}،\n\nتم إنشاء حساب موظف لك. لتعيين كلمة المرور افتح الرابط:\n${p.link}\n\nسيُطلب منك تفعيل المصادقة الثنائية عند أول دخول.`,
    }),
    en: (p) => ({
      subject: 'Your MZN staff account',
      text: `Hello ${p.name},\n\nA staff account was created for you. Set your password:\n${p.link}\n\nYou will be asked to set up two-factor authentication at first sign-in.`,
    }),
  },
  email_otp: {
    ar: (p) => ({
      subject: 'رمز الدخول — مزن',
      text: `رمز الدخول الخاص بك: ${p.code}\nصالح لمدة 10 دقائق.`,
    }),
    en: (p) => ({
      subject: 'Your sign-in code — MZN',
      text: `Your sign-in code: ${p.code}\nValid for 10 minutes.`,
    }),
  },
  account_exists: {
    ar: () => ({
      subject: 'محاولة تسجيل — مزن',
      text: 'حاول أحدهم إنشاء حساب بهذا البريد، ولديك حساب بالفعل. يمكنك تسجيل الدخول أو إعادة تعيين كلمة المرور.',
    }),
    en: () => ({
      subject: 'Registration attempt — MZN',
      text: 'Someone tried to register with this email, but you already have an account. You can sign in or reset your password.',
    }),
  },
  mfa_reset: {
    ar: () => ({
      subject: 'تمت إعادة تعيين المصادقة الثنائية — مزن',
      text: 'أعاد فريق الدعم تعيين المصادقة الثنائية لحسابك. إذا لم تطلب ذلك فتواصل معنا فوراً.',
    }),
    en: () => ({
      subject: 'Two-factor authentication reset — MZN',
      text: 'Support reset two-factor authentication on your account. If you did not request this, contact us immediately.',
    }),
  },
};

export function renderEmail(
  key: TemplateKey,
  locale: Locale,
  params: Record<string, string> = {},
): Rendered & { template: TemplateKey } {
  return { ...templates[key][locale](params), template: key };
}
