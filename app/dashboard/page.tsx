'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { animate, scrambleText, stagger } from 'animejs';
import Link from 'next/link';
import BookingCalendar from '@/app/components/BookingCalendar';
import DashboardNav from '@/app/components/DashboardNav';
import SlideIn from '@/app/components/SlideIn';
import { all, prefersReducedMotion, revealOnScroll } from '@/lib/motion';

// ── Types ──────────────────────────────────────────────────────────────────────

type User    = { name: string; email: string; role: string };
type Booking = { booking_id: string; equipment_name: string; start_time: string; end_time: string; status: string };
type Stats   = { upcoming_bookings: Booking[]; session_count: number; available_equipment: number };
type ActiveSession = { booking_id: string; experiment_code: string; experiment_name: string; start_time: string; end_time: string };
type HistoryItem = {
  booking_id: string;
  lab_code: string;
  lab_name: string;
  start_time: string;
  end_time: string;
  status: string;
  duration_seconds: number | null;
  session_id: string | null;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  student: 'นักศึกษา', researcher: 'นักวิจัย', instructor: 'อาจารย์', other: 'ผู้ใช้ทั่วไป',
};

const STATUS_STYLES: Record<string, string> = {
  pending:     'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  confirmed:   'bg-[#c8ff00]/10 text-[#c8ff00] border-[#c8ff00]/20',
  in_progress: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  completed:   'bg-gray-700/50 text-gray-400 border-white/10',
  cancelled:   'bg-red-500/10 text-red-400 border-red-500/20',
  expired:     'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'รอยืนยัน', confirmed: 'ยืนยันแล้ว', in_progress: 'กำลังใช้งาน',
  completed: 'เสร็จสิ้น', cancelled: 'ยกเลิก', expired: 'หมดเวลา',
};

// Same labels and files as the document list inside the lab room.
const HANDOUTS = [
  { label: 'คู่มือการทดลองที่ 08', file: 'การทดลองที่ 08.pdf' },
  { label: 'การทดลองที่ 08 สนามแม่เหล็ก', file: 'การทดลองที่ 08 สนามแม่เหล็ก.pdf' },
  { label: 'ข้อมูลการทดลอง 8 สนามแม่เหล็ก', file: 'data 8 สนามแม่เหล็ก.pdf' },
];

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c8ff00]';
const PANEL = 'rounded-2xl border border-white/10 bg-gray-900/50';

// ── Helpers ────────────────────────────────────────────────────────────────────

const TZ = 'Asia/Bangkok';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: TZ });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
}
function fmtPart(iso: string, part: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleDateString('th-TH', { ...part, timeZone: TZ });
}
const dayKey = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });

// "วันนี้" / "พรุ่งนี้" when it is that close; otherwise the date, or just the
// weekday where the date is already shown next to it.
function fmtWhen(iso: string, weekdayOnly = false) {
  const now = Date.now();
  const key = dayKey(new Date(iso).getTime());
  if (key === dayKey(now)) return 'วันนี้';
  if (key === dayKey(now + 86_400_000)) return 'พรุ่งนี้';
  return fmtPart(iso, weekdayOnly ? { weekday: 'long' } : { weekday: 'long', day: 'numeric', month: 'long' });
}

function effectiveStatus(status: string, endTime: string): string {
  if ((status === 'in_progress' || status === 'confirmed') && new Date(endTime) < new Date())
    return 'expired';
  return status;
}

function fmtDuration(secs: number | null): string {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h} ชม. ${m} นาที`;
  return `${m} นาที`;
}

function fmtClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

// A day or more away reads better in days and hours than as a running clock.
function fmtUntil(ms: number) {
  if (ms < 86_400_000) return fmtClock(ms);
  const hours = Math.floor(ms / 3_600_000);
  return `${Math.floor(hours / 24)} วัน ${hours % 24} ชม.`;
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function scrollToBooking() {
  document.getElementById('booking')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [user,          setUser]          = useState<User | null>(null);
  const [stats,         setStats]         = useState<Stats | null>(null);
  const [history,       setHistory]       = useState<HistoryItem[]>([]);
  const [hasMore,       setHasMore]       = useState(false);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [calendarKey,   setCalendarKey]   = useState(0);
  const historyCursor = useRef<string | null>(null);

  const mainRef    = useRef<HTMLElement>(null);
  const nameRef    = useRef<HTMLSpanElement>(null);
  const historyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) { router.replace('/login'); return; }
        const { user } = await meRes.json();
        setUser(user);
        const [statsRes, histRes, activeRes] = await Promise.all([
          fetch('/api/dashboard/stats'),
          fetch('/api/dashboard/history'),
          fetch('/api/bookings/active-session'),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (histRes.ok) {
          const hd = await histRes.json();
          setHistory(hd.items ?? []);
          setHasMore(hd.has_more ?? false);
          historyCursor.current = hd.cursor ?? null;
        }
        if (activeRes.ok) {
          const ad = await activeRes.json();
          if (ad.ok && ad.active) setActiveSession(ad.booking);
        }
      } catch {
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // Re-reads which session is running and what is booked. Runs every minute,
  // whenever a booking changes, and when the hero's clock crosses a start or end.
  const syncSession = useCallback(async () => {
    try {
      const [activeRes, statsRes] = await Promise.all([
        fetch('/api/bookings/active-session'),
        fetch('/api/dashboard/stats'),
      ]);
      if (activeRes.ok) {
        const ad = await activeRes.json();
        const next: ActiveSession | null = ad.ok && ad.active ? ad.booking : null;
        setActiveSession(prev => (prev?.booking_id === next?.booking_id ? prev : next));
      }
      if (statsRes.ok) setStats(await statsRes.json());
    } catch { /* keep what is on screen; the next tick tries again */ }
  }, []);

  useEffect(() => {
    if (loading) return;
    const interval = setInterval(syncSession, 60_000);
    return () => clearInterval(interval);
  }, [loading, syncSession]);

  // Entrance, once the data is in. It runs before the first paint, so the blocks
  // start from their hidden state without flashing, and nothing is ever hidden
  // when motion is reduced. The hero, the dial and the calendar then fill
  // themselves in with their own animations.
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (loading || !user || !main || prefersReducedMotion()) return;

    animate(all(main, '.dash-rise'), {
      opacity: [0, 1], translateY: [24, 0], duration: 650, delay: stagger(110), ease: 'outCubic',
    });
    if (nameRef.current)
      animate(nameRef.current, { innerHTML: scrambleText({ chars: 'blocks', seed: 3 }), duration: 900 });
    animate(all(main, '.dash-row, .doc-row'), {
      opacity: [0, 1], translateX: [-14, 0], duration: 420, delay: stagger(70, { start: 600 }), ease: 'outCubic',
    });

    const historyEl = historyRef.current;
    if (!historyEl) return;
    const playHistory = (start: number) => {
      animate(all(historyEl, '.hist-rise'), {
        opacity: [0, 1], translateY: [20, 0], duration: 500, delay: stagger(90, { start }), ease: 'outCubic',
      });
      const rows = all(historyEl, 'tbody tr');
      if (rows.length)
        animate(rows, { opacity: [0, 1], translateX: [-10, 0], duration: 350, delay: stagger(40, { start: start + 200 }), ease: 'outCubic' });
      // The session count runs up from zero.
      const count = historyEl.querySelector<HTMLElement>('.hist-count');
      const target = Number(count?.dataset.count);
      if (count && Number.isFinite(target)) {
        const tally = { n: 0 };
        count.textContent = '0';
        animate(tally, {
          n: target, duration: 1000, delay: start + 250, ease: 'outExpo',
          onUpdate: () => { count.textContent = String(Math.round(tally.n)); },
        });
      }
    };
    // On a tall screen the history is already in view and joins the entrance;
    // otherwise it waits until it is scrolled to.
    if (historyEl.getBoundingClientRect().top < window.innerHeight) { playHistory(700); return; }
    return revealOnScroll(historyEl, all(historyEl, '.hist-rise'), () => playHistory(0));
  }, [loading, user]);

  // Rows added by "ดูรายการก่อนหน้า" slide in under the ones already there.
  const shownHistory = useRef(0);
  useLayoutEffect(() => {
    const before = shownHistory.current;
    shownHistory.current = history.length;
    if (!before || history.length <= before || prefersReducedMotion() || !historyRef.current) return;
    const added = [...historyRef.current.querySelectorAll<HTMLElement>('tbody tr')].slice(before);
    animate(added, { opacity: [0, 1], translateX: [-10, 0], duration: 350, delay: stagger(40), ease: 'outCubic' });
  }, [history.length]);

  async function loadMoreHistory() {
    setLoadingMore(true);
    try {
      const cursorQs = historyCursor.current ? `?cursor=${encodeURIComponent(historyCursor.current)}` : '';
      const res = await fetch(`/api/dashboard/history${cursorQs}`);
      if (res.ok) {
        const hd = await res.json();
        setHistory(prev => [...prev, ...(hd.items ?? [])]);
        setHasMore(hd.has_more ?? false);
        historyCursor.current = hd.cursor ?? historyCursor.current;
      }
    } finally {
      setLoadingMore(false);
    }
  }

  // Asks the server to cancel. Returns an error message to show next to the
  // booking, or null when it worked — the list then animates the row away and
  // calls dropBooking.
  async function cancelBooking(booking_id: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/bookings/${booking_id}`, { method: 'PATCH' });
      const data = await res.json();
      return data.ok ? null : (data.error ?? 'ยกเลิกไม่สำเร็จ ลองอีกครั้ง');
    } catch {
      return 'เชื่อมต่อไม่ได้ ลองอีกครั้ง';
    }
  }

  function dropBooking(booking_id: string) {
    setStats(prev => prev ? {
      ...prev,
      upcoming_bookings: prev.upcoming_bookings.filter(b => b.booking_id !== booking_id),
    } : prev);
    setCalendarKey(k => k + 1);
    syncSession();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center">
        <svg className="animate-spin text-[#c8ff00]" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
      </div>
    );
  }
  if (!user) return null;

  const upcoming = stats?.upcoming_bookings ?? [];

  return (
    <div className="min-h-screen bg-[#030712] flex flex-col">
      {/* Grid bg */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(200,255,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.025) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }} />

      <DashboardNav user={user} />

      {/* Bottom padding leaves room for the floating notification bell */}
      <main ref={mainRef} className="relative z-10 flex-1 mx-auto max-w-7xl w-full px-6 lg:px-8 pt-8 pb-24 short:pt-6">

        {/* ── Greeting ── */}
        <div className="dash-rise flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-white">
                สวัสดี, <span ref={nameRef} className="text-[#c8ff00]">{user.name}</span>
              </h1>
              <span className="rounded-full border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-2.5 py-0.5 text-xs font-medium text-[#c8ff00]">
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">{user.email}</p>
          </div>
          <p className="text-sm text-gray-400">{fmtPart(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>

        {/* ── The session that matters right now ── */}
        <div className="dash-rise mt-6 short:mt-4">
          <SessionHero active={activeSession} next={upcoming[0] ?? null} onBoundary={syncSession} />
        </div>

        {/* ── Booking table beside what is already booked ── */}
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
          <div className="dash-rise order-2 lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <BookingCalendar
              embedded
              scrollAnimate={false}
              refreshKey={calendarKey}
              onBookingCreated={syncSession}
              onBookingCancelled={syncSession}
            />
          </div>
          <div className="dash-rise order-1 lg:order-none lg:col-start-2 lg:row-start-1">
            <UpcomingPanel bookings={upcoming} onCancel={cancelBooking} onCancelled={dropBooking} />
          </div>
          <div className="dash-rise order-3 lg:order-none lg:col-start-2 lg:row-start-2">
            <HandoutsPanel />
          </div>
        </div>

        {/* ── History ── */}
        <section ref={historyRef} className="mt-8">
          <div className="hist-rise mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 className="text-base font-semibold text-white">ประวัติการใช้งาน</h2>
            {stats && (
              <p className="text-sm text-gray-400">
                เข้าทดลองมาแล้ว{' '}
                <span key={stats.session_count} data-count={stats.session_count} className="hist-count font-mono font-semibold text-white">
                  {stats.session_count}
                </span>{' '}
                ครั้ง
              </p>
            )}
          </div>

          {!history.length ? (
            <div className={`hist-rise ${PANEL} px-6 py-10 text-center`}>
              <p className="text-sm text-gray-400">ยังไม่มีประวัติ รอบที่ทดลองเสร็จหรือยกเลิกแล้วจะมาอยู่ตรงนี้</p>
            </div>
          ) : (
            <div className={`hist-rise ${PANEL} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {['ห้องทดลอง', 'วันที่', 'เวลา', 'เวลาที่ใช้จริง', 'สถานะ'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {history.map(h => {
                      const status = effectiveStatus(h.status, h.end_time);
                      return (
                        <tr key={h.booking_id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3.5 text-xs">
                            <span className="font-mono font-semibold text-[#c8ff00]/70">{h.lab_code}</span>
                            <span className="ml-2 text-gray-300">{h.lab_name}</span>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-400">{fmtDate(h.start_time)}</td>
                          <td className="px-5 py-3.5 font-mono text-xs text-gray-500">
                            {fmtTime(h.start_time)} – {fmtTime(h.end_time)}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-300">{fmtDuration(h.duration_seconds)}</td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.completed}`}>
                              {STATUS_LABELS[status] ?? status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {hasMore && (
                <div className="px-5 py-3 border-t border-white/[0.04]">
                  <button
                    onClick={loadMoreHistory}
                    disabled={loadingMore}
                    className={`flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50 ${FOCUS_RING}`}
                  >
                    {loadingMore && <Spinner size={12} />}
                    {loadingMore ? 'กำลังโหลด' : 'ดูรายการก่อนหน้า'}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}

// ── Session hero ───────────────────────────────────────────────────────────────
// One block that always answers "can I go in now, and if not, when?".

const HERO_BLUE = 'radial-gradient(ellipse at 78% -30%, #1d40f5 0%, #0c18c2 32%, #07108a 62%, #040b5c 100%)';

function SessionHero({ active, next, onBoundary }: {
  active: ActiveSession | null;
  next: Booking | null;
  onBoundary: () => void;
}) {
  const now = useNow();
  const rootRef = useRef<HTMLElement>(null);

  const mode = active ? 'live' : next ? 'next' : 'none';
  const roundId = active?.booking_id ?? next?.booking_id ?? '';
  const startMs = active ? Date.parse(active.start_time) : next ? Date.parse(next.start_time) : 0;
  const endMs   = active ? Date.parse(active.end_time)   : next ? Date.parse(next.end_time)   : 0;
  const over = !!active && now >= endMs;
  const due  = !active && !!next && now >= startMs;

  // The clock here says a round just started or ended, but the server decides.
  // Ask it, and keep asking for a minute in case this clock runs a little ahead.
  useEffect(() => {
    if (!over && !due) return;
    onBoundary();
    let tries = 0;
    const id = setInterval(() => {
      if (++tries >= 12) clearInterval(id);
      onBoundary();
    }, 5000);
    return () => clearInterval(id);
  }, [over, due, onBoundary]);

  // Whenever the hero has something new to say — on load, when a round starts
  // or ends, when the next round changes — its lines come in one by one and the
  // headline resolves out of noise. Before paint, so the new lines never flash.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    animate(all(root, '.hero-item'), {
      opacity: [0, 1], translateY: [14, 0], duration: 520, delay: stagger(85, { start: 180 }), ease: 'outCubic',
    });
    // Written left to right through a short run of Thai consonants. The h2
    // holds one line's height and never wraps, so nothing below it moves.
    const headline = root.querySelector('h2');
    if (headline) {
      animate(headline, {
        innerHTML: scrambleText({ chars: 'ก-ฮ', from: 'left', override: '', settleDuration: 140 }),
        delay: 180,
      });
    }
    // A few nudges on the arrow point at the one thing to do while a round is on.
    const arrow = root.querySelector<SVGElement>('.hero-arrow');
    if (arrow) {
      animate(arrow, {
        translateX: [{ to: 5, duration: 320, ease: 'outQuad' }, { to: 0, duration: 420, ease: 'inOutQuad' }],
        delay: 1500, loop: 2, loopDelay: 900,
      });
    }
  }, [mode, roundId]);

  return (
    <section ref={rootRef} className="relative overflow-hidden rounded-3xl border border-white/10" style={{ background: HERO_BLUE }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(200,255,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.06) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse at 75% 50%, black 15%, transparent 72%)',
        }}
      />

      <div className="relative flex flex-col gap-6 px-6 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-9 short:py-5">
        {/* Keyed by mode: the headline's text is handed to anime.js, so each
            mode needs its own element rather than a reused one. */}
        {active ? (
          <div key="live" className="min-w-0">
            <p className="hero-item inline-flex items-center gap-2 rounded-full border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-3 py-1 text-xs font-semibold text-[#c8ff00]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#c8ff00] opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#c8ff00]" />
              </span>
              กำลังอยู่ในรอบของคุณ
            </p>
            <h2
              className="hero-item mt-3 min-h-[1lh] whitespace-nowrap text-3xl font-black tracking-tight text-[#c8ff00] sm:text-4xl"
              style={{ textShadow: '0 0 32px rgba(200,255,0,0.3)' }}
            >
              ห้องแลปเปิดให้คุณแล้ว
            </h2>
            <p className="hero-item mt-2 text-white/80">
              <span className="font-mono font-semibold">{active.experiment_code}</span> {active.experiment_name}
            </p>
            <p className="hero-item mt-1 font-mono text-sm text-white/60">
              {fmtTime(active.start_time)} – {fmtTime(active.end_time)} น.
            </p>
            <div className="hero-item mt-5">
              <Link
                href="/lab"
                className={`inline-flex items-center gap-2 rounded-full bg-[#c8ff00] px-7 py-3 text-sm font-bold text-gray-950 hover:bg-white transition-colors ${FOCUS_RING}`}
                style={{ boxShadow: '0 0 28px rgba(200,255,0,0.45), 0 4px 16px rgba(0,0,0,0.3)' }}
              >
                เข้าห้องแลป
                <ArrowIcon />
              </Link>
            </div>
          </div>
        ) : next ? (
          <div key="next" className="min-w-0">
            <h2 className="hero-item min-h-[1lh] whitespace-nowrap text-2xl font-bold tracking-tight text-white sm:text-3xl">รอบถัดไปของคุณ</h2>
            <p className="hero-item mt-3 text-xl font-semibold text-[#c8ff00]">
              {fmtWhen(next.start_time)} เวลา <span className="font-mono">{fmtTime(next.start_time)} – {fmtTime(next.end_time)}</span> น.
            </p>
            <p className="hero-item mt-1.5 text-white/75">{next.equipment_name}</p>
            <p className="hero-item mt-4 text-sm text-white/60">
              {due ? 'ถึงเวลาแล้ว กำลังเปิดห้องแลปให้คุณ' : 'ปุ่มเข้าห้องแลปจะขึ้นตรงนี้เมื่อถึงเวลา'}
            </p>
          </div>
        ) : (
          <div key="none" className="min-w-0">
            <h2 className="hero-item min-h-[1lh] whitespace-nowrap text-2xl font-bold tracking-tight text-white sm:text-3xl">ยังไม่มีรอบที่จองไว้</h2>
            <p className="hero-item mt-3 max-w-xl leading-7 text-white/75">
              เลือกช่วงเวลาที่ว่างจากตารางด้านล่าง รอบละ 2 ชั่วโมง จองล่วงหน้าได้ 7 วัน
            </p>
            <div className="hero-item mt-5">
              <button
                onClick={scrollToBooking}
                className={`rounded-full bg-[#c8ff00] px-7 py-3 text-sm font-bold text-gray-950 hover:bg-white transition-colors ${FOCUS_RING}`}
                style={{ boxShadow: '0 0 28px rgba(200,255,0,0.45), 0 4px 16px rgba(0,0,0,0.3)' }}
              >
                เลือกช่วงเวลา
              </button>
            </div>
          </div>
        )}

        {/* Keyed too, so the dial draws itself again for the new round. */}
        <div key={`dial:${mode}:${roundId}`} className="hero-item shrink-0">
          {active ? (
            <SessionDial
              progress={Math.min(1, Math.max(0, (now - startMs) / (endMs - startMs)))}
              label="เหลือเวลา"
              value={fmtClock(endMs - now)}
            />
          ) : next ? (
            <SessionDial progress={null} label="เริ่มในอีก" value={fmtUntil(startMs - now)} />
          ) : (
            <SessionDial progress={null} label="รอบถัดไป" value="ยังไม่มี" />
          )}
        </div>
      </div>
    </section>
  );
}

// The round as a clock face: twelve marks for its 120 minutes, the green arc
// for the part already used. Before the round starts only the face is drawn.
const DIAL = { c: 100, r: 78, ticks: 12 };
const DIAL_LENGTH = 2 * Math.PI * DIAL.r;

// While the dial draws itself, the digits that have not settled yet show a
// changing stand-in. It depends only on position and progress, so rendering
// stays pure.
function settleDigits(text: string, progress: number) {
  if (progress >= 1) return text;
  const chars = [...text];
  const settled = Math.floor(progress * chars.length);
  const frame = Math.floor(progress * 40);
  return chars.map((ch, i) => (i >= settled && /\d/.test(ch) ? String((i * 7 + frame * 3) % 10) : ch)).join('');
}

function SessionDial({ progress, label, value }: { progress: number | null; label: string; value: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  // 0 → 1 as the dial draws itself; starts drawn when motion is reduced.
  const [drawn, setDrawn] = useState(() => (prefersReducedMotion() ? 1 : 0));

  // The face draws itself: the marks go round clockwise, the arc runs to its
  // place while the readout settles, and the marker pulses a few times.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    const marks = animate(all(root, '.dial-tick'), { opacity: [0, 1], duration: 260, delay: stagger(45, { start: 250 }) });
    const draw = { v: 0 };
    const drawing = animate(draw, {
      v: 1, duration: 1500, ease: 'inOutCubic',
      onUpdate: () => setDrawn(draw.v),
      onComplete: () => {
        const pulse = root.querySelector<SVGElement>('.dial-pulse');
        if (pulse) animate(pulse, { r: [6.5, 18], opacity: [0.8, 0], duration: 1300, loop: 2, loopDelay: 500, ease: 'outCubic' });
      },
    });
    return () => { marks.pause(); drawing.pause(); };
  }, []);

  const shown = (progress ?? 0) * drawn;
  const angle = shown * 2 * Math.PI - Math.PI / 2;
  const markerX = DIAL.c + DIAL.r * Math.cos(angle);
  const markerY = DIAL.c + DIAL.r * Math.sin(angle);

  return (
    <div ref={rootRef} className="relative h-44 w-44 short:h-36 short:w-36">
      <svg viewBox="0 0 200 200" className="block h-full w-full" aria-hidden="true">
        {Array.from({ length: DIAL.ticks }, (_, i) => {
          const a = (i / DIAL.ticks) * 2 * Math.PI;
          return (
            <line
              key={i}
              className="dial-tick"
              x1={(DIAL.c + 91 * Math.sin(a)).toFixed(1)}
              y1={(DIAL.c - 91 * Math.cos(a)).toFixed(1)}
              x2={(DIAL.c + 97 * Math.sin(a)).toFixed(1)}
              y2={(DIAL.c - 97 * Math.cos(a)).toFixed(1)}
              stroke={i % 3 === 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)'}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}
        <circle
          cx={DIAL.c} cy={DIAL.c} r={DIAL.r}
          fill="rgba(3,7,18,0.35)"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="9"
          strokeDasharray={progress === null ? '2 7' : undefined}
        />
        {progress !== null && (
          <>
            <circle
              cx={DIAL.c} cy={DIAL.c} r={DIAL.r}
              fill="none"
              stroke="#c8ff00"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={DIAL_LENGTH}
              strokeDashoffset={DIAL_LENGTH * (1 - shown)}
              transform={`rotate(-90 ${DIAL.c} ${DIAL.c})`}
              style={{ filter: 'drop-shadow(0 0 6px rgba(200,255,0,0.5))' }}
            />
            <circle className="dial-pulse" cx={markerX} cy={markerY} r="6.5" fill="none" stroke="white" strokeWidth="1.5" opacity="0" />
            <circle cx={markerX} cy={markerY} r="6.5" fill="white" stroke="#07108a" strokeWidth="2" />
          </>
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xs text-white/60">{label}</span>
        <span role="timer" aria-label={`${label} ${value}`} className="mt-0.5 font-mono text-xl font-bold tabular-nums text-white short:text-lg">
          {settleDigits(value, Math.min(1, drawn * 1.5))}
        </span>
      </div>
    </div>
  );
}

// ── Side panels ────────────────────────────────────────────────────────────────

function UpcomingPanel({ bookings, onCancel, onCancelled }: {
  bookings: Booking[];
  /** Sends the cancel request; resolves to an error message, or null on success. */
  onCancel: (booking_id: string) => Promise<string | null>;
  /** Called once the cancelled row has left the list. */
  onCancelled: (booking_id: string) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const rowOf = (booking_id: string) =>
    rootRef.current?.querySelector<HTMLElement>(`[data-booking="${booking_id}"]`) ?? null;

  // A round booked while the page is open slides into the list with a brief
  // highlight, and the count beside the title jumps. The first render is left
  // to the page's entrance.
  const known = useRef<Set<string> | null>(null);
  useLayoutEffect(() => {
    const before = known.current;
    known.current = new Set(bookings.map(b => b.booking_id));
    if (!before || prefersReducedMotion()) return;
    const added = bookings.filter(b => !before.has(b.booking_id)).map(b => rowOf(b.booking_id)).filter(row => row !== null);
    if (added.length) {
      animate(added, {
        opacity: [0, 1], translateX: [-14, 0], duration: 450, delay: stagger(70), ease: 'outCubic',
      });
      animate(added, {
        backgroundColor: ['rgba(200,255,0,0.16)', 'rgba(200,255,0,0)'], duration: 1400, ease: 'outCubic',
      });
    }
    if (before.size !== bookings.length) {
      const badge = rootRef.current?.querySelector<HTMLElement>('.count-badge');
      if (badge) animate(badge, { scale: [1.5, 1], duration: 500, ease: 'outBack(2)' });
    }
  }, [bookings]);

  async function confirmCancel(booking_id: string) {
    setCancellingId(booking_id);
    setError(null);
    const message = await onCancel(booking_id);
    setCancellingId(null);
    setConfirmingId(null);
    if (message) { setError({ id: booking_id, text: message }); return; }

    // The row folds away before it is removed.
    const row = rowOf(booking_id);
    if (!row || prefersReducedMotion()) { onCancelled(booking_id); return; }
    row.style.overflow = 'hidden';
    animate(row, {
      opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, duration: 360, ease: 'inOutQuad',
      onComplete: () => onCancelled(booking_id),
    });
  }

  return (
    <section ref={rootRef} className={`${PANEL} overflow-hidden`}>
      <div className="flex items-center justify-between gap-4 px-5 pt-5 pb-4">
        <h2 className="text-base font-semibold text-white">รอบที่จองไว้</h2>
        {bookings.length > 0 && (
          <span className="count-badge rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-xs text-gray-400">{bookings.length}</span>
        )}
      </div>

      {!bookings.length ? (
        <p className="border-t border-white/[0.06] px-5 py-8 text-sm leading-6 text-gray-400">
          ยังไม่มีรอบที่จองไว้ คลิกช่องที่ว่างในตารางเพื่อจอง
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
          {bookings.map(b => {
            const canCancel = ['pending', 'confirmed'].includes(b.status);
            const asking = confirmingId === b.booking_id;
            const busy = cancellingId === b.booking_id;
            return (
              <li key={b.booking_id} data-booking={b.booking_id} className="dash-row px-5 py-3.5">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 bg-gray-950">
                    <span className="text-lg font-bold leading-none text-white">{fmtPart(b.start_time, { day: 'numeric' })}</span>
                    <span className="mt-1 text-[10px] leading-none text-gray-500">{fmtPart(b.start_time, { month: 'short' })}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">
                      {fmtWhen(b.start_time, true)}{' '}
                      <span className="font-mono font-medium">{fmtTime(b.start_time)} – {fmtTime(b.end_time)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{b.equipment_name}</p>
                  </div>
                  {b.status !== 'confirmed' && (
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[b.status] ?? STATUS_STYLES.pending}`}>
                      {STATUS_LABELS[b.status] ?? b.status}
                    </span>
                  )}
                  {b.status === 'in_progress' && (
                    <Link href="/lab" className={`shrink-0 text-xs font-semibold text-cyan-400 hover:text-white transition-colors ${FOCUS_RING}`}>
                      เข้าห้องแลป
                    </Link>
                  )}
                  {canCancel && !asking && (
                    <button
                      onClick={() => { setConfirmingId(b.booking_id); setError(null); }}
                      className={`shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs text-gray-400 hover:border-red-500/40 hover:text-red-400 transition-colors ${FOCUS_RING}`}
                    >
                      ยกเลิก
                    </button>
                  )}
                </div>

                {asking && (
                  <SlideIn className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-2.5">
                    <p className="text-xs text-gray-300">ยกเลิกรอบนี้ใช่ไหม</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setConfirmingId(null)}
                        disabled={busy}
                        className={`rounded-full border border-white/15 px-3.5 py-1 text-xs text-gray-400 hover:border-white/30 hover:text-white transition-colors disabled:opacity-50 ${FOCUS_RING}`}
                      >
                        ไม่ยกเลิก
                      </button>
                      <button
                        onClick={() => confirmCancel(b.booking_id)}
                        disabled={busy}
                        className={`flex items-center gap-1.5 rounded-full bg-red-500 px-3.5 py-1 text-xs font-semibold text-white hover:bg-red-400 transition-colors disabled:opacity-60 ${FOCUS_RING}`}
                      >
                        {busy && <Spinner size={11} />}
                        ยืนยันยกเลิก
                      </button>
                    </div>
                  </SlideIn>
                )}
                {error?.id === b.booking_id && (
                  <SlideIn role="alert" className="mt-2 text-xs text-red-400">{error.text}</SlideIn>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function HandoutsPanel() {
  return (
    <section className={`${PANEL} px-5 py-5`}>
      <h2 className="text-base font-semibold text-white">เอกสารการทดลอง</h2>
      <p className="mt-1 text-xs text-gray-400">อ่านก่อนเข้าห้องแลป จะได้ใช้เวลา 2 ชั่วโมงได้เต็มที่</p>
      <ul className="mt-3 space-y-1">
        {HANDOUTS.map(({ label, file }) => (
          <li key={file} className="doc-row">
            <a
              href={`/doc/lab8/${encodeURIComponent(file)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors ${FOCUS_RING}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-gray-950 text-cyan-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 3.5h7l4 4v13H7z" /><path d="M14 3.5v4h4M10 12.5h5M10 16h5" />
                </svg>
              </span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className="shrink-0 font-mono text-[10px] text-gray-600 group-hover:text-gray-400">PDF</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function Spinner({ size }: { size: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M21 12a9 9 0 11-6.219-8.56"/>
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="hero-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6"/>
    </svg>
  );
}
