'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { leaveRoom } from '@/lib/api';

export default function Navigation() {
  const LAST_ACTIVE_ROOM_KEY = 'kb-last-active-room-id';
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, loading } = useAuth();
  const [leavingRoom, setLeavingRoom] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [lastActiveRoomId, setLastActiveRoomId] = useState<string | null>(null);
  const [activePath, setActivePath] = useState(pathname);
  const [indicatorStyle, setIndicatorStyle] = useState({
    left: 0,
    width: 0,
    opacity: 0,
  });
  const desktopNavRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  const roomDetailMatch = pathname.match(/^\/rooms\/([^/]+)$/);
  const activeRoomId = roomDetailMatch?.[1] ?? null;
  const studyRoomsHref = activeRoomId
    ? `/rooms/${activeRoomId}`
    : lastActiveRoomId
      ? `/rooms/${lastActiveRoomId}`
      : '/rooms';

  const navItems = [
    { href: '/', label: 'Dashboard' },
    { href: studyRoomsHref, label: 'Study Rooms' },
    { href: '/query', label: 'Query' },
    { href: '/graph', label: 'Knowledge Graph' },
    { href: '/generate/outline', label: 'Outline' },
    { href: '/generate/summarize', label: 'Summarize' },
    { href: '/generate/faq', label: 'FAQ' },
    { href: '/generate/quiz', label: 'Quiz' },
    { href: '/generate/flashcards', label: 'Flashcards' },
    ...(user?.is_admin ? [{ href: '/admin', label: 'Admin' }] : []),
  ];

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(LAST_ACTIVE_ROOM_KEY);
    if (stored) {
      setLastActiveRoomId(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !activeRoomId) {
      return;
    }
    setLastActiveRoomId(activeRoomId);
    window.localStorage.setItem(LAST_ACTIVE_ROOM_KEY, activeRoomId);
  }, [activeRoomId]);

  const handleLeaveRoom = async () => {
    if (!activeRoomId || leavingRoom) {
      return;
    }
    try {
      setLeavingRoom(true);
      await leaveRoom(activeRoomId);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(LAST_ACTIVE_ROOM_KEY);
      }
      setLastActiveRoomId(null);
      router.push('/rooms');
    } catch {
      // Keep navigation resilient; room page handles detailed errors.
    } finally {
      setLeavingRoom(false);
    }
  };

  const isActive = (href: string) => {
    if (href === '/') {
      return activePath === '/';
    }
    if (href.startsWith('/rooms/')) {
      return activePath === '/rooms' || activePath.startsWith('/rooms/');
    }
    return activePath.startsWith(href);
  };

  const syncIndicator = (targetHref?: string) => {
    const resolvedHref = targetHref || pathname;
    const activeItem = navItems.find((item) => {
      if (item.href === '/') {
        return resolvedHref === '/';
      }
      return resolvedHref.startsWith(item.href);
    });
    const activeElement = activeItem ? itemRefs.current[activeItem.href] : null;
    const container = desktopNavRef.current;

    if (!activeElement || !container) {
      setIndicatorStyle((current) => ({ ...current, opacity: 0 }));
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeElement.getBoundingClientRect();

    setIndicatorStyle({
      left: activeRect.left - containerRect.left,
      width: activeRect.width,
      opacity: 1,
    });
  };

  useLayoutEffect(() => {
    setActivePath(pathname);
    syncIndicator(pathname);

    const handleResize = () => syncIndicator(pathname);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pathname]);

  const handleNavClick = (href: string) => {
    setActivePath(href);
    syncIndicator(href);
    setIsMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#141414]/95 backdrop-blur">
      <div className="mx-auto grid h-16 w-full max-w-[1560px] grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center justify-start">
          <div className="flex shrink-0 items-center">
            <Link
              href="/"
              className="group flex items-center gap-3 text-lg font-semibold tracking-tight text-white"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/30 bg-linear-to-br from-emerald-400/12 to-cyan-400/8 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300 transition-colors group-hover:border-emerald-300/45 group-hover:text-emerald-200">
                K
              </span>
              <span className="text-white/92 transition-colors group-hover:text-white">Knowledge Base</span>
            </Link>
          </div>
        </div>
        <div className="hidden justify-center md:flex">
          <div
            ref={desktopNavRef}
            className="relative flex items-center gap-1 rounded-full border border-white/6 bg-white/2 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
          >
            <div
              aria-hidden="true"
              className="absolute inset-y-1 rounded-full bg-linear-to-r from-emerald-400/16 to-cyan-400/10 ring-1 ring-emerald-300/16 shadow-[0_6px_24px_rgba(16,185,129,0.08)] transition-all duration-300 ease-out"
              style={{
                left: `${indicatorStyle.left}px`,
                width: `${indicatorStyle.width}px`,
                opacity: indicatorStyle.opacity,
              }}
            />
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleNavClick(item.href)}
                ref={(element) => {
                  itemRefs.current[item.href] = element;
                }}
                className={`relative z-10 inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? 'text-white'
                    : 'text-gray-400 hover:text-gray-100'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end">
          <div className="hidden items-center gap-3 md:flex">
            {!loading && user ? (
              <>
                <span className="rounded-full border border-white/10 bg-white/3 px-3 py-1.5 text-sm text-gray-300">
                  {user.display_name ?? user.name}
                </span>
                {activeRoomId && (
                  <button
                    onClick={() => void handleLeaveRoom()}
                    disabled={leavingRoom}
                    className="rounded-full border border-red-900/60 px-3 py-1.5 text-sm text-red-200 transition-colors hover:border-red-700 hover:bg-red-950/40 disabled:opacity-60"
                  >
                    {leavingRoom ? 'Leaving...' : 'Leave Room'}
                  </button>
                )}
                <button
                  onClick={() => void logout()}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:border-white/20 hover:text-white"
                >
                  Log out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-white/20 hover:text-white"
              >
                Log in
              </Link>
            )}
          </div>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 transition-colors hover:bg-white/5 hover:text-white md:hidden"
            aria-label="Toggle menu"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {isMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#141414]">
          <div className="pt-2 pb-3 px-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleNavClick(item.href)}
                className={`block px-4 py-3 rounded-xl text-base font-medium transition-colors ${
                  isActive(item.href)
                    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-100'
                }`}
              >
                {item.label}
              </Link>
            ))}
            {!loading && user ? (
              <button
                onClick={() => {
                  void logout();
                  setIsMenuOpen(false);
                }}
                className="block w-full rounded-xl px-4 py-3 text-left text-base font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-100"
              >
                Log out
              </button>
            ) : (
              <Link
                href="/login"
                onClick={() => setIsMenuOpen(false)}
                className="block rounded-xl px-4 py-3 text-base font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-100"
              >
                Log in
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
