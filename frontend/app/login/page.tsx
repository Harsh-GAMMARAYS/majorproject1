'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ErrorAlert from '@/components/ErrorAlert';
import { useAuth } from '@/components/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setWorking(true);
      setError(null);
      await login(email, password, rememberMe);
      router.push('/rooms');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_18%),radial-gradient(circle_at_bottom_right,_rgba(31,41,55,0.24),_transparent_22%),linear-gradient(180deg,#0d0d0d_0%,#060606_100%)]">
      <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col px-8 py-8 sm:px-12 lg:px-16 xl:px-20">
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-xl font-semibold text-emerald-300">
            KB
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-emerald-400">Knowledge Base</p>
          </div>
        </div>

        <div className="grid flex-1 items-center gap-16 py-10 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="max-w-4xl">
            <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl xl:text-7xl">
              Study with shared context, not scattered tabs.
            </h1>

            <p className="mt-10 max-w-2xl text-xl leading-9 text-gray-300">
              Query documents, generate study material, and collaborate in live rooms with a single persistent workspace for learning.
            </p>

            <div className="mt-12 grid max-w-4xl gap-4 sm:grid-cols-3">
              <div className="rounded-[24px] border border-gray-800 bg-black/20 p-5 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-400">Query</p>
                <p className="mt-3 text-sm text-gray-300">Ask grounded questions over your uploaded documents.</p>
              </div>
              <div className="rounded-[24px] border border-gray-800 bg-black/20 p-5 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-400">Generate</p>
                <p className="mt-3 text-sm text-gray-300">Create summaries, outlines, flashcards, FAQs, and quizzes.</p>
              </div>
              <div className="rounded-[24px] border border-gray-800 bg-black/20 p-5 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-400">Collaborate</p>
                <p className="mt-3 text-sm text-gray-300">Work inside study rooms with live room context and shared artifacts.</p>
              </div>
            </div>
          </section>

          <section className="flex items-center justify-end">
            <div className="w-full max-w-[640px] rounded-[32px] border border-gray-800 bg-[linear-gradient(180deg,rgba(18,18,18,0.92)_0%,rgba(11,11,11,0.96)_100%)] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:p-10">
            <h2 className="text-3xl font-semibold text-white">Log in</h2>

            {error && <div className="mt-6"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-200">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="example@gmail.com"
                  className="w-full rounded-2xl border border-gray-700 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-200">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your secure password"
                  className="w-full rounded-2xl border border-gray-700 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>

              <label className="inline-flex items-center gap-3 rounded-full border border-gray-800 bg-black/20 px-4 py-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="rounded border-gray-600 bg-black/20 text-emerald-500 focus:ring-emerald-500"
                />
                Remember me on this device
              </label>

              <button
                type="submit"
                disabled={working}
                className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
              >
                {working ? 'Signing in...' : 'Log in'}
              </button>
            </form>

            <p className="mt-8 text-sm text-gray-500">
              Need an account?{' '}
              <Link href="/register" className="text-emerald-300 hover:text-emerald-200">
                Register
              </Link>
            </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
