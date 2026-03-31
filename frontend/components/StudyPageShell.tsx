'use client';

import type { ReactNode } from 'react';
import BackButton from '@/components/BackButton';

interface StudyPageShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export default function StudyPageShell({
  eyebrow,
  title,
  description,
  children,
}: StudyPageShellProps) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_26%),linear-gradient(180deg,#0d0d0d_0%,#060606_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <BackButton />
        <section className="rounded-[32px] border border-gray-800 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_35%),linear-gradient(180deg,#121212_0%,#0b0b0b_100%)] p-6">
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-400">{description}</p>
        </section>

        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
