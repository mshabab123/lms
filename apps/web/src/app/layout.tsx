// The <html> element is rendered by app/[locale]/layout.tsx so `lang`/`dir` follow the locale.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
