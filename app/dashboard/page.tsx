'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { animate, stagger } from 'animejs';
import Link from 'next/link';
import BookingCalendar from '@/app/components/BookingCalendar';
import DashboardNav from '@/app/components/DashboardNav';

type User    = { name: string; email: string; role: string };
type Booking = { booking_id: string; equipment_name: string; start_time: string; end_time: string; status: string };
type Stats   = { upcoming_bookings: Booking[]; session_count: number; available_equipment: number };

const ROLE_LABELS: Record<string, string> = {
  student: 'นักศึกษา', researcher: 'นักวิจัย', instructor: 'อาจารย์', other: 'ผู้ใช้ทั่วไป',
};
const STATUS_STYLES: Record<string, string> = {
  pending:     'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  confirmed:   'bg-[#c8ff00]/10 text-[#c8ff00] border-[#c8ff00]/20',
  in_progress: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  completed:   'bg-gray-700/50 text-gray-400 border-white/10',
  cancelled:   'bg-red-500/10 text-red-400 border-red-500/20',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'รอยืนยัน', confirmed: 'ยืนยันแล้ว', in_progress: 'กำลังใช้งาน', completed: 'เสร็จสิ้น', cancelled: 'ยกเลิก',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

export default function DashboardPage() {
  const router = useRouter();
  const [user,         setUser]         = useState<User | null>(null);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  const cardsRef  = useRef<HTMLDivElement>(null);
  const tableRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) { router.replace('/login'); return; }
        const { user } = await meRes.json();
        setUser(user);

        const statsRes = await fetch('/api/dashboard/stats');
        if (statsRes.ok) setStats(await statsRes.json());
      } catch {
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (loading || !user) return;
    if (headerRef.current)
      animate(headerRef.current, { opacity: [0, 1], translateY: [16, 0], duration: 550, ease: 'outCubic' });
    if (cardsRef.current) {
      const cards = cardsRef.current.querySelectorAll('.stat-card');
      animate(cards, { opacity: [0, 1], translateY: [24, 0], scale: [0.97, 1], duration: 500, delay: stagger(80, { start: 150 }), ease: 'outCubic' });
    }
    if (tableRef.current)
      animate(tableRef.current, { opacity: [0, 1], translateY: [20, 0], duration: 500, delay: 400, ease: 'outCubic' });
  }, [loading, user]);

  async function refreshStats() {
    const res = await fetch('/api/dashboard/stats');
    if (res.ok) setStats(await res.json());
  }

  async function cancelBooking(booking_id: string) {
    setCancellingId(booking_id);
    try {
      const res = await fetch(`/api/bookings/${booking_id}`, { method: 'PATCH' });
      const data = await res.json();
      if (data.ok) {
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

  return (
    <div className="min-h-screen bg-[#030712] flex flex-col">
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(200,255,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.03) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }} />

      <DashboardNav user={user} />

      <main className="relative z-10 flex-1 mx-auto max-w-7xl w-full px-6 lg:px-8 py-10">
        {/* Header */}
        <div ref={headerRef} className="mb-10" style={{ opacity: 0 }}>
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">
              ยินดีต้อนรับ, <span className="text-[#c8ff00]">{user.name}</span>
            </h1>
            <span className="rounded-full border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-2.5 py-0.5 text-xs font-medium text-[#c8ff00]">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>

        {/* Stats */}
        <div ref={cardsRef} className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard label="การจองที่กำลังจะมา"  value={stats?.upcoming_bookings.length ?? 0} unit="รายการ" />
          <StatCard label="session ทั้งหมด"      value={stats?.session_count ?? 0}            unit="ครั้ง" />
          <StatCard label="อุปกรณ์ว่างอยู่"      value={stats?.available_equipment ?? 0}      unit="ชิ้น" highlight />
        </div>

        {/* Upcoming bookings */}
        <div ref={tableRef} className="rounded-2xl border border-white/10 bg-gray-900/50 overflow-hidden mb-6" style={{ opacity: 0 }}>
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">การจองที่กำลังจะมา</h2>
            <Link href="/#booking" className="text-xs text-[#c8ff00] hover:text-white transition-colors">
              จองเพิ่ม →
            </Link>
          </div>

          {!stats?.upcoming_bookings.length ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#c8ff00]/10 border border-[#c8ff00]/20">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c8ff00" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
              </div>
              <p className="text-sm text-gray-500 mb-5">ยังไม่มีการจองที่กำลังจะมา</p>
              <Link href="/#booking"
                className="inline-block rounded-full bg-[#c8ff00] px-6 py-2 text-xs font-semibold text-gray-950 hover:bg-white transition-colors"
                style={{ boxShadow: '0 0 20px rgba(200,255,0,0.25)' }}>
                จองห้องทดลองเลย
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['ห้องทดลอง', 'วันที่', 'เวลา', 'สถานะ', ''].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {stats.upcoming_bookings.map(b => {
                    const isCancelling = cancellingId === b.booking_id;
                    const canCancel = ['pending', 'confirmed'].includes(b.status);
                    return (
                    <tr key={b.booking_id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-3.5 text-white font-medium">{b.equipment_name}</td>
                      <td className="px-6 py-3.5 text-gray-400">{formatDate(b.start_time)}</td>
                      <td className="px-6 py-3.5 text-gray-400 font-mono text-xs">
                        {formatTime(b.start_time)} – {formatTime(b.end_time)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[b.status] ?? STATUS_STYLES.pending}`}>
                          {STATUS_LABELS[b.status] ?? b.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {canCancel && (
                          <button
                            onClick={() => cancelBooking(b.booking_id)}
                            disabled={isCancelling}
                            className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/5 px-3 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/15 hover:border-red-500/40 transition-colors disabled:opacity-50"
                          >
                            {isCancelling ? (
                              <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M21 12a9 9 0 11-6.219-8.56"/>
                              </svg>
                            ) : (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            )}
                            ยกเลิก
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Booking calendar */}
        <BookingCalendar scrollAnimate={false} onBookingCreated={refreshStats} onBookingCancelled={refreshStats} />
      </main>

    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, unit, highlight }: { label: string; value: number; unit: string; highlight?: boolean }) {
  return (
    <div className={`stat-card rounded-2xl border p-6 ${highlight ? 'border-[#c8ff00]/20 bg-[#c8ff00]/5' : 'border-white/10 bg-gray-900/50'}`} style={{ opacity: 0 }}>
      <p className="text-xs text-gray-500 mb-2">{label}</p>
      <p className={`text-3xl font-bold ${highlight ? 'text-[#c8ff00]' : 'text-white'}`}
        style={highlight ? { textShadow: '0 0 20px rgba(200,255,0,0.3)' } : {}}>
        {value}
      </p>
      <p className="text-xs text-gray-600 mt-1">{unit}</p>
    </div>
  );
}
