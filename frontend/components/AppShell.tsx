'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import Navigation from '@/components/Navigation';
import { useAuth } from '@/components/AuthProvider';

const PUBLIC_PATHS = new Set(['/login', '/register']);

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  const isPublicPath = PUBLIC_PATHS.has(pathname);
  const isAdminPath = pathname.startsWith('/admin');
  const isAdminUser = Boolean(user?.is_admin);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user && !isPublicPath) {
      router.replace('/login');
      return;
    }

    if (user && isAdminPath && !user.is_admin) {
      router.replace('/');
      return;
    }

    if (user && isPublicPath) {
      router.replace(user.is_admin ? '/admin' : '/');
      return;
    }

    if (user?.is_admin && !isAdminPath) {
      router.replace('/admin');
    }
  }, [isAdminPath, isAdminUser, isPublicPath, loading, pathname, router, user]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0f0f0f]">
        <LoadingSpinner />
      </main>
    );
  }

  if (!user && !isPublicPath) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0f0f0f]">
        <LoadingSpinner />
      </main>
    );
  }

  if (user && isAdminPath && !user.is_admin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0f0f0f]">
        <LoadingSpinner />
      </main>
    );
  }

  if (user && isPublicPath) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0f0f0f]">
        <LoadingSpinner />
      </main>
    );
  }

  if (user?.is_admin && !isAdminPath) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0f0f0f]">
        <LoadingSpinner />
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      {!isPublicPath && !isAdminUser && <Navigation />}
      {children}
    </main>
  );
}
