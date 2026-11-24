import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  localePrefix: 'always',
  // Arabic is the default for everyone; only an explicit switch (cookie) changes it.
  localeDetection: false,
});

export type AppLocale = (typeof routing.locales)[number];
