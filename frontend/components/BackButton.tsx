'use client';

import Link from 'next/link';

export default function BackButton() {
  return (
    <Link
      href="/"
      className="mb-5 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      <span>Back to Dashboard</span>
    </Link>
  );
}

