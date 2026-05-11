'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { animate, onScroll, scrambleText, stagger } from 'animejs';
import Link from 'next/link';
import BookingCalendar from '@/app/components/BookingCalendar';
import DashboardNav from '@/app/components/DashboardNav';

// ── Types ──────────────────────────────────────────────────────────────────────

type User    = { name: string; email: string; role: string };
type Booking = { booking_id: string; equipment_name: string; start_time: string; end_time: string; status: string };
type Stats   = { upcoming_bookings: Booking[]; session_count: number; available_equipment: number };
type ActiveSession = { booking_id: string; experiment_code: string; experiment_name: string; start_time: string; end_time: string; room_code: string | null };
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [user,         setUser]         = useState<User | null>(null);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [history,      setHistory]      = useState<HistoryItem[]>([]);
  const [hasMore,      setHasMore]      = useState(false);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [cancellingId,  setCancellingId]  = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [joinCode,      setJoinCode]      = useState('');
  const [joining,       setJoining]       = useState(false);
  const [joinError,     setJoinError]     = useState('');
  const [copied,        setCopied]        = useState(false);
  const offset = useRef(0);

  const headerRef       = useRef<HTMLDivElement>(null);
  const nameRef         = useRef<HTMLSpanElement>(null);
  const cardsRef        = useRef<HTMLDivElement>(null);
  const activeRef       = useRef<HTMLDivElement>(null);
  const upcomingRef     = useRef<HTMLDivElement>(null);
  const historyRef      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) { router.replace('/login'); return; }
        const { user } = await meRes.json();
        setUser(user);
        const [statsRes, histRes, activeRes] = await Promise.all([
          fetch('/api/dashboard/stats'),
          fetch('/api/dashboard/history?offset=0'),
          fetch('/api/bookings/active-session'),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (histRes.ok) {
          const hd = await histRes.json();
          setHistory(hd.items ?? []);
          setHasMore(hd.has_more ?? false);
          offset.current = hd.items?.length ?? 0;
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

  useEffect(() => {
    if (loading || !user) return;
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    (async () => {
      // Header
      if (headerRef.current)
        animate(headerRef.current, { opacity: [0, 1], translateY: [16, 0], duration: 500, ease: 'outCubic' });
      if (nameRef.current)
        animate(nameRef.current, { innerHTML: scrambleText({ chars: 'blocks', seed: 3 }), duration: 900 });

      await delay(120);

      // Stat cards + counter
      if (cardsRef.current) {
        animate(cardsRef.current.querySelectorAll('.stat-card'), {
          opacity: [0, 1], translateY: [20, 0], scale: [0.97, 1],
          duration: 450, delay: stagger(80), ease: 'outCubic',
        });
        await delay(200);
        cardsRef.current.querySelectorAll<HTMLElement>('.stat-value').forEach((el, i) => {
          const target = el.dataset.target ?? '0';
          animate(el, {
            innerHTML: scrambleText({ text: target, chars: 'blocks', seed: i + 2 }),
            duration: 800,
            delay: i * 100,
          });
        });
      }

      await delay(200);

      // Active session banner
      if (activeRef.current)
        animate(activeRef.current, { opacity: [0, 1], translateY: [12, 0], scale: [0.98, 1], duration: 500, ease: 'outBack' });

      await delay(120);

      // Upcoming section + row stagger
      if (upcomingRef.current) {
        animate(upcomingRef.current, { opacity: [0, 1], translateY: [16, 0], duration: 450, ease: 'outCubic' });
        await delay(150);
        const rows = upcomingRef.current.querySelectorAll('tbody tr');
        if (rows.length)
          animate(rows, { opacity: [0, 1], translateX: [-10, 0], duration: 350, delay: stagger(50), ease: 'outCubic' });
      }
    })();

    // History section — animate on scroll
    if (!historyRef.current) return;
    animate(historyRef.current, { opacity: 0, duration: 0 });
    const observer = onScroll({
      target: historyRef.current,
      onEnterForward: () => {
        animate(historyRef.current!, { opacity: [0, 1], translateY: [20, 0], duration: 500, ease: 'outCubic' });
        const rows = historyRef.current!.querySelectorAll('tbody tr');
        if (rows.length)
          animate(rows, { opacity: [0, 1], translateX: [-10, 0], duration: 350, delay: stagger(40, { start: 150 }), ease: 'outCubic' });
      },
    });
    return () => { observer.revert(); };
  }, [loading, user]);

  // ── ตรวจ active session อัตโนมัติ ─────────────────────────────────────────
  useEffect(() => {
    if (loading) return;

    async function checkActive() {
      const res = await fetch('/api/bookings/active-session');
      if (!res.ok) return;
      const ad = await res.json();
      const next = ad.ok && ad.active ? ad.booking : null;
      setActiveSession(prev => {
        if (!!prev === !!next) return prev; // ไม่เปลี่ยน → ไม่ re-render
        return next;
      });
      if (!activeSession && next && activeRef.current)
        animate(activeRef.current, { opacity: [0, 1], translateY: [12, 0], scale: [0.98, 1], duration: 500, ease: 'outBack' });
    }

    // poll ทุก 60 วิ
    const interval = setInterval(checkActive, 60_000);

    // timer แม่นยำ: ยิงตอน start_time ของการจองถัดไปพอดี
    const first = stats?.upcoming_bookings[0];
    let precise: ReturnType<typeof setTimeout> | null = null;
    if (first) {
      const ms = new Date(first.start_time).getTime() - Date.now();
      if (ms > 0 && ms < 7_200_000) precise = setTimeout(checkActive, ms);
    }

    return () => { clearInterval(interval); if (precise) clearTimeout(precise); };
  }, [loading, stats?.upcoming_bookings, activeSession]);

  async function refreshStats() {
    const res = await fetch('/api/dashboard/stats');
    if (res.ok) setStats(await res.json());
  }

  async function loadMoreHistory() {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/dashboard/history?offset=${offset.current}`);
      if (res.ok) {
        const hd = await res.json();
        setHistory(prev => [...prev, ...(hd.items ?? [])]);
        setHasMore(hd.has_more ?? false);
        offset.current += hd.items?.length ?? 0;
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    setJoinError('');
    try {
      const res = await fetch(`/api/lab/join?room=${code}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setJoinError(data.error ?? 'รหัสห้องไม่ถูกต้อง');
      } else {
        router.push(`/lab?room=${data.room_code}`);
      }
    } finally {
      setJoining(false);
    }
  }

  function copyRoomCode(code: string) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function cancelBooking(booking_id: string) {
    setCancellingId(booking_id);
    try {
      const res = await fetch(`/api/bookings/${booking_id}`, { method: 'PATCH' });
      if ((await res.json()).ok) {
        setStats(prev => prev ? {
          ...prev,
          upcoming_bookings: prev.upcoming_bookings.filter(b => b.booking_id !== booking_id),
        } : prev);
        refreshStats();
      }
    } finally {
      setCancellingId(null);
    }
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
        animation: 'gridScroll 12s linear infinite',
      }} />

      <DashboardNav user={user} />

      <main className="relative z-10 flex-1 mx-auto max-w-7xl w-full px-6 lg:px-8 py-10 space-y-8">

        {/* ── Header ── */}
        <div ref={headerRef} style={{ opacity: 0 }}>
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">
              ยินดีต้อนรับ, <span ref={nameRef} className="text-[#c8ff00]">{user.name}</span>
            </h1>
            <span className="rounded-full border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-2.5 py-0.5 text-xs font-medium text-[#c8ff00]">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>

        {/* ── Active Session Banner ── */}
        {activeSession && (
          <div ref={activeRef} style={{ opacity: 0 }}>
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              style={{ boxShadow: '0 0 40px rgba(34,211,238,0.07)' }}>
              <div className="flex items-center gap-4">
                <div className="shrink-0 h-12 w-12 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-400" />
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">LIVE</span>
                    <span className="font-mono text-xs text-gray-500">{activeSession.experiment_code}</span>
                  </div>
                  <p className="text-white font-semibold text-sm">{activeSession.experiment_name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">
                    {fmtTime(activeSession.start_time)} – {fmtTime(activeSession.end_time)}
                  </p>
                  {activeSession.room_code && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-gray-500">รหัสห้อง</span>
                      <button
                        onClick={() => copyRoomCode(activeSession.room_code!)}
                        className="flex items-center gap-1.5 rounded-lg border border-[#c8ff00]/30 bg-[#c8ff00]/5 px-2.5 py-0.5 hover:bg-[#c8ff00]/10 transition-colors"
                      >
                        <span className="font-mono text-sm font-bold tracking-widest text-[#c8ff00]">
                          {activeSession.room_code}
                        </span>
                        {copied ? (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#c8ff00" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                        ) : (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#c8ff00" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        )}
                      </button>
                      <span className="text-[10px] text-gray-600">แชร์ให้เพื่อนเข้าห้องได้</span>
                    </div>
                  )}
                </div>
              </div>
              <Link href="/lab"
                className="shrink-0 inline-flex items-center gap-2 rounded-full bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-gray-950 hover:bg-cyan-400 transition-colors"
                style={{ boxShadow: '0 0 20px rgba(34,211,238,0.25)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                </svg>
                เข้าห้องแลป
              </Link>
            </div>
          </div>
        )}

        {/* ── Stat Cards ── */}
        <div ref={cardsRef} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<CalendarIcon />}
            label="การจองที่กำลังจะมา"
            value={upcoming.length}
            unit="รายการ"
          />
          <StatCard
            icon={<FlaskIcon />}
            label="session ทั้งหมด"
            value={stats?.session_count ?? 0}
            unit="ครั้ง"
          />
          <StatCard
            icon={<DoorIcon />}
            label="ห้องแลปที่เปิดใช้งาน"
            value={stats?.available_equipment ?? 0}
            unit="ห้อง"
            accent
          />
        </div>

        {/* ── Join Room ── */}
        <div className="rounded-2xl border border-white/10 bg-gray-900/40 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c8ff00]/10 border border-[#c8ff00]/20">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c8ff00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">เข้าร่วมห้องแลป</p>
              <p className="text-xs text-gray-500">กรอกรหัสห้องที่ได้รับจากเจ้าของห้อง</p>
            </div>
          </div>
          <form onSubmit={handleJoin} className="flex items-center gap-3">
            <input
              type="text"
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setJoinError(''); }}
              placeholder="XXXXXX"
              maxLength={6}
              className="flex-1 rounded-xl border border-white/10 bg-gray-900 px-4 py-2.5 font-mono text-base tracking-widest text-[#c8ff00] placeholder-gray-700 focus:border-[#c8ff00]/40 focus:outline-none transition-colors"
              style={{ letterSpacing: '0.25em' }}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={joinCode.length !== 6 || joining}
              className="shrink-0 rounded-xl bg-[#c8ff00] px-5 py-2.5 text-sm font-semibold text-gray-950 hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ boxShadow: joinCode.length === 6 ? '0 0 20px rgba(200,255,0,0.25)' : 'none' }}
            >
              {joining ? (
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
              ) : 'เข้าร่วม →'}
            </button>
          </form>
          {joinError && (
            <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              {joinError}
            </p>
          )}
        </div>

        {/* ── Upcoming Bookings ── */}
        <div ref={upcomingRef} style={{ opacity: 0 }}>
          <SectionHeader title="การจองที่กำลังจะมา">
            <button
              onClick={() => document.getElementById('booking-calendar')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-xs text-[#c8ff00] hover:text-white transition-colors"
            >
              จองเพิ่ม →
            </button>
          </SectionHeader>

          {!upcoming.length ? (
            <EmptyState
              icon={<CalendarIcon size={20} />}
              message="ยังไม่มีการจองที่กำลังจะมา"
              action={
                <button
                  onClick={() => document.getElementById('booking-calendar')?.scrollIntoView({ behavior: 'smooth' })}
                  className="btn-primary"
                >
                  จองห้องทดลองเลย
                </button>
              }
            />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-gray-900/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {['ห้องทดลอง', 'วันที่', 'เวลา', 'สถานะ', ''].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {upcoming.map(b => {
                      const isCancelling = cancellingId === b.booking_id;
                      const canCancel    = ['pending', 'confirmed'].includes(b.status);
                      const isActive     = b.status === 'in_progress';
                      return (
                        <tr key={b.booking_id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3.5 font-medium text-white">{b.equipment_name}</td>
                          <td className="px-5 py-3.5 text-gray-400">{fmtDate(b.start_time)}</td>
                          <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">
                            {fmtTime(b.start_time)} – {fmtTime(b.end_time)}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[b.status] ?? STATUS_STYLES.pending}`}>
                              {isActive && <span className="h-1 w-1 rounded-full bg-cyan-400 animate-pulse inline-block" />}
                              {STATUS_LABELS[b.status] ?? b.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isActive && (
                                <Link href="/lab"
                                  className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 text-[11px] font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors">
                                  <span className="h-1 w-1 rounded-full bg-cyan-400 animate-pulse inline-block" />
                                  เข้าห้องแลป
                                </Link>
                              )}
                              {canCancel && (
                                <button
                                  onClick={() => cancelBooking(b.booking_id)}
                                  disabled={isCancelling}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/5 px-3 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/15 hover:border-red-500/40 transition-colors disabled:opacity-50"
                                >
                                  {isCancelling
                                    ? <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                                    : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  }
                                  ยกเลิก
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── History ── */}
        <div ref={historyRef}>
          <SectionHeader title="ประวัติการใช้งาน" />

          {!history.length ? (
            <EmptyState
              icon={<HistoryIcon />}
              message="ยังไม่มีประวัติการใช้งาน"
            />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-gray-900/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {['ห้องทดลอง', 'วันที่', 'เวลา', 'ระยะเวลา', 'สถานะ'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {history.map(h => (
                      <tr key={h.booking_id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3.5">
                          <div>
                            <span className="font-mono text-xs text-[#c8ff00]/70 font-semibold">{h.lab_code}</span>
                            <span className="text-gray-500 text-xs"> — </span>
                            <span className="text-gray-300 text-xs">{h.lab_name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-gray-400 text-xs">{fmtDate(h.start_time)}</td>
                        <td className="px-5 py-3.5 text-gray-500 font-mono text-xs">
                          {fmtTime(h.start_time)} – {fmtTime(h.end_time)}
                        </td>
                        <td className="px-5 py-3.5">
                          {h.duration_seconds
                            ? <span className="text-gray-300 text-xs font-mono">{fmtDuration(h.duration_seconds)}</span>
                            : <span className="text-gray-600 text-xs">—</span>
                          }
                        </td>
                        <td className="px-5 py-3.5">
                          {(() => { const s = effectiveStatus(h.status, h.end_time); return (
                          <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[s] ?? STATUS_STYLES.completed}`}>
                            {STATUS_LABELS[s] ?? s}
                          </span>
                          ); })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {hasMore && (
                <div className="px-5 py-3 border-t border-white/[0.04]">
                  <button
                    onClick={loadMoreHistory}
                    disabled={loadingMore}
                    className="text-xs text-gray-500 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {loadingMore
                      ? <><svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> กำลังโหลด…</>
                      : 'โหลดเพิ่มเติม →'
                    }
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Booking Calendar ── */}
        <div id="booking-calendar">
          <BookingCalendar scrollAnimate={false} onBookingCreated={refreshStats} onBookingCancelled={refreshStats} />
        </div>

      </main>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {children}
    </div>
  );
}

function EmptyState({ icon, message, action }: { icon: React.ReactNode; message: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gray-900/50 px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#c8ff00]/10 border border-[#c8ff00]/20 text-[#c8ff00]">
        {icon}
      </div>
      <p className="text-sm text-gray-500 mb-5">{message}</p>
      {action}
    </div>
  );
}

function StatCard({ icon, label, value, unit, accent }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className={`stat-card rounded-2xl border p-5 flex items-start gap-4 ${accent ? 'border-[#c8ff00]/20 bg-[#c8ff00]/5' : 'border-white/10 bg-gray-900/50'}`} style={{ opacity: 0 }}>
      <div className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center ${accent ? 'bg-[#c8ff00]/10 text-[#c8ff00]' : 'bg-white/5 text-gray-400'}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className={`stat-value text-3xl font-bold leading-none ${accent ? 'text-[#c8ff00]' : 'text-white'}`}
          data-target={value}
          style={accent ? { textShadow: '0 0 20px rgba(200,255,0,0.3)' } : {}}>
          0
        </p>
        <p className="text-xs text-gray-600 mt-1">{unit}</p>
      </div>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function CalendarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  );
}
function FlaskIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6M9 3v7l-5 9h16l-5-9V3"/>
    </svg>
  );
}
function DoorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M9 21V5a2 2 0 012-2h4a2 2 0 012 2v16"/><circle cx="14.5" cy="13" r="0.5" fill="currentColor"/>
    </svg>
  );
}
function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-4.85L1 10"/>
    </svg>
  );
}
