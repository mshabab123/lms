import { PublicHeader } from '@/components/public-header';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main id="main" className="mx-auto w-full max-w-md px-4 py-10">
        {children}
      </main>
    </>
  );
}
