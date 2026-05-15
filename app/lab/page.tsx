'use client';
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { animate, stagger, scrambleText, createLayout } from 'animejs';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNotifications } from '@/app/components/useNotifications';
import { BellIcon, UnreadBadge, NotifPanel } from '@/app/components/GlobalNotifications';

// ── Physics (Lab 8: Biot–Savart) ─────────────────────────────────────────────

const MU0 = 4 * Math.PI * 1e-7;

// Single coil at center (Z=0): B₀ = μ₀·n·I / (2R)  [mT]
function calcBCoil(n: number, I: number, R: number): number {
  return (MU0 * n * I) / (2 * R) * 1e3;
}

// Finite solenoid on axis at Z from center: [mT]
// B_z = (μ₀·N·I / 2L) × [ (L/2+Z)/√(R²+(L/2+Z)²) + (L/2−Z)/√(R²+(L/2−Z)²) ]
function calcBSolenoid(N: number, I: number, L: number, R: number, Z: number): number {
  const a = L / 2 + Z;
  const b = L / 2 - Z;
  return (MU0 * N * I) / (2 * L) * (a / Math.sqrt(R * R + a * a) + b / Math.sqrt(R * R + b * b)) * 1e3;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CoilInst = { id: number; type: 'coil'; name: string; sub: string; I0: number; turns: number; R: number; icon: ReactNode };
type SolInst = { id: number; type: 'solenoid'; name: string; sub: string; I0: number; N: number; L: number; R: number; icon: ReactNode };
type Inst = CoilInst | SolInst;

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) { return String(Math.floor(n)).padStart(2, '0'); }
function hhmmss(s: number) { return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`; }
function nowTime() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

function useFlPathAnimation(
  svgRef: React.RefObject<SVGSVGElement | null>,
  getDuration: (i: number) => number,
  dep: unknown,
) {
  useEffect(() => {
    if (!svgRef.current) return;
    const paths = svgRef.current.querySelectorAll<SVGPathElement>('.fl');
    paths.forEach((p, i) => {
      const len = p.getTotalLength();
      const dash = len * 0.55, gap = len * 0.45;
      p.style.strokeDasharray = `${dash} ${gap}`;
      p.style.strokeDashoffset = '0';
      animate(p, { strokeDashoffset: [0, -(dash + gap)], duration: getDuration(i), ease: 'linear', loop: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
}

interface ChatMsg { id: number; role: 'user' | 'assistant'; content: string }
let _cid = 0;

type LogType = 'info' | 'warn' | 'data' | 'cmd';
interface LogEntry { id: number; ts: string; type: LogType; msg: string }
let _lid = 0;
function mkLog(type: LogType, msg: string): LogEntry {
  return { id: ++_lid, ts: nowTime(), type, msg };
}

// ── Instruments (อ้างอิงใบแลป 04203102) ──────────────────────────────────────

const instruments: Inst[] = [
  // ตอนที่ 1 — ขดลวดเดี่ยว  I₀ = 5 A
  {
    id: 0, type: 'coil', name: 'ขดลวดเดี่ยว 1 รอบ', sub: 'n=1 · R=13 มม.',
    I0: 5, turns: 1, R: 0.013,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    id: 1, type: 'coil', name: 'ขดลวดเดี่ยว 2 รอบ', sub: 'n=2 · R=13 มม.',
    I0: 5, turns: 2, R: 0.013,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" /><circle cx="12" cy="12" r="2" />
      </svg>
    ),
  },
  {
    id: 2, type: 'coil', name: 'ขดลวดเดี่ยว 3 รอบ', sub: 'n=3 · R=13 มม.',
    I0: 5, turns: 3, R: 0.013,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="6.5" />
        <circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1.5" />
      </svg>
    ),
  },
  // ตอนที่ 2 — โซลีนอยด์  L=160 mm · R=13 mm · I₀ = 1 A
  {
    id: 3, type: 'solenoid', name: 'โซลีนอยด์ 75 รอบ', sub: 'N=75 · L=160 มม.',
    I0: 1, N: 75, L: 0.16, R: 0.013,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="9" width="20" height="6" rx="1" />
        <path d="M2 12h20" strokeDasharray="3 2" />
      </svg>
    ),
  },
  {
    id: 4, type: 'solenoid', name: 'โซลีนอยด์ 150 รอบ', sub: 'N=150 · L=160 มม.',
    I0: 1, N: 150, L: 0.16, R: 0.013,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="8" width="20" height="8" rx="1" />
        <path d="M2 10.5h20M2 12h20M2 13.5h20" strokeDasharray="3 2" />
      </svg>
    ),
  },
];

// ── Access Gate ───────────────────────────────────────────────────────────────

type AccessState =
  | { status: 'loading' }
  | { status: 'denied'; reason: 'auth' }
  | { status: 'denied'; reason: 'no_booking'; next: { start_time: string; experiment_name: string } | null }
  | { status: 'allowed'; end_time: string; experiment_name: string; room_code: string | null };

function useAccessGate() {
  const [access, setAccess] = useState<AccessState>({ status: 'loading' });
  const activeBookingId = useRef<string | null>(null);

  // keepalive: true ทำให้ request ส่งได้แม้ระหว่าง page unload
  function completeBooking(id: string) {
    fetch(`/api/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
      keepalive: true,
    }).catch(() => { });
  }

  useEffect(() => {
    fetch('/api/bookings/active-session')
      .then(async r => {
        if (r.status === 401) { setAccess({ status: 'denied', reason: 'auth' }); return; }
        const d = await r.json();
        if (!d.ok) { setAccess({ status: 'denied', reason: 'auth' }); return; }
        if (d.active) {
          const bookingId: string = d.booking.booking_id;
          activeBookingId.current = bookingId;
          fetch(`/api/bookings/${bookingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start' }),
          }).catch(() => { });
          setAccess({ status: 'allowed', end_time: d.booking.end_time, experiment_name: d.booking.experiment_name, room_code: d.booking.room_code ?? null });
        } else {
          setAccess({ status: 'denied', reason: 'no_booking', next: d.next_booking ?? null });
        }
      })
      .catch(() => setAccess({ status: 'denied', reason: 'auth' }));
  }, []);

  // Re-check ทุก 60 วินาที — ถ้าเวลาหมดให้ mark complete แล้ว kick out
  useEffect(() => {
    if (access.status !== 'allowed') return;
    const intervalId = setInterval(() => {
      fetch('/api/bookings/active-session')
        .then(r => r.json())
        .then(d => {
          if (!d.ok || !d.active) {
            if (activeBookingId.current) {
              completeBooking(activeBookingId.current);
              activeBookingId.current = null;
            }
            setAccess({ status: 'denied', reason: 'no_booking', next: d.next_booking ?? null });
          }
        })
        .catch(() => { });
    }, 60_000);
    return () => clearInterval(intervalId);
  }, [access.status]);

  function onComplete() {
    if (activeBookingId.current) {
      completeBooking(activeBookingId.current);
      activeBookingId.current = null;
    }
  }

  return { access, onComplete };
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
}

function AccessDeniedScreen({ access }: { access: Extract<AccessState, { status: 'denied' }> }) {
  return (
    <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center px-6 text-center">
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(200,255,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.03) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }} />
      <div className="relative z-10 max-w-sm w-full">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        {access.reason === 'auth' ? (
          <>
            <h1 className="text-xl font-bold text-white mb-2">กรุณาเข้าสู่ระบบก่อน</h1>
            <p className="text-sm text-gray-500 mb-6">ต้องเข้าสู่ระบบและมีการจองที่ถูกต้องจึงจะเข้าใช้งานห้องแลปได้</p>
            <a href="/login"
              className="inline-block rounded-full bg-[#c8ff00] px-6 py-2.5 text-sm font-semibold text-gray-950 hover:bg-white transition-colors"
              style={{ boxShadow: '0 0 20px rgba(200,255,0,0.25)' }}>
              เข้าสู่ระบบ
            </a>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-white mb-2">ไม่สามารถเข้าใช้งานได้</h1>
            <p className="text-sm text-gray-400 mb-1">ขณะนี้ไม่มีการจองที่ active อยู่</p>
            <p className="text-xs text-gray-600 mb-6">สามารถเข้าใช้งานได้เฉพาะในช่วงเวลาที่จองไว้เท่านั้น</p>

            {access.next ? (
              <div className="mb-6 rounded-xl border border-[#c8ff00]/20 bg-[#c8ff00]/5 px-4 py-3 text-sm">
                <p className="text-xs text-gray-500 mb-1">การจองถัดไป</p>
                <p className="font-semibold text-white">{access.next.experiment_name}</p>
                <p className="text-xs text-[#c8ff00] mt-0.5">{formatDateTime(access.next.start_time)}</p>
              </div>
            ) : (
              <div className="mb-6 rounded-xl border border-white/10 bg-gray-900/50 px-4 py-3 text-sm text-gray-500">
                ยังไม่มีการจองที่กำลังจะมา
              </div>
            )}

            <a href="/dashboard"
              className="inline-block rounded-full bg-[#c8ff00] px-6 py-2.5 text-sm font-semibold text-gray-950 hover:bg-white transition-colors"
              style={{ boxShadow: '0 0 20px rgba(200,255,0,0.25)' }}>
              ไปจองห้องแลป
            </a>
          </>
        )}
      </div>
    </div>
  );
}

// ── Lab Docs Panel ────────────────────────────────────────────────────────────

function LabDocsPanel({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelRef.current) return;
    animate(panelRef.current, { opacity: [0, 1], translateY: [12, 0], scale: [0.96, 1], duration: 280, ease: 'outBack' });
    const items = panelRef.current.querySelectorAll('.doc-item');
    if (items.length)
      animate(items, { opacity: [0, 1], translateX: [-8, 0], duration: 240, delay: stagger(35, { start: 120 }), ease: 'outCubic' });
  }, []);

  return (
    <div ref={panelRef}
      className="fixed top-12 right-[88px] z-[100] w-64 rounded-2xl border border-white/10 bg-gray-950 overflow-hidden"
      style={{ opacity: 0, boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)' }}>
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <span className="text-sm font-semibold text-white">เอกสารประกอบแลป</span>
      </div>
      <ul className="divide-y divide-white/[0.04]">
        {LAB8_DOCS.map(({ label, file }) => (
          <li key={file} className="doc-item" style={{ opacity: 0 }}>
            <a
              href={`/doc/lab8/${encodeURIComponent(file)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 text-xs text-gray-300 hover:text-[#c8ff00] hover:bg-white/[0.03] transition-colors group"
              onClick={onClose}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-600 group-hover:text-[#c8ff00] transition-colors">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="flex-1 truncate">{label}</span>
              <span className="text-[9px] text-gray-600 font-mono shrink-0">PDF</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Lab Intro Screen ──────────────────────────────────────────────────────────

const LAB8_DOCS = [
  { label: 'คู่มือการทดลองที่ 08', file: 'การทดลองที่ 08.pdf' },
  { label: 'การทดลองที่ 08 สนามแม่เหล็ก', file: 'การทดลองที่ 08 สนามแม่เหล็ก.pdf' },
  { label: 'ข้อมูลการทดลอง 8 สนามแม่เหล็ก', file: 'data 8 สนามแม่เหล็ก.pdf' },
];

function LabIntroScreen({ endTime, onStart }: { endTime: string; onStart: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const docsRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [remaining, setRemaining] = useState(() => getRemaining(endTime));

  useEffect(() => {
    const t = setInterval(() => setRemaining(getRemaining(endTime)), 1000);
    return () => clearInterval(t);
  }, [endTime]);

  useEffect(() => {
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    (async () => {
      if (cardRef.current)
        animate(cardRef.current, { opacity: [0, 1], translateY: [24, 0], scale: [0.97, 1], duration: 600, ease: 'outCubic' });
      await delay(150);
      if (titleRef.current)
        animate(titleRef.current, { innerHTML: scrambleText({ chars: 'uppercase', seed: 2 }), duration: 1000 });
      await delay(300);
      if (docsRef.current)
        animate(docsRef.current.querySelectorAll('.doc-btn'), {
          opacity: [0, 1], translateX: [-16, 0], duration: 350, delay: stagger(80), ease: 'outCubic',
        });
      await delay(200);
      if (btnRef.current)
        animate(btnRef.current, { opacity: [0, 1], scale: [0.95, 1], duration: 400, ease: 'outBack' });
    })();
  }, []);

  const zone = remaining < 300 ? 'critical' : remaining < 600 ? 'warn' : 'normal';
  const timeColor = zone === 'critical' ? 'text-red-400' : zone === 'warn' ? 'text-yellow-400' : 'text-[#c8ff00]';

  return (
    <div className="min-h-screen bg-[#030712] flex items-center justify-center px-6" style={{
      backgroundImage: 'linear-gradient(rgba(200,255,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.025) 1px, transparent 1px)',
      backgroundSize: '64px 64px',
    }}>
      <div ref={cardRef} className="w-full max-w-lg" style={{ opacity: 0 }}>

        {/* Header */}
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-3 py-1 text-xs font-semibold text-[#c8ff00] mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c8ff00] animate-pulse inline-block" />
            LAB8 · กำลังจะเริ่มการทดลอง
          </span>
          <h1 ref={titleRef} className="text-2xl font-bold text-white mb-2">
            กฎของ Biot-Savart และสนามแม่เหล็ก
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            ศึกษาสนามแม่เหล็กที่เกิดจากลวดตัวนำรูปทรงต่างๆ<br />
            และตรวจสอบความถูกต้องของกฎ Biot-Savart เชิงทดลอง
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-gray-900/60 p-6 mb-5">

          {/* Time remaining */}
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/[0.06]">
            <span className="text-xs text-gray-500 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              เวลาที่เหลือสำหรับเซสชันนี้
            </span>
            <span className={`font-mono font-bold text-sm tabular-nums ${timeColor} ${zone === 'critical' ? 'animate-pulse' : ''}`}>
              {fmtCountdown(remaining)}
            </span>
          </div>

          {/* Lab info */}
          <div className="grid grid-cols-2 gap-3 mb-5 text-xs">
            {[
              { label: 'รหัสการทดลอง', value: 'LAB8' },
              { label: 'ระยะเวลา', value: '120 นาที' },
              { label: 'อุปกรณ์หลัก', value: 'ขดลวด / โซลีนอยด์' },
              { label: 'ระดับ', value: 'ปฏิบัติการฟิสิกส์' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-gray-950/60 border border-white/[0.06] px-3 py-2.5">
                <p className="text-gray-600 mb-0.5">{label}</p>
                <p className="text-white font-medium">{value}</p>
              </div>
            ))}
          </div>

          {/* Documents */}
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">เอกสารประกอบการทดลอง</p>
          <div ref={docsRef} className="flex flex-col gap-2">
            {LAB8_DOCS.map(({ label, file }) => (
              <a
                key={file}
                href={`/doc/lab8/${encodeURIComponent(file)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="doc-btn flex items-center gap-3 rounded-xl border border-white/[0.08] bg-gray-950/60 px-4 py-2.5 text-xs text-gray-300 hover:border-[#c8ff00]/30 hover:text-[#c8ff00] transition-colors group"
                style={{ opacity: 0 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-600 group-hover:text-[#c8ff00] transition-colors">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <polyline points="9 15 12 18 15 15" />
                </svg>
                <span className="flex-1 truncate">{label}</span>
                <span className="text-[10px] text-gray-600 font-mono shrink-0">PDF</span>
              </a>
            ))}
          </div>
        </div>

        {/* Start button */}
        <button
          ref={btnRef}
          onClick={onStart}
          className="w-full rounded-2xl bg-[#c8ff00] py-3.5 text-sm font-bold text-gray-950 hover:bg-white transition-colors"
          style={{ opacity: 0, boxShadow: '0 0 32px rgba(200,255,0,0.3)' }}
        >
          เริ่มการทดลอง →
        </button>
      </div>
    </div>
  );
}

// ── Guest Lab View ────────────────────────────────────────────────────────────

type GuestState =
  | { status: 'loading' }
  | { status: 'ready'; labName: string; labCode: string; hostName: string; endTime: string }
  | { status: 'error'; message: string };

function GuestLabView({ roomCode }: { roomCode: string }) {
  const [state, setState] = useState<GuestState>({ status: 'loading' });

  useEffect(() => {
    fetch(`/api/lab/join?room=${roomCode}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setState({ status: 'ready', labName: d.lab_name, labCode: d.lab_code, hostName: d.host_name, endTime: d.end_time });
        } else {
          setState({ status: 'error', message: d.error ?? 'รหัสห้องไม่ถูกต้อง' });
        }
      })
      .catch(() => setState({ status: 'error', message: 'ไม่สามารถเชื่อมต่อได้' }));
  }, [roomCode]);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center">
        <svg className="animate-spin text-[#c8ff00]" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center px-6 text-center">
        <div className="fixed inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(200,255,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.03) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }} />
        <div className="relative z-10 max-w-sm w-full">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">ไม่สามารถเข้าห้องได้</h1>
          <p className="text-sm text-gray-400 mb-6">{state.message}</p>
          <a href="/dashboard"
            className="inline-block rounded-full bg-[#c8ff00] px-6 py-2.5 text-sm font-semibold text-gray-950 hover:bg-white transition-colors"
            style={{ boxShadow: '0 0 20px rgba(200,255,0,0.25)' }}>
            กลับ Dashboard
          </a>
        </div>
      </div>
    );
  }

  const router = useRouter();
  const { labName, labCode, hostName, endTime } = state;
  const [remaining, setRemaining] = useState(() => getRemaining(endTime));
  useEffect(() => {
    const t = setInterval(() => {
      const secs = getRemaining(endTime);
      setRemaining(secs);
      if (secs === 0) router.replace('/dashboard');
    }, 1000);
    return () => clearInterval(t);
  }, [endTime, router]);

  return (
    <div className="flex flex-col h-screen bg-[#030712] text-white overflow-hidden">
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(200,255,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.025) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }} />

      {/* Header */}
      <div className="relative z-10 shrink-0 h-12 border-b border-white/10 bg-gray-950/80 backdrop-blur flex items-center justify-between px-4 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 rounded-md border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-[#c8ff00]">
            {roomCode}
          </span>
          <span className="text-sm text-white truncate">{labName}</span>
          <span className="hidden sm:block text-[10px] text-gray-500 shrink-0">เจ้าของห้อง: {hostName}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-500 font-mono">{hhmmss(remaining)}</span>
          <span className="text-[10px] border border-[#c8ff00]/20 text-[#c8ff00]/60 rounded-full px-2 py-0.5">Guest</span>
          <a href="/dashboard" className="text-[11px] text-gray-500 hover:text-white transition-colors">← Dashboard</a>
        </div>
      </div>

      {/* Chat */}
      <div className="relative z-10 flex-1 min-h-0 max-w-2xl w-full mx-auto p-4">
        <div className="h-full rounded-xl border border-white/10 bg-gray-900/50 overflow-hidden flex flex-col">
          <div className="shrink-0 px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c8ff00] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#c8ff00]" />
            </span>
            <span className="text-xs font-semibold text-white">แชทห้องแลป</span>
            <span className="ml-auto font-mono text-[10px] text-gray-600">{labCode}</span>
          </div>
          <div className="flex-1 min-h-0">
            <LabChatPanel labCode={roomCode} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function LabPageInner() {
  const searchParams = useSearchParams();
  const guestRoom = searchParams.get('room');
  if (guestRoom) return <GuestLabView roomCode={guestRoom.toUpperCase()} />;
  return <HostLabPage />;
}

export default function RemoteLabPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#030712] flex items-center justify-center">
        <svg className="animate-spin text-[#c8ff00]" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
      </div>
    }>
      <LabPageInner />
    </Suspense>
  );
}

function HostLabPage() {
  const { access, onComplete } = useAccessGate();
  const [labStarted, setLabStarted] = useState(false);
  const [instrument, setInstrument] = useState(0);
  const [I, setI] = useState(5.0);
  const [z, setZ] = useState(0); // Z position in metres (solenoid only, ±0.15 m)
  const [measData, setMeasData] = useState<Map<number, { bMeasured: number; bTheory: number }>>(new Map());
  const [realSensorValue, setRealSensorValue] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const isBusy = isRunning || isMoving;
  const topRowRef = useRef<HTMLDivElement>(null);
  const btmRowRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const layoutCtrlRef = useRef<ReturnType<typeof createLayout> | null>(null);
  const prevInstrumentRef = useRef(instrument);

  // Create layout controller after mount
  useEffect(() => {
    if (!leftColRef.current) return;
    layoutCtrlRef.current = createLayout(leftColRef.current);
  }, []);

  // Record layout BEFORE instrument changes, animate AFTER DOM update
  const handleInstrumentSelect = useCallback((i: number) => {
    layoutCtrlRef.current?.record();
    setInstrument(i);
  }, []);

  useLayoutEffect(() => {
    if (prevInstrumentRef.current === instrument) return;
    const inst = instruments[instrument];
    const typeChanged = inst.type !== prevInstType.current;
    prevInstrumentRef.current = instrument;
    layoutCtrlRef.current?.animate({ duration: 600, ease: 'outCubic', delay: stagger(30) });
    if (typeChanged && rightColRef.current) {
      prevInstType.current = inst.type;
      animate(rightColRef.current, {
        opacity: [0, 1],
        scale: [0.94, 1],
        translateX: [24, 0],
        duration: 480,
        ease: 'outBack(1.2)',
      });
    }
  }, [instrument]);

  // Reset I, Z, and measurement data when instrument changes
  useEffect(() => {
    const inst = instruments[instrument];
    setI(inst.I0);
    setZ(0);
    setMeasData(new Map());
  }, [instrument]);

  const prevInstType = useRef<'coil' | 'solenoid'>('coil');
  const rightColRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);

  const runScript = useCallback(async (script: string) => {
    try {
      await fetch('/api/hardware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script })
      });
    } catch (err) {
      console.error('Failed to execute hardware script', err);
    }
  }, []);

  const handleLabExit = useCallback(async () => {
    const breakScript = prevInstType.current === 'coil' ? 'coil_b.py' : 'sole_b.py';
    await runScript(breakScript);
  }, [runScript]);

  // Hardware script execution
  useEffect(() => {

    const inst = instruments[instrument];
    const targetScript = ['coil_1.py', 'coil_2.py', 'coil_3.py', 'sole_75.py', 'sole_150.py'][instrument] || 'coil_1.py';

    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      setIsRunning(true);
      runScript(targetScript).finally(() => setIsRunning(false));
      prevInstType.current = inst.type;
      return;
    }

    const executeSwitch = async () => {
      setIsRunning(true);
      try {
        // 1. Run break script for the PREVIOUS instrument type
        const breakScript = prevInstType.current === 'coil' ? 'coil_b.py' : 'sole_b.py';
        await runScript(breakScript);

        // Hardware safety delay
        await new Promise(r => setTimeout(r, 500));

        // 2. Run new target script
        await runScript(targetScript);
        prevInstType.current = inst.type;
      } finally {
        setIsRunning(false);
      }
    };

    executeSwitch();
  }, [instrument, runScript]);

  // Current fluctuation ±1.5 % of I₀
  useEffect(() => {
    const { I0 } = instruments[instrument];
    const amp = I0 * 0.015;
    const lo = I0 * 0.985, hi = I0 * 1.015;
    const t = setInterval(() => {
      setI(v => +clamp(v + (Math.random() - 0.5) * amp * 2, lo, hi).toFixed(4));
    }, 1000);
    return () => clearInterval(t);
  }, [instrument]);

  // Read real sensor data via WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      // Connect to the same domain (e.g. Cloudflare tunnel domain) to let Next.js proxy it to 8000
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/sensor`;
      
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && typeof data.value === 'number') {
            setRealSensorValue(data.value);
          }
        } catch (err) { }
      };
      ws.onclose = () => {
        reconnectTimeout = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  // Entry animations — run only after both access granted AND intro dismissed
  useEffect(() => {
    if (access.status !== 'allowed' || !labStarted) return;
    if (topRowRef.current) animate(topRowRef.current, { opacity: [0, 1], translateY: [-16, 0], duration: 650, ease: 'outCubic' });
    if (btmRowRef.current) animate(btmRowRef.current, { opacity: [0, 1], translateY: [16, 0], duration: 650, delay: 120, ease: 'outCubic' });
    if (rightRef.current) animate(rightRef.current, { opacity: [0, 1], translateX: [24, 0], duration: 650, delay: 80, ease: 'outCubic' });
  }, [access.status, labStarted]);

  // ── Access gate ───────────────────────────────────────────────────────────
  if (access.status === 'loading') {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center">
        <svg className="animate-spin text-[#c8ff00]" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
      </div>
    );
  }
  if (access.status === 'denied') return <AccessDeniedScreen access={access} />;
  if (!labStarted) return <LabIntroScreen endTime={access.end_time} onStart={() => setLabStarted(true)} />;

  const inst = instruments[instrument];
  const I0 = inst.I0;
  const bTheory = inst.type === 'coil'
    ? calcBCoil(inst.turns, I0, inst.R)
    : calcBSolenoid(inst.N, I0, inst.L, inst.R, z);
  const bMeasured = realSensorValue !== null
    ? realSensorValue
    : (inst.type === 'coil'
      ? calcBCoil(inst.turns, I, inst.R)
      : calcBSolenoid(inst.N, I, inst.L, inst.R, z));

  return (
    <div className="flex flex-col h-screen bg-[#030712] text-white overflow-hidden">
      <SessionBar endTime={access.end_time} onComplete={onComplete} onExit={handleLabExit} roomCode={access.room_code} />
      <div className="flex-1 overflow-hidden p-3 flex gap-3">

        {/* Left ── Camera + FieldViz (top) · InstrSel + Sensor (bottom) */}
        <div ref={leftColRef} className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
          <div
            ref={topRowRef}
            className={`flex-1 min-h-0 grid gap-3 grid-cols-1 xl:grid-cols-2`}
            style={{ opacity: 0 }}
          >
            <CameraSection stream="dji" label="กล้องหลัก — ด้านหน้า" />
            <div ref={rightColRef} className="flex flex-col gap-3 h-full min-h-0">
              <CameraSection stream="webc1" label="กล้องเสริม — ด้านข้าง" />
            </div>
          </div>
          <div
            ref={btmRowRef}
            className="shrink-0 flex items-stretch gap-3"
            style={{ opacity: 0 }}
          >
            {/* Left column — selector stacked above sensor values */}
            <div className="shrink-0 flex flex-col gap-3 w-[230px]">
              <InstrumentSelector active={instrument} onSelect={handleInstrumentSelect} disabled={isBusy} />
              <SensorPanel
                inst={inst} I={I} I0={I0}
                bTheory={bTheory} bMeasured={bMeasured}
                z={z}
              />
            </div>
            <FormulaPanel inst={inst} I={I} z={z} />
            <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3">
              <div className="flex-1 min-h-0 flex flex-col">
                <SplitFieldPanel
                  instType={inst.type}
                  bTheory={bTheory} bMeasured={bMeasured}
                  I={I} I0={I0} z={z}
                />
              </div>
              {inst.type === 'solenoid' && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <SolenoidDataPanel
                    z={z} setZ={setZ}
                    bMeasured={bMeasured} bTheory={bTheory}
                    measData={measData} setMeasData={setMeasData}
                    N={inst.N}
                    isMoving={isMoving} setIsMoving={setIsMoving}
                    disabled={isBusy}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right ── AI / Log / Chat tabs */}
        <div
          ref={rightRef}
          className="w-[260px] shrink-0 flex flex-col overflow-hidden"
          style={{ opacity: 0 }}
        >
          <RightTabs
            chatProps={{ inst, I, I0, bTheory, bMeasured, z }}
            logProps={{ instrument, I, bMeasured, z, instType: inst.type }}
            labCode={access.room_code}
          />
        </div>

      </div>
    </div>
  );
}

// ── Right Tabs ───────────────────────────────────────────────────────────────

type ChatRoomMsg = { id: number; user_id: string; user_name: string; content: string; created_at: string };

function LabChatPanel({ labCode }: { labCode: string | null }) {
  const [messages, setMessages] = useState<ChatRoomMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [myName, setMyName] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);
  const myNameRef = useRef('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const readyForSound = useRef(false); // true after initial fetch completes

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.ok) setMyName(d.user.name); });
  }, []);

  // Keep ref in sync so addMessages (stable callback) can access current name
  useEffect(() => { myNameRef.current = myName; }, [myName]);

  const addMessages = useCallback((incoming: ChatRoomMsg[]) => {
    if (!incoming.length) return;
    setMessages(prev => {
      const seen = new Set(prev.map(m => m.id));
      const fresh = incoming.filter(m => !seen.has(m.id));
      if (!fresh.length) return prev;
      lastIdRef.current = Math.max(lastIdRef.current, fresh[fresh.length - 1].id);

      // Play sound only for others' messages after initial load
      if (
        readyForSound.current &&
        myNameRef.current &&
        fresh.some(m => m.user_name !== myNameRef.current)
      ) {
        if (!audioRef.current) audioRef.current = new Audio('/sound/ack.mp3');
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => { });
      }

      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
      return [...prev, ...fresh];
    });
  }, []);

  // Initial load + poll fallback (catches missed WS messages)
  const fetchMessages = useCallback(async () => {
    if (!labCode) return;
    const res = await fetch(`/api/lab/chat?lab=${labCode}&since=${lastIdRef.current}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.messages?.length) addMessages(data.messages);
  }, [labCode, addMessages]);

  useEffect(() => {
    if (!labCode) return;
    fetchMessages().then(() => { readyForSound.current = true; });
    const t = setInterval(fetchMessages, 10_000);
    return () => clearInterval(t);
  }, [fetchMessages, labCode]);

  // WebSocket — real-time delivery for all clients
  useEffect(() => {
    if (!labCode) return;
    let active = true;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;

    function connect() {
      if (!active) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/ws?room=${encodeURIComponent(`lab:${labCode}`)}`);

      ws.onmessage = (e) => {
        if (!active) return;
        try {
          const msg = JSON.parse(e.data as string);
          if (msg.type === 'chat' && msg.payload?.id) addMessages([msg.payload]);
        } catch { }
      };

      ws.onopen = () => { retryDelay = 1000; };

      ws.onclose = () => {
        if (!active) return;
        // Reconnect with backoff (max 30s)
        retryTimer = setTimeout(() => { retryDelay = Math.min(retryDelay * 2, 30_000); connect(); }, retryDelay);
      };

      // Suppress uncaught error — onclose will handle reconnect
      ws.onerror = () => { };
    }

    connect();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [labCode, addMessages]);

  async function handleSend() {
    if (!input.trim() || sending || !labCode) return;
    setSending(true);
    const text = input.trim();
    setInput('');
    try {
      const res = await fetch('/api/lab/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lab: labCode, content: text }),
      });
      if (res.ok) {
        const data = await res.json();
        // Add own message from response — WS broadcast handles delivery to others
        if (data.message) addMessages([data.message]);
      }
    } finally {
      setSending(false);
    }
  }

  if (!labCode) {
    return (
      <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-gray-900/50 flex items-center justify-center">
        <p className="text-[11px] text-gray-600">แชทไม่พร้อมใช้งาน</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-gray-900/50 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-[10px] text-gray-600 pt-4">ยังไม่มีข้อความ</p>
        )}
        {messages.map(m => {
          const isMe = m.user_name === myName;
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] text-[11px] rounded-xl px-2.5 py-1.5 leading-relaxed ${isMe
                ? 'bg-[#c8ff00]/10 border border-[#c8ff00]/20 text-[#c8ff00]/90'
                : 'bg-gray-800/60 border border-white/[0.07] text-gray-300'
                }`}>
                {!isMe && <p className="text-[9px] text-gray-500 mb-0.5 font-semibold">{m.user_name}</p>}
                {m.content}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="shrink-0 p-2 border-t border-white/5 flex gap-1.5 items-center">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="ส่งข้อความ…"
          className="flex-1 rounded-lg border border-white/10 bg-gray-950/80 px-2.5 py-1.5 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-[#c8ff00]/40 transition-colors"
        />
        <button onClick={handleSend} disabled={sending || !input.trim()}
          className="shrink-0 h-8 w-8 rounded-lg bg-[#c8ff00]/10 border border-[#c8ff00]/30 text-[#c8ff00] flex items-center justify-center hover:bg-[#c8ff00]/20 disabled:opacity-30 transition-colors">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

type RightTabId = 'ai' | 'log' | 'chat';

function RightTabs({ chatProps, logProps, labCode }: {
  chatProps: { inst: Inst; I: number; I0: number; bTheory: number; bMeasured: number; z: number };
  logProps: { instrument: number; I: number; bMeasured: number; z: number; instType: 'coil' | 'solenoid' };
  labCode: string | null;
}) {
  const [tab, setTab] = useState<RightTabId>('ai');

  const TABS: { id: RightTabId; label: string }[] = [
    { id: 'ai', label: 'AI ผู้ช่วย' },
    { id: 'log', label: 'บันทึก' },
    { id: 'chat', label: 'แชทห้อง' },
  ];

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Tab header */}
      <div className="shrink-0 flex rounded-xl border border-white/10 overflow-hidden bg-gray-900/50">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 text-[10px] font-semibold transition-colors ${tab === t.id
              ? 'bg-[#c8ff00]/10 text-[#c8ff00] border-b border-[#c8ff00]/50'
              : 'text-gray-500 hover:text-gray-300'
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panels — all mounted, hidden by CSS to preserve state */}
      <div className={`flex-1 min-h-0 flex flex-col ${tab !== 'ai' ? 'hidden' : ''}`}>
        <ChatPanel {...chatProps} />
      </div>
      <div className={`flex-1 min-h-0 flex flex-col ${tab !== 'log' ? 'hidden' : ''}`}>
        <LogPanel {...logProps} />
      </div>
      <div className={`flex-1 min-h-0 flex flex-col ${tab !== 'chat' ? 'hidden' : ''}`}>
        <LabChatPanel labCode={labCode} />
      </div>
    </div>
  );
}

// ── Session Bar ───────────────────────────────────────────────────────────────

function getRemaining(endTime: string) {
  return Math.max(0, Math.floor((new Date(endTime).getTime() - Date.now()) / 1000));
}

function fmtCountdown(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function RoomCodeBadge({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const badgeRef = useRef<HTMLButtonElement>(null);

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    if (badgeRef.current) {
      animate(badgeRef.current, {
        scale: [1, 1.18, 1],
        duration: 400,
        ease: 'outBack(2)',
      });
    }
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <span className="flex items-center gap-1.5">
      <span className="text-gray-500 text-[10px]">รหัสห้อง</span>
      <button
        ref={badgeRef}
        onClick={handleCopy}
        title="คัดลอกรหัสห้อง"
        className={`flex items-center gap-1 font-mono font-bold tracking-widest rounded-md border px-1.5 py-0.5 text-[11px] transition-colors cursor-pointer
          ${copied
            ? 'border-[#c8ff00]/60 bg-[#c8ff00]/15 text-[#c8ff00]'
            : 'border-[#c8ff00]/30 bg-[#c8ff00]/5 text-[#c8ff00] hover:bg-[#c8ff00]/15 hover:border-[#c8ff00]/50'
          }`}
        style={{ boxShadow: copied ? '0 0 14px rgba(200,255,0,0.35)' : '0 0 8px rgba(200,255,0,0.15)' }}
      >
        {copied ? (
          <>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            คัดลอกแล้ว
          </>
        ) : code}
      </button>
    </span>
  );
}

function SessionBar({ endTime, onComplete, onExit, roomCode }: { endTime: string; onComplete: () => void; onExit?: () => Promise<void>; roomCode?: string | null }) {
  const router = useRouter();
  const [secs, setSecs] = useState(0);
  const [remaining, setRemaining] = useState(() => getRemaining(endTime));
  const [panelOpen, setPanelOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const barRef = useRef<HTMLElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const countdownRef = useRef<HTMLSpanElement>(null);
  const prevZone = useRef<'normal' | 'warn' | 'critical'>('normal');
  const autoCompleted = useRef(false);
  const { notifications, unread, markAllRead } = useNotifications();

  // เวลาหมด → mark complete อัตโนมัติ (ทันทีที่ countdown ถึง 0)
  useEffect(() => {
    if (remaining <= 0 && !autoCompleted.current) {
      autoCompleted.current = true;
      onComplete();
    }
  }, [remaining, onComplete]);

  async function handleLeave() {
    await onExit?.();
    onComplete();
    router.push('/dashboard');
  }

  useEffect(() => {
    if (barRef.current) animate(barRef.current, { opacity: [0, 1], translateY: [-20, 0], duration: 600, ease: 'outCubic' });
    if (labelRef.current) animate(labelRef.current, { innerHTML: scrambleText({ chars: 'braille', from: 'left', override: '' }) });
    const t = setInterval(() => {
      setSecs(s => s + 1);
      setRemaining(getRemaining(endTime));
    }, 1000);
    return () => clearInterval(t);
  }, [endTime]);

  // Animate countdown when crossing warning thresholds
  useEffect(() => {
    const zone = remaining < 300 ? 'critical' : remaining < 600 ? 'warn' : 'normal';
    if (zone !== prevZone.current && countdownRef.current) {
      animate(countdownRef.current, { scale: [1.3, 1], duration: 500, ease: 'outBack' });
    }
    prevZone.current = zone;
  }, [remaining]);

  return (
    <header ref={barRef} className="shrink-0 border-b border-white/10 bg-[#030712]/95 h-12 px-4 flex items-center justify-between gap-4" style={{ opacity: 0 }}>
      <div className="flex items-center gap-2">
        <Image src="/logo.svg" width={24} height={24} alt="PaNa LabS" className="rounded-md shrink-0" />
        <span className="text-sm font-semibold">PaNa<span className="text-[#c8ff00]">LabS</span></span>
      </div>
      <div className="hidden md:flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#c8ff00] animate-pulse inline-block" style={{ boxShadow: '0 0 4px #c8ff00' }} />
          <span className="text-[#c8ff00] font-semibold">LIVE</span>
        </span>
        {roomCode && (
          <>
            <span className="text-gray-600">|</span>
            <RoomCodeBadge code={roomCode} />
          </>
        )}
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">LAB 8: <span ref={labelRef} className="text-white">สนามแม่เหล็กและกฎไบโอต-ซาวัต</span></span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">เวลา: <span className="font-mono text-white">{hhmmss(secs)}</span></span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400 flex items-center gap-1.5">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          สิ้นสุดใน:
          <span
            ref={countdownRef}
            className={`font-mono font-semibold tabular-nums ${remaining < 300 ? 'text-red-400' : remaining < 600 ? 'text-yellow-400' : 'text-white'
              } ${remaining < 300 ? 'animate-pulse' : ''}`}
          >
            {fmtCountdown(remaining)}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {/* Documents panel */}
        <div className="relative">
          <button
            onClick={() => { setDocsOpen(v => !v); setPanelOpen(false); }}
            className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${docsOpen
              ? 'border-[#c8ff00]/40 bg-[#c8ff00]/10 text-[#c8ff00]'
              : 'border-white/10 text-gray-400 hover:border-[#c8ff00]/30 hover:text-white'
              }`}
            aria-label="เอกสารประกอบแลป"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="13" x2="15" y2="13" />
              <line x1="9" y1="17" x2="15" y2="17" />
            </svg>
          </button>
          {docsOpen && createPortal(
            <>
              <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px]" onClick={() => setDocsOpen(false)} />
              <LabDocsPanel onClose={() => setDocsOpen(false)} />
            </>,
            document.body
          )}
        </div>
        {/* Notification bell */}
        <div className="relative">
          <button
            onClick={() => { setPanelOpen(v => !v); setDocsOpen(false); }}
            className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${panelOpen
              ? 'border-[#c8ff00]/40 bg-[#c8ff00]/10 text-[#c8ff00]'
              : 'border-white/10 text-gray-400 hover:border-[#c8ff00]/30 hover:text-white'
              }`}
            aria-label="การแจ้งเตือน"
          >
            <BellIcon size={15} />
            {unread > 0 && <UnreadBadge count={unread} />}
          </button>
          {panelOpen && createPortal(
            <>
              <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px]" onClick={() => setPanelOpen(false)} />
              <div className="fixed top-12 right-4 z-[100]">
                <NotifPanel
                  notifications={notifications}
                  unread={unread}
                  onMarkAllRead={markAllRead}
                  maxH="280px"
                  panelClass="w-64"
                />
              </div>
            </>,
            document.body
          )}
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-xs px-3 py-1.5 rounded-md border border-white/10 text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          กลับ
        </button>
        <button
          onClick={handleLeave}
          className="text-xs px-3 py-1.5 rounded-md bg-[#c8ff00]/10 border border-[#c8ff00]/30 text-[#c8ff00] hover:bg-[#c8ff00]/20 font-semibold transition-colors flex items-center gap-1.5"
          style={{ boxShadow: '0 0 12px rgba(200,255,0,0.15)' }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          เสร็จสิ้น
        </button>
      </div>
    </header>
  );
}

// ── Camera ────────────────────────────────────────────────────────────────────

function CameraSection({ stream = 'dji', label = 'กล้องหลัก — ด้านหน้า' }: { stream?: string; label?: string }) {
  const crossRef = useRef<HTMLDivElement>(null);
  const cornersRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    const ring = crossRef.current?.querySelector('.cross-ring') as HTMLElement | null;
    if (ring) animate(ring, { rotate: [0, 360], duration: 12000, ease: 'linear', loop: true });
    if (cornersRef.current) {
      animate(cornersRef.current.querySelectorAll('.corner'), {
        opacity: [0, 1], scale: [0.4, 1], duration: 500, delay: stagger(80, { start: 300 }), ease: 'outBack',
      });
    }
  }, []);

  // WebRTC (WHEP) stream connection
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let pc: RTCPeerConnection | null = null;
    let stopped = false;

    async function connect() {
      if (stopped || !video) return;
      setStreamError('กำลังเชื่อมต่อ WebRTC...');

      pc = new RTCPeerConnection();
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      pc.ontrack = (event) => {
        if (!video) return;
        video.srcObject = event.streams[0] ?? null;
        video.play().catch(console.error);
        setStreamError(null);
      };

      pc.oniceconnectionstatechange = () => {
        if (!pc) return;
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          setStreamError('การเชื่อมต่อขาดหาย กำลังลองใหม่...');
          pc.close();
          if (!stopped) setTimeout(connect, 3000);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering (with 2s timeout)
      await Promise.race([
        new Promise<void>((resolve) => {
          if (pc!.iceGatheringState === 'complete') { resolve(); return; }
          const onStateChange = () => {
            if (pc!.iceGatheringState === 'complete') {
              pc!.removeEventListener('icegatheringstatechange', onStateChange);
              resolve();
            }
          };
          pc!.addEventListener('icegatheringstatechange', onStateChange);
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);

      const mediamtxUrl = process.env.NEXT_PUBLIC_MEDIAMTX_URL ?? 'http://127.0.0.1:8889';
      const resp = await fetch(`${mediamtxUrl}/${stream}/whep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription!.sdp,
      });

      if (!resp.ok) {
        setStreamError('ไม่สามารถเชื่อมต่อกล้องได้');
        pc.close();
        if (!stopped) setTimeout(connect, 3000);
        return;
      }

      const sdpAnswer = await resp.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
    }

    connect().catch(() => {
      setStreamError('ไม่สามารถเชื่อมต่อกล้องได้');
      if (!stopped) setTimeout(connect, 3000);
    });

    return () => {
      stopped = true;
      pc?.close();
      if (video) video.srcObject = null;
    };
  }, []);

  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/50 overflow-hidden h-full">
      <div className="relative h-full bg-[#050810] overflow-hidden flex items-center justify-center">
        {/* Video stream */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover z-0"
          autoPlay
          playsInline
          muted
        />

        {/* Reconnect UI */}
        {streamError && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#050810]/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin text-[#c8ff00]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              <span className="text-[10px] text-[#c8ff00] font-mono tracking-widest uppercase">{streamError}</span>
            </div>
          </div>
        )}

        <div className="absolute inset-0 pointer-events-none z-10" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)' }} />
        <div className="absolute inset-0 pointer-events-none opacity-10" style={{
          backgroundImage: 'linear-gradient(rgba(200,255,0,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.5) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }} />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 select-none pointer-events-none">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(200,255,0,0.12)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" />
          </svg>
          <span className="text-[9px] text-[#c8ff00]/20 font-mono uppercase tracking-widest">{label}</span>
        </div>
        <div ref={cornersRef}>
          <div className="corner absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#c8ff00]/40" style={{ opacity: 0 }} />
          <div className="corner absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-[#c8ff00]/40" style={{ opacity: 0 }} />
          <div className="corner absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-[#c8ff00]/40" style={{ opacity: 0 }} />
          <div className="corner absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#c8ff00]/40" style={{ opacity: 0 }} />
        </div>
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/70 border border-white/10 px-2.5 py-0.5 text-[10px] z-20">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
          <span className="text-white font-semibold">REC</span>
          <span className="text-gray-500">·</span>
          <span className="text-gray-400">กล้องหลัก</span>
        </div>
        <div ref={crossRef} className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="relative w-8 h-8">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-[#c8ff00]/25" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#c8ff00]/25" />
            <div className="cross-ring absolute inset-1.5 rounded-full border border-dashed border-[#c8ff00]/20" />
          </div>
        </div>
        <CamTimestamp />
      </div>
    </div>
  );
}

function CamTimestamp() {
  const [time, setTime] = useState('');
  useEffect(() => {
    setTime(nowTime());
    const t = setInterval(() => setTime(nowTime()), 1000);
    return () => clearInterval(t);
  }, []);
  return <div className="absolute bottom-2 right-2 text-[9px] font-mono text-[#c8ff00]/40 z-20 select-none">{time}</div>;
}

// ── Instrument Selector ───────────────────────────────────────────────────────

function InstrumentSelector({ active, onSelect, disabled }: { active: number; onSelect: (i: number) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const activeInst = instruments[active];

  useEffect(() => {
    if (!open) return;
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 6, left: r.left, width: r.width });
    }
    if (!dropRef.current) return;
    animate(dropRef.current, { opacity: [0, 1], translateY: [-8, 0], scale: [0.96, 1], duration: 260, ease: 'outBack' });
    const items = dropRef.current.querySelectorAll('.inst-item');
    if (items.length)
      animate(items, { opacity: [0, 1], translateX: [-6, 0], duration: 200, delay: stagger(30, { start: 80 }), ease: 'outCubic' });
  }, [open]);

  function handleSelect(i: number) {
    if (i === active || disabled) return;
    onSelect(i);
    setOpen(false);
  }

  const GROUPS = [
    { label: 'ตอนที่ 1 — ขดลวดเดี่ยว', type: 'coil' as const },
    { label: 'ตอนที่ 2 — โซลีนอยด์',   type: 'solenoid' as const },
  ];

  return (
    <div ref={wrapRef} className="relative w-full z-[100]">
      {/* Trigger — compact single-row button */}
      <button
        onClick={() => { if (!disabled) setOpen(v => !v); }}
        disabled={disabled}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border bg-gray-900/50 text-left transition-colors
          ${disabled ? 'opacity-60 cursor-not-allowed border-white/10' : 'cursor-pointer hover:border-white/20'}
          ${open ? 'border-[#c8ff00]/40' : 'border-white/10'}
        `}
      >
        <div className={disabled ? 'text-gray-600' : 'text-[#c8ff00]'}>{activeInst.icon}</div>
        <div className="min-w-0">
          <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider leading-none mb-0.5">อุปกรณ์วัด</p>
          <p className="text-[12px] font-semibold text-white leading-none truncate">{activeInst.name}</p>
          <p className="text-[9px] text-gray-500 mt-0.5 truncate">{activeInst.sub}</p>
        </div>
        <div className="flex items-center gap-1 text-[9px] font-semibold text-[#c8ff00] shrink-0 ml-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#c8ff00] animate-pulse" />
          <span>ON</span>
        </div>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180 text-[#c8ff00]' : 'text-gray-500'}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div ref={dropRef}
            className="fixed z-[100] rounded-xl border border-white/10 bg-gray-950 p-2 flex flex-col gap-0.5"
            style={{ opacity: 0, top: dropPos.top, left: dropPos.left, width: dropPos.width, boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)' }}
          >
            {GROUPS.map(g => (
              <div key={g.type}>
                <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest px-2 py-1">{g.label}</p>
                {instruments.map((inst, i) => {
                  if (inst.type !== g.type) return null;
                  const isCur = i === active;
                  return (
                    <button
                      key={inst.id}
                      onClick={() => handleSelect(i)}
                      className={`inst-item relative w-full rounded-lg border p-2.5 text-left transition-colors overflow-hidden
                        ${isCur
                          ? 'bg-[#c8ff00]/8 border-[#c8ff00]/40 text-[#c8ff00]'
                          : 'bg-transparent border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'}
                      `}
                      style={{ opacity: 0, boxShadow: isCur ? '0 0 16px rgba(200,255,0,0.06) inset' : undefined }}
                    >
                      {isCur && <div className="absolute top-0 left-3 right-3 h-px bg-linear-to-r from-transparent via-[#c8ff00]/50 to-transparent" />}
                      <div className="flex items-center gap-2">
                        <div className={isCur ? 'text-[#c8ff00]' : 'text-gray-600'}>{inst.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold leading-none truncate">{inst.name}</p>
                          <p className={`text-[9px] mt-0.5 truncate ${isCur ? 'text-[#c8ff00]/60' : 'text-gray-600'}`}>{inst.sub}</p>
                        </div>
                        {isCur && (
                          <div className="ml-auto flex items-center gap-1 text-[9px] font-semibold text-[#c8ff00] shrink-0">
                            <span className="h-1 w-1 rounded-full bg-[#c8ff00] animate-pulse inline-block" />ON
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ── Split Field Panel ─────────────────────────────────────────────────────────

function SplitFieldPanel({ instType, bTheory, bMeasured, I, I0, z }: {
  instType: 'solenoid' | 'coil';
  bTheory: number; bMeasured: number;
  I: number; I0: number;
  z: number;
}) {
  const [split, setSplit] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || !containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    setSplit(clamp(((e.clientX - r.left) / r.width) * 100, 10, 90));
  }
  function onPointerUp() { dragging.current = false; }

  const Viz = instType === 'solenoid' ? SolenoidSVG : CoilSVG;

  return (
    <div className="flex-1 flex flex-col rounded-xl border border-white/10 bg-gray-900/50 overflow-hidden min-h-0">
      <div className="shrink-0 px-4 py-2 border-b border-white/5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider">
          <span style={{ color: '#c8ff00' }}>ทฤษฎี · {bTheory.toFixed(3)} mT</span>
          <span className="text-gray-600 font-normal">vs</span>
          <span style={{ color: '#22d3ee' }}>วัดจริง · {bMeasured.toFixed(3)} mT</span>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono shrink-0">
          {instType === 'solenoid' && (
            <span className="text-gray-500">Z = <span style={{ color: '#a78bfa' }}>{(z * 100).toFixed(0)} cm</span></span>
          )}
          <span className="text-gray-600">I₀ = {I0.toFixed(2)} A</span>
          <span className="text-gray-500">I = <span style={{ color: '#22d3ee' }}>{I.toFixed(3)} A</span></span>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative min-h-0 overflow-hidden select-none">
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          <Viz mode="theory" />
        </div>
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
          <Viz mode="measured" />
        </div>
        <span className="absolute top-2 left-3 text-[9px] font-bold pointer-events-none z-10 select-none" style={{ color: '#c8ff00', opacity: 0.6 }}>THEORY</span>
        <span className="absolute top-2 right-3 text-[9px] font-bold pointer-events-none z-10 select-none" style={{ color: '#22d3ee', opacity: 0.6 }}>MEASURED</span>
        <div
          className="absolute top-0 bottom-0 z-20 cursor-col-resize touch-none"
          style={{ left: `calc(${split}% - 12px)`, width: 24 }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        >
          <div className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-px bg-white/25" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-7 rounded-full bg-gray-800 border border-white/20 flex items-center justify-center gap-0.5">
            <div className="w-px h-3 bg-white/40 rounded-full" />
            <div className="w-px h-3 bg-white/40 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Field SVGs ────────────────────────────────────────────────────────────────
// Path directions follow physical field flow:
//   Solenoid inside: left → right (B field direction)
//   Solenoid outside: right → left (returning via top and bottom arcs)
//   Coil upper arcs: right (162) → left (158) via top
//   Coil lower arcs: right (162) → left (158) via bottom  ← corrected

const SOLENOID_OUTER: Record<'theory' | 'measured', string[]> = {
  theory: [
    'M 260,90 C 292,70 294,32 160,32 C 26,32 28,70 60,90',    // top small  RIGHT→LEFT ✓
    'M 260,90 C 292,110 294,148 160,148 C 26,148 28,110 60,90', // btm small  RIGHT→LEFT ✓
    'M 260,90 C 310,55 312,5 160,5 C 8,5 10,55 60,90',          // top large  RIGHT→LEFT ✓
    'M 260,90 C 310,125 312,175 160,175 C 8,175 10,125 60,90',  // btm large  RIGHT→LEFT ✓
  ],
  measured: [
    'M 260,90 C 294,72 296,30 160,34 C 23,30 24,68 60,90',
    'M 260,90 C 296,110 298,150 160,146 C 22,150 24,112 60,90',
    'M 260,90 C 312,57 314,3 160,7 C 6,3 8,53 60,90',
    'M 260,90 C 314,125 316,177 160,173 C 4,177 8,127 60,90',
  ],
};
// Inside: L→R (correct field direction)
const SOLENOID_INSIDE = ['M 60,74 L 260,74', 'M 60,90 L 260,90', 'M 60,106 L 260,106'];

function SolenoidSVG({ mode }: { mode: 'theory' | 'measured' }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const color = mode === 'theory' ? '#c8ff00' : '#22d3ee';
  useFlPathAnimation(svgRef, (i) => {
    // Scale duration to path length: inside lines ~200px, outer arcs ~350-500px
    if (i < 4) return 2800 + i * 300;   // outer arcs (longer path → slower dash)
    return 1600 + (i - 4) * 100;         // inside lines (shorter, faster flow)
  }, mode);
  return (
    <svg ref={svgRef} viewBox="0 0 320 180" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Solenoid body */}
      <rect x="60" y="64" width="200" height="52" fill={`${color}04`} stroke={`${color}25`} strokeWidth="1" />
      {/* Coil winding bumps — top edge (arcs bulging upward) */}
      {Array.from({ length: 11 }, (_, i) => (
        <path key={i} d={`M ${62 + i * 18},64 A 9,7 0 0 0 ${80 + i * 18},64`}
          fill="none" stroke={`${color}60`} strokeWidth="1.8" />
      ))}
      {/* Coil winding bumps — bottom edge (arcs bulging downward) */}
      {Array.from({ length: 11 }, (_, i) => (
        <path key={i} d={`M ${62 + i * 18},116 A 9,7 0 0 1 ${80 + i * 18},116`}
          fill="none" stroke={`${color}60`} strokeWidth="1.8" />
      ))}
      {/* N/S labels */}
      <text x="268" y="94" fontSize="11" fill={`${color}90`} fontFamily="monospace" fontWeight="bold">N</text>
      <text x="42" y="94" fontSize="11" fill={`${color}90`} fontFamily="monospace" fontWeight="bold">S</text>
      {/* Current direction arrows at ends */}
      <text x="268" y="108" fontSize="9" fill={`${color}50`} fontFamily="monospace">↑I</text>
      <text x="42" y="108" fontSize="9" fill={`${color}50`} fontFamily="monospace">↓I</text>
      {/* Outer field line loops (animated) */}
      {SOLENOID_OUTER[mode].map((d, i) => (
        <path key={i} className="fl" d={d} fill="none" stroke={color}
          strokeWidth={i < 2 ? 1.1 : 0.7} opacity={i < 2 ? 0.55 : 0.3} />
      ))}
      {/* Outer arc direction arrows (static) at midpoints */}
      <polygon points="165,28 157,32 165,36" fill={color} opacity="0.55" />  {/* top small arc mid */}
      <polygon points="165,144 157,148 165,152" fill={color} opacity="0.55" />  {/* btm small arc mid */}
      <polygon points="165,1 157,5 165,9" fill={color} opacity="0.3" />  {/* top large arc mid */}
      <polygon points="165,171 157,175 165,179" fill={color} opacity="0.3" />  {/* btm large arc mid */}
      {/* Inside field lines (animated) */}
      {SOLENOID_INSIDE.map((d, i) => (
        <path key={i} className="fl" d={d} fill="none" stroke={color} strokeWidth="1.5" opacity="0.9" />
      ))}
      {/* Inside direction arrows (static) */}
      {[74, 90, 106].map(y => (
        <polygon key={y} points={`154,${y - 4} 162,${y} 154,${y + 4}`} fill={color} opacity="0.8" />
      ))}
      <text x="160" y="171" fontSize="9" fill={`${color}35`} fontFamily="monospace" textAnchor="middle">
        {mode === 'theory' ? 'THEORETICAL · Bz=μ₀NI(a+b)/2L' : 'MEASURED · sensor data'}
      </text>
    </svg>
  );
}

// Coil axis lines: left axis flows RIGHT→LEFT (B points toward S on left side)
//                 right axis flows LEFT→RIGHT (B points away from N on right side)
const COIL_AXIAL = ['M 148,90 L 5,90', 'M 172,90 L 315,90'];
const COIL_LOOPS: Record<'theory' | 'measured', string[]> = {
  theory: [
    'M 162,88 C 183,78 190,56 160,46 C 130,56 137,78 158,88',   // upper small  R→L via top ✓
    'M 162,92 C 183,102 190,124 160,134 C 130,124 137,102 158,92', // lower small  R→L via btm ✓
    'M 162,88 C 200,70 206,32 160,20 C 114,32 120,70 158,88',    // upper mid    R→L via top ✓
    'M 162,92 C 200,110 206,148 160,160 C 114,148 120,110 158,92', // lower mid    R→L via btm ✓
    'M 162,88 C 214,60 218,8 160,4 C 102,8 106,60 158,88',       // upper large  R→L via top ✓
    'M 162,92 C 214,120 218,172 160,176 C 102,172 106,120 158,92', // lower large  R→L via btm ✓
  ],
  measured: [
    'M 162,88 C 186,76 192,54 160,44 C 128,56 135,80 158,88',
    'M 162,92 C 186,102 192,122 160,136 C 128,126 135,104 158,92',
    'M 162,88 C 204,68 208,30 160,18 C 112,34 118,72 158,88',
    'M 162,92 C 204,108 208,146 160,162 C 112,150 118,112 158,92',
    'M 162,88 C 218,58 220,6 160,2 C 100,10 104,62 158,88',
    'M 162,92 C 218,122 220,174 160,178 C 100,170 104,118 158,92',
  ],
};

function CoilSVG({ mode }: { mode: 'theory' | 'measured' }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const color = mode === 'theory' ? '#c8ff00' : '#22d3ee';
  useFlPathAnimation(svgRef, (i) => {
    if (i < 6) return 2200 + i * 280;   // field line loops
    return 1800 + i * 100;               // axis lines
  }, mode);
  return (
    <svg ref={svgRef} viewBox="0 0 320 180" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Coil ring (ellipse seen slightly from side) */}
      <ellipse cx="160" cy="90" rx="7" ry="24"
        fill={`${color}04`} stroke={`${color}55`} strokeWidth="2" />
      {/* Wire cross-sections: top = × (into page), bottom = • (out of page) */}
      <circle cx="160" cy="68" r="5" fill={`${color}12`} stroke={`${color}70`} strokeWidth="1.5" />
      <line x1="157" y1="65" x2="163" y2="71" stroke={`${color}70`} strokeWidth="1.5" />
      <line x1="163" y1="65" x2="157" y2="71" stroke={`${color}70`} strokeWidth="1.5" />
      <circle cx="160" cy="112" r="5" fill={`${color}20`} stroke={`${color}70`} strokeWidth="1.5" />
      <circle cx="160" cy="112" r="2" fill={color} opacity="0.8" />
      {/* Field line loops (animated — all R→L via top, R→L via bottom) */}
      {COIL_LOOPS[mode].map((d, i) => (
        <path key={i} className="fl" d={d} fill="none" stroke={color}
          strokeWidth={i < 2 ? 1.5 : i < 4 ? 1.1 : 0.75}
          opacity={i < 2 ? 0.85 : i < 4 ? 0.6 : 0.35}
        />
      ))}
      {/* Direction arrows on loops (static, at arc midpoints) */}
      {/* Upper arcs: mid at top, field going LEFT */}
      <polygon points="165,42 157,46 165,50" fill={color} opacity="0.75" />
      <polygon points="165,16 157,20 165,24" fill={color} opacity="0.55" />
      <polygon points="165,-1 157,3 165,7" fill={color} opacity="0.3" />
      {/* Lower arcs: mid at bottom, field going LEFT */}
      <polygon points="165,130 157,134 165,138" fill={color} opacity="0.75" />
      <polygon points="165,156 157,160 165,164" fill={color} opacity="0.55" />
      <polygon points="165,172 157,176 165,180" fill={color} opacity="0.3" />
      {/* Axis lines (animated) */}
      {COIL_AXIAL.map((d, i) => (
        <path key={i} className="fl" d={d} fill="none" stroke={color} strokeWidth="1.2" opacity="0.65" />
      ))}
      {/* Axis arrows: left axis points LEFT, right axis points RIGHT */}
      <polygon points="78,86 70,90 78,94" fill={color} opacity="0.65" />
      <polygon points="242,86 250,90 242,94" fill={color} opacity="0.65" />
      {/* N/S labels */}
      <text x="276" y="86" fontSize="11" fill={`${color}90`} fontFamily="monospace" fontWeight="bold">N</text>
      <text x="32" y="86" fontSize="11" fill={`${color}90`} fontFamily="monospace" fontWeight="bold">S</text>
      <text x="160" y="172" fontSize="9" fill={`${color}35`} fontFamily="monospace" textAnchor="middle">
        {mode === 'theory' ? 'THEORETICAL · B₀=μ₀nI/2R' : 'MEASURED · sensor data'}
      </text>
    </svg>
  );
}

// ── Sensor Panel ──────────────────────────────────────────────────────────────

function SensorPanel({ inst, I, I0, bTheory, bMeasured, z }: {
  inst: Inst;
  I: number; I0: number;
  bTheory: number; bMeasured: number;
  z: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelRef.current) return;
    const cards = panelRef.current.querySelectorAll<HTMLElement>('.s-card');
    cards.forEach(c => { c.style.opacity = '0'; });
    animate(cards, {
      opacity: [0, 1], scale: [0.92, 1], translateY: [10, 0],
      duration: 450, delay: stagger(70, { start: 300 }), ease: 'outCubic',
    });
  }, [inst.id]);

  const delta = bMeasured - bTheory;

  const rows = inst.type === 'coil'
    ? [
      { label: `จำนวนรอบ (n)`, value: String(inst.turns), unit: 'รอบ', color: '#a3e635' },
      { label: 'กระแสออกแบบ (I₀)', value: I0.toFixed(2), unit: 'A', color: '#c8ff00' },
      { label: 'กระแสที่วัดได้ (I)', value: I.toFixed(4), unit: 'A', color: '#22d3ee' },
      { label: 'B ทฤษฎี', value: bTheory.toFixed(3), unit: 'mT', color: '#c8ff00' },
      { label: 'B วัดจริง', value: bMeasured.toFixed(3), unit: 'mT', color: '#22d3ee' },
      { label: 'ΔB (วัด − ทฤษฎี)', value: `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`, unit: 'mT', color: Math.abs(delta) > bTheory * 0.05 ? '#f87171' : '#86efac' },
    ]
    : [
      { label: 'ตำแหน่ง Z', value: (z * 100).toFixed(0), unit: 'cm', color: '#a78bfa' },
      { label: 'กระแสออกแบบ (I₀)', value: I0.toFixed(2), unit: 'A', color: '#c8ff00' },
      { label: 'กระแสที่วัดได้ (I)', value: I.toFixed(4), unit: 'A', color: '#22d3ee' },
      { label: 'B ทฤษฎี', value: bTheory.toFixed(3), unit: 'mT', color: '#c8ff00' },
      { label: 'B วัดจริง', value: bMeasured.toFixed(3), unit: 'mT', color: '#22d3ee' },
      { label: 'ΔB (วัด − ทฤษฎี)', value: `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`, unit: 'mT', color: Math.abs(delta) > bTheory * 0.05 ? '#f87171' : '#86efac' },
    ];

  return (
    <div ref={panelRef} className="flex-1 rounded-xl border border-white/10 bg-gray-900/50 p-3">
      <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">ค่าที่วัดได้</h2>
      <div className="space-y-1.5">
        {rows.map(r => (
          <SensorRow key={r.label} {...r} />
        ))}
      </div>
    </div>
  );
}

function SensorRow({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  const valRef = useRef<HTMLSpanElement>(null);
  const prevRef = useRef(value);
  useEffect(() => {
    if (prevRef.current !== value && valRef.current) {
      animate(valRef.current, { scale: [1.12, 1], opacity: [0.5, 1], duration: 260, ease: 'outBack' });
    }
    prevRef.current = value;
  }, [value]);
  return (
    <div className="s-card flex items-center justify-between rounded-lg border border-white/[0.07] bg-gray-950/60 px-2.5 py-2">
      <span className="text-[10px] text-gray-400">{label}</span>
      <div className="flex items-baseline gap-1">
        <span ref={valRef} className="text-sm font-mono font-bold tabular-nums" style={{ color }}>{value}</span>
        <span className="text-[9px] text-gray-500">{unit}</span>
      </div>
    </div>
  );
}

// ── Chat Panel ────────────────────────────────────────────────────────────────

// ── Markdown + LaTeX renderer (lightweight, no library) ───────────────────────

function parseInline(text: string, key?: string | number): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  return (
    <span key={key}>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**'))
          return <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>;
        if (p.startsWith('*') && p.endsWith('*'))
          return <em key={i} className="italic text-gray-200">{p.slice(1, -1)}</em>;
        if (p.startsWith('`') && p.endsWith('`'))
          return <code key={i} className="font-mono text-[10px] bg-gray-950/90 text-[#c8ff00]/80 px-1 py-0.5 rounded">{p.slice(1, -1)}</code>;
        if (p.startsWith('$$') && p.endsWith('$$'))
          return <span key={i} className="block overflow-x-auto font-mono text-[10px] text-violet-300 bg-violet-950/30 border border-violet-500/20 px-2 py-1 rounded my-1 text-center">{p.slice(2, -2).trim()}</span>;
        if (p.startsWith('$') && p.endsWith('$'))
          return <span key={i} className="font-mono text-[10px] text-violet-300 bg-violet-950/20 px-0.5 rounded">{p.slice(1, -1)}</span>;
        return p;
      })}
    </span>
  );
}

function MarkdownMessage({ content, streaming = false }: { content: string; streaming?: boolean }) {
  if (!content && !streaming) return null;

  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      nodes.push(
        <pre key={`cb-${i}`} className="my-1.5 overflow-x-auto rounded-lg bg-gray-950 border border-white/[0.06] px-3 py-2">
          <code className="text-[10px] font-mono text-emerald-400/90 leading-relaxed whitespace-pre">{codeLines.join('\n')}</code>
        </pre>
      );
      i++; continue;
    }

    // Display math $$
    if (line.startsWith('$$') && !line.endsWith('$$')) {
      const mathLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('$$')) { mathLines.push(lines[i]); i++; }
      nodes.push(
        <div key={`dm-${i}`} className="my-1.5 overflow-x-auto rounded-lg bg-violet-950/20 border border-violet-500/20 px-3 py-2 text-center">
          <span className="font-mono text-[10px] text-violet-300">{mathLines.join(' ')}</span>
        </div>
      );
      i++; continue;
    }

    // Heading
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    if (h1) { nodes.push(<p key={i} className="font-bold text-white text-xs mt-2 mb-1">{parseInline(h1[1])}</p>); i++; continue; }
    if (h2) { nodes.push(<p key={i} className="font-semibold text-[#c8ff00]/90 mt-1.5 mb-0.5">{parseInline(h2[1])}</p>); i++; continue; }
    if (h3) { nodes.push(<p key={i} className="font-semibold text-gray-200 mt-1 mb-0.5">{parseInline(h3[1])}</p>); i++; continue; }

    // Unordered list
    const ul = line.match(/^[*\-]\s+(.+)/);
    if (ul) {
      nodes.push(
        <div key={i} className="flex gap-1.5 leading-relaxed">
          <span className="text-[#c8ff00]/50 shrink-0 mt-px">·</span>
          <span>{parseInline(ul[1])}</span>
        </div>
      );
      i++; continue;
    }

    // Ordered list
    const ol = line.match(/^(\d+)\.\s+(.+)/);
    if (ol) {
      nodes.push(
        <div key={i} className="flex gap-1.5 leading-relaxed">
          <span className="font-mono text-[10px] text-[#c8ff00]/50 shrink-0 mt-px">{ol[1]}.</span>
          <span>{parseInline(ol[2])}</span>
        </div>
      );
      i++; continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      nodes.push(<hr key={i} className="border-white/10 my-1.5" />);
      i++; continue;
    }

    // Empty line
    if (!line.trim()) { nodes.push(<div key={i} className="h-1.5" />); i++; continue; }

    // Normal line
    nodes.push(<p key={i} className="leading-relaxed">{parseInline(line)}</p>);
    i++;
  }

  return (
    <div className="text-[11px] text-gray-300 space-y-0.5">
      {nodes}
      {streaming && (
        <span className="inline-block w-0.5 h-[0.85em] bg-[#c8ff00]/70 ml-0.5 animate-pulse align-middle rounded-sm" />
      )}
    </div>
  );
}

const SUGGESTIONS: Record<'coil' | 'solenoid', string[]> = {
  coil: [
    'กฎของไบโอต-ซาวัตอธิบายอะไร?',
    'ทำไม B จึงแปรผันตรงกับจำนวนรอบ n?',
    'ทำไมค่าวัดจริงถึงต่างจากทฤษฎี?',
  ],
  solenoid: [
    'สูตรโซลีนอยด์จำกัดความยาวต่างจากอนันต์อย่างไร?',
    'ทำไม B ที่ปลายขดลวดถึงน้อยกว่ากึ่งกลาง?',
    'Z ส่งผลต่อ B_z อย่างไร?',
  ],
};

function ChatPanel({ inst, I, I0, bTheory, bMeasured, z }: {
  inst: Inst;
  I: number; I0: number;
  bTheory: number; bMeasured: number;
  z: number;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!listRef.current || messages.length === 0) return;
    const bubbles = listRef.current.querySelectorAll('.chat-bubble');
    const last = bubbles[bubbles.length - 1] as HTMLElement | undefined;
    if (last) animate(last, { opacity: [0, 1], translateY: [10, 0], duration: 250, ease: 'outCubic' });
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    setInput('');
    const userMsg: ChatMsg = { id: ++_cid, role: 'user', content: text.trim() };
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setStreaming(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMsgs.map(m => ({ role: m.role, content: m.content })),
          context: {
            instrumentName: inst.name,
            instSub: inst.sub,
            instType: inst.type,
            I, I0, bTheory, bMeasured,
            z: inst.type === 'solenoid' ? z : undefined,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'เกิดข้อผิดพลาด' }));
        setMessages(prev => [...prev, { id: ++_cid, role: 'assistant', content: err.error ?? 'เกิดข้อผิดพลาด' }]);
        return;
      }

      setMessages(prev => [...prev, { id: ++_cid, role: 'assistant', content: '' }]);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        let updated = false;
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            const chunk = ev.choices?.[0]?.delta?.content;
            if (chunk) {
              accText += chunk;
              updated = true;
            }
          } catch { /* skip */ }
        }
        if (updated) {
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content: accText };
            return next;
          });
        }
      }
    } catch {
      setMessages(prev => [...prev, { id: ++_cid, role: 'assistant', content: 'เชื่อมต่อไม่ได้ กรุณาลองใหม่' }]);
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  const suggestions = SUGGESTIONS[inst.type];

  return (
    <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-gray-900/50 flex flex-col overflow-hidden">
      <div className="shrink-0 px-3 py-2 border-b border-white/5 flex items-center gap-2">
        <div className="h-5 w-5 rounded-md bg-[#c8ff00]/10 border border-[#c8ff00]/30 flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c8ff00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </div>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">AI ผู้ช่วยสอน</span>
        {streaming && <span className="ml-auto text-[9px] text-[#c8ff00] animate-pulse">กำลังคิด…</span>}
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col gap-1.5 pt-1">
            <p className="text-[10px] text-gray-600 text-center mb-1">ถามเกี่ยวกับ Lab 8 ได้เลย</p>
            {suggestions.map(s => (
              <button key={s} onClick={() => send(s)}
                className="text-left text-[10px] rounded-lg border border-white/[0.08] bg-gray-950/60 px-2.5 py-1.5 text-gray-400 hover:border-[#c8ff00]/30 hover:text-[#c8ff00]/80 transition-colors"
              >{s}</button>
            ))}
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`chat-bubble flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`} style={{ opacity: 0 }}>
            {msg.role === 'user' ? (
              <div className="max-w-[90%] rounded-xl px-2.5 py-1.5 text-[11px] leading-5 bg-[#c8ff00]/10 border border-[#c8ff00]/25 text-[#c8ff00]/90 whitespace-pre-wrap">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[95%] rounded-xl px-2.5 py-2 bg-gray-800/60 border border-white/[0.07]">
                <MarkdownMessage
                  content={msg.content}
                  streaming={streaming && msg === messages[messages.length - 1]}
                />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 p-2 border-t border-white/5 flex gap-2 items-end">
        <textarea
          ref={inputRef} value={input}
          onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
          placeholder="ถามเกี่ยวกับการทดลอง…"
          rows={1} disabled={streaming}
          className="flex-1 resize-none rounded-lg border border-white/10 bg-gray-950/80 px-2.5 py-1.5 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-[#c8ff00]/40 disabled:opacity-50 transition-colors"
          style={{ minHeight: '32px', maxHeight: '80px' }}
        />
        <button onClick={() => send(input)} disabled={streaming || !input.trim()}
          className="shrink-0 h-8 w-8 rounded-lg bg-[#c8ff00]/10 border border-[#c8ff00]/30 text-[#c8ff00] flex items-center justify-center hover:bg-[#c8ff00]/20 disabled:opacity-30 transition-colors">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Formula Card ─────────────────────────────────────────────────────────────

function FormulaCard({ inst, I, z }: { inst: Inst; I: number; z: number }) {
  if (inst.type === 'coil') {
    const { turns: n, R } = inst;
    const result = calcBCoil(n, I, R);
    return (
      <div className="flex-1 flex flex-col min-h-0 rounded-lg border border-white/[0.07] bg-gray-950/60 px-3 py-2.5">
        <div className="text-[9px] font-semibold text-gray-600 uppercase tracking-wider shrink-0">
          Biot–Savart · ขดลวดเดี่ยว
        </div>

        <div className="flex-1 flex flex-col justify-evenly min-h-0 font-mono">
          {/* Algebraic form */}
          <div className="text-[10px]">
            <span style={{ color: '#c8ff00' }}>B₀</span>
            <span className="text-gray-400"> = μ₀ · n · I / (2R)</span>
          </div>

          {/* Substituted fraction */}
          <div className="text-[8.5px] text-gray-400 pl-3 space-y-0.5">
            <div className="text-gray-500">=</div>
            <div className="text-gray-300">4π×10⁻⁷ × {n} × {I.toFixed(3)}</div>
            <div className="h-px bg-gray-700" />
            <div className="text-gray-300">2 × {(R * 1000).toFixed(0)}×10⁻³</div>
          </div>

          {/* Parameters */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[8.5px]">
            {([
              { k: 'n', v: `${n} รอบ`, c: '#a3e635' },
              { k: 'R', v: `${(R * 1000).toFixed(0)} มม.` },
              { k: 'μ₀', v: '4π×10⁻⁷ H/m' },
              { k: 'I', v: `${I.toFixed(3)} A`, c: '#22d3ee' },
            ] as { k: string; v: string; c?: string }[]).map(p => (
              <div key={p.k} className="flex gap-1">
                <span className="text-gray-600">{p.k} =</span>
                <span style={{ color: p.c }} className={p.c ? '' : 'text-gray-400'}>{p.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Result */}
        <div className="shrink-0 pt-2 mt-1 border-t border-white/[0.07] flex items-baseline gap-2">
          <span className="font-mono text-[9px] text-gray-500">B₀ =</span>
          <span className="font-mono text-2xl font-bold tabular-nums"
            style={{ color: '#c8ff00', textShadow: '0 0 18px rgba(200,255,0,0.45)' }}>
            {result.toFixed(3)}
          </span>
          <span className="text-[10px] text-gray-500">mT</span>
        </div>
      </div>
    );
  }

  // Solenoid
  const { N, L, R } = inst;
  const a = L / 2 + z;
  const b = L / 2 - z;
  const cosA1 = a / Math.sqrt(R * R + a * a);
  const cosA2 = b / Math.sqrt(R * R + b * b);
  const result = calcBSolenoid(N, I, L, R, z);
  const halfLcm = (L / 2 * 100).toFixed(0);
  const zCm = (z * 100).toFixed(0);

  return (
    <div className="flex-1 flex flex-col min-h-0 rounded-lg border border-white/[0.07] bg-gray-950/60 px-3 py-2.5">
      <div className="text-[9px] font-semibold text-gray-600 uppercase tracking-wider shrink-0">
        โซลีนอยด์จำกัดความยาว
      </div>

      <div className="flex-1 flex flex-col justify-evenly min-h-0 font-mono">
        {/* Formula */}
        <div className="text-[9px] space-y-0.5">
          <div><span style={{ color: '#c8ff00' }}>B_z</span><span className="text-gray-400"> = (μ₀NI / 2L)</span></div>
          <div className="text-gray-400 pl-4">× [cosα₁ + cosα₂]</div>
          <div className="text-[9px] text-gray-600 pl-4">cosα = x / √(R² + x²)</div>
        </div>

        {/* a and b */}
        <div className="text-[8.5px] space-y-0.5">
          <div className="text-gray-600">
            a = {halfLcm} + {zCm} = <span style={{ color: '#a78bfa' }}>{(a * 100).toFixed(0)} cm</span>
          </div>
          <div className="text-gray-600">
            b = {halfLcm} − {zCm} = <span style={{ color: '#a78bfa' }}>{(b * 100).toFixed(0)} cm</span>
          </div>
        </div>

        {/* cosα values */}
        <div className="text-[8.5px] space-y-0.5">
          <div className="text-gray-600">cosα₁ = <span className="text-gray-300">{cosA1.toFixed(4)}</span></div>
          <div className="text-gray-600">cosα₂ = <span className="text-gray-300">{cosA2.toFixed(4)}</span></div>
          <div className="text-gray-600">cosα₁ + cosα₂ = <span className="text-gray-200">{(cosA1 + cosA2).toFixed(4)}</span></div>
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[9px]">
          <span className="text-gray-600">N=<span style={{ color: '#a3e635' }}>{N}</span></span>
          <span className="text-gray-600">L=<span className="text-gray-400">{(L * 1000).toFixed(0)}mm</span></span>
          <span className="text-gray-600">R=<span className="text-gray-400">{(R * 1000).toFixed(0)}mm</span></span>
          <span className="col-span-3 text-gray-600">I = <span style={{ color: '#22d3ee' }}>{I.toFixed(3)} A</span></span>
        </div>
      </div>

      {/* Result */}
      <div className="shrink-0 pt-2 mt-1 border-t border-white/[0.07] flex items-baseline gap-2">
        <span className="font-mono text-[9px] text-gray-500">B_z =</span>
        <span className="font-mono text-2xl font-bold tabular-nums"
          style={{ color: '#c8ff00', textShadow: '0 0 18px rgba(200,255,0,0.45)' }}>
          {result.toFixed(3)}
        </span>
        <span className="text-[10px] text-gray-500">mT</span>
      </div>
    </div>
  );
}

// ── Formula Panel ────────────────────────────────────────────────────────────

function FormulaPanel({ inst, I, z }: { inst: Inst; I: number; z: number }) {
  return (
    <div className="shrink-0 w-[200px] rounded-xl border border-white/10 bg-gray-900/50 p-3 flex flex-col">
      <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 shrink-0">สูตรการคำนวณ</h2>
      <FormulaCard inst={inst} I={I} z={z} />
    </div>
  );
}

// ── Solenoid Data Panel ───────────────────────────────────────────────────────

type MeasRecord = { bMeasured: number; bTheory: number };

function SolenoidDataPanel({ z, setZ, bMeasured, bTheory, measData, setMeasData, N, isMoving, setIsMoving, disabled }: {
  z: number; setZ: (v: number) => void;
  bMeasured: number; bTheory: number;
  measData: Map<number, MeasRecord>;
  setMeasData: React.Dispatch<React.SetStateAction<Map<number, MeasRecord>>>;
  N: number;
  isMoving: boolean; setIsMoving: (v: boolean) => void;
  disabled?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const zCm = Math.round(z * 100);
  const recorded = measData.size;
  const allZ = Array.from({ length: 31 }, (_, i) => i - 15); // −15…+15
  const COL_W = 48; // px per Z column
  const LABEL_W = 72; // px for row-label column

  const liveRef = useRef({ bMeasured, bTheory });
  useEffect(() => { liveRef.current = { bMeasured, bTheory }; }, [bMeasured, bTheory]);

  useEffect(() => {
    if (panelRef.current) animate(panelRef.current, { opacity: [0, 1], translateY: [12, 0], duration: 400, ease: 'outCubic' });
  }, []);

  // Center current Z column in scroll view
  useEffect(() => {
    if (!scrollRef.current) return;
    const idx = allZ.indexOf(zCm);
    if (idx < 0) return;
    const c = scrollRef.current;
    c.scrollTo({ left: idx * COL_W - c.clientWidth / 2 + COL_W / 2, behavior: 'smooth' });
  }, [zCm]); // eslint-disable-line react-hooks/exhaustive-deps

  async function moveToPosition(zVal: number) {
    if (disabled || zVal === zCm) return;
    setIsMoving(true);
    setZ(zVal / 100);
    try {
      await fetch('/api/hardware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: 'sole_c.py', args: `--name ${N} --position ${zVal}` }),
      });
      const { bMeasured: bM, bTheory: bT } = liveRef.current;
      setMeasData(prev => new Map(prev).set(zVal, { bMeasured: bM, bTheory: bT }));
    } catch (err) {
      console.error('Failed to move arm', err);
    } finally {
      setIsMoving(false);
    }
  }

  function clearAll() { setMeasData(new Map()); }

  function downloadCSV() {
    const allZ = Array.from({ length: 31 }, (_, i) => i - 15);
    const header = 'Z (cm),B_theory (mT),B_measured (mT),delta_B (mT),delta_B (%)\n';
    const rows = allZ
      .filter(zv => measData.has(zv))
      .map(zv => {
        const p = measData.get(zv)!;
        const d = p.bMeasured - p.bTheory;
        const pct = (d / p.bTheory) * 100;
        return `${zv},${p.bTheory.toFixed(4)},${p.bMeasured.toFixed(4)},${d.toFixed(4)},${pct.toFixed(2)}`;
      })
      .join('\n');
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lab8_N${N}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const dataRows: { key: string; label: string; color: string; getValue: (p: MeasRecord) => { text: string; color?: string } }[] = [
    {
      key: 'theory', label: 'ทฤษฎี (mT)', color: '#c8ff0080',
      getValue: p => ({ text: p.bTheory.toFixed(3), color: '#c8ff0099' }),
    },
    {
      key: 'meas', label: 'วัดได้ (mT)', color: '#22d3ee',
      getValue: p => ({ text: p.bMeasured.toFixed(3), color: '#22d3ee' }),
    },
    {
      key: 'delta', label: 'ΔB%', color: '#6b7280',
      getValue: p => {
        const d = (p.bMeasured - p.bTheory) / p.bTheory * 100;
        return { text: `${d >= 0 ? '+' : ''}${d.toFixed(1)}`, color: Math.abs(d) > 5 ? '#f87171' : '#86efac' };
      },
    },
  ];

  return (
    <div ref={panelRef} className="flex-1 min-w-0 rounded-xl border border-white/10 bg-gray-900/50 flex flex-col overflow-hidden" style={{ opacity: 0 }}>
      {/* Header bar */}
      <div className="shrink-0 px-3 py-1.5 border-b border-white/5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">ข้อมูลแนวแกน Z</h2>
          <span className="text-[9px] font-mono text-gray-600">N={N}</span>
          <span className="text-[9px] font-semibold" style={{ color: recorded === 31 ? '#c8ff00' : '#22d3ee' }}>{recorded}/31</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isMoving && (
            <div className="flex items-center gap-1.5 text-[9px] text-violet-400">
              <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              <span className="font-mono tabular-nums">{zCm > 0 ? `+${zCm}` : zCm} cm</span>
            </div>
          )}
          {recorded > 0 && !isMoving && (
            <>
              <button
                onClick={downloadCSV}
                title="ดาวน์โหลด CSV"
                className="h-6 w-6 flex items-center justify-center rounded-md border border-white/10 text-gray-400 hover:border-[#c8ff00]/40 hover:text-[#c8ff00] transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v13M5 14l7 7 7-7" /><path d="M3 21h18" />
                </svg>
              </button>
              <button onClick={clearAll}
                className="text-[9px] px-1.5 py-1 rounded-md border border-white/10 text-gray-600 hover:text-gray-400 transition-colors leading-none">
                ล้าง
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table: sticky label column + horizontally scrollable data */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sticky row-label column */}
        <div className="shrink-0 flex flex-col border-r border-white/[0.06]" style={{ width: LABEL_W }}>
          {/* Z-header cell */}
          <div className="shrink-0 h-[26px] px-2 flex items-center text-[9px] font-semibold text-gray-600 uppercase tracking-wider border-b border-white/5 select-none">
            Z (cm)
          </div>
          {dataRows.map(r => (
            <div key={r.key} className="flex-1 flex items-center px-2 border-b border-white/[0.04] last:border-0">
              <span className="text-[9px] font-semibold truncate" style={{ color: r.color }}>{r.label}</span>
            </div>
          ))}
        </div>

        {/* Scrollable Z columns */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full" style={{ width: allZ.length * COL_W }}>
            {allZ.map(zVal => {
              const isCurrent = zVal === zCm;
              const point = measData.get(zVal);
              return (
                <div
                  key={zVal}
                  data-z={zVal}
                  className={`shrink-0 flex flex-col border-r border-white/[0.04] last:border-0 transition-colors ${isCurrent ? 'bg-[#c8ff00]/8' : ''}`}
                  style={{ width: COL_W }}
                >
                  {/* Z value header — click to move arm */}
                  <button
                    onClick={() => moveToPosition(zVal)}
                    disabled={disabled || isCurrent}
                    className={`shrink-0 h-[26px] w-full flex items-center justify-center text-[9px] font-mono font-semibold border-b border-white/5 transition-colors
                      ${isCurrent && isMoving ? 'text-violet-400 animate-pulse' : ''}
                      ${isCurrent && !isMoving ? 'text-[#c8ff00]' : ''}
                      ${!isCurrent && !isMoving ? 'text-gray-600 hover:text-gray-300 hover:bg-white/5 cursor-pointer' : ''}
                      ${!isCurrent && isMoving ? 'text-gray-700 cursor-not-allowed' : ''}
                    `}
                  >
                    {zVal > 0 ? `+${zVal}` : zVal}
                  </button>
                  {/* Data cells */}
                  {dataRows.map(r => {
                    const cell = point ? r.getValue(point) : null;
                    return (
                      <div key={r.key} className="flex-1 flex items-center justify-center border-b border-white/[0.04] last:border-0">
                        <span
                          className="text-[9px] font-mono tabular-nums"
                          style={{ color: cell ? cell.color : undefined, opacity: cell ? 1 : 0.18 }}
                        >
                          {cell ? cell.text : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Log Panel ─────────────────────────────────────────────────────────────────

const typeStyle: Record<LogType, string> = { info: 'text-gray-500', warn: 'text-yellow-400', data: 'text-cyan-400', cmd: 'text-[#c8ff00]' };
const typeLabel: Record<LogType, string> = { info: 'INFO', warn: 'WARN', data: 'DATA', cmd: 'CMD ' };

function LogPanel({ instrument, I, bMeasured, z, instType }: {
  instrument: number; I: number; bMeasured: number; z: number; instType: 'coil' | 'solenoid';
}) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevInst = useRef(instrument);
  const tick = useRef(0);
  const zTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLogs([
      mkLog('info', 'เชื่อมต่ออุปกรณ์ LAB-8 สำเร็จ'),
      mkLog('cmd', `เริ่ม: ${instruments[instrument].name}`),
      mkLog('data', `I₀ = ${instruments[instrument].I0.toFixed(2)} A`),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (prevInst.current === instrument) return;
    prevInst.current = instrument;
    setLogs(l => [...l, mkLog('cmd', `เปลี่ยน → ${instruments[instrument].name}`)]);
  }, [instrument]);

  // Debounced Z logging
  useEffect(() => {
    if (instType !== 'solenoid') return;
    if (zTimer.current) clearTimeout(zTimer.current);
    zTimer.current = setTimeout(() => {
      setLogs(l => [...l.slice(-60), mkLog('cmd', `Z → ${(z * 100).toFixed(0)} cm`)]);
    }, 400);
  }, [z, instType]);

  useEffect(() => {
    const t = setInterval(() => {
      const i = tick.current % 4;
      tick.current++;
      const templates: Array<[LogType, string]> = [
        ['data', `I = ${I.toFixed(4)} A`],
        ['data', `B = ${bMeasured.toFixed(3)} mT`],
        ['info', 'บันทึกข้อมูลอัตโนมัติ…'],
        ['info', 'ระบบทำงานปกติ'],
      ];
      const [type, msg] = templates[i];
      setLogs(l => [...l.slice(-60), mkLog(type, msg)]);
    }, 2500);
    return () => clearInterval(t);
  }, [instrument, I, bMeasured]);

  useEffect(() => {
    if (!listRef.current) return;
    const rows = listRef.current.querySelectorAll('.log-row');
    const last = rows[rows.length - 1] as HTMLElement | undefined;
    if (last) animate(last, { opacity: [0, 1], translateX: [-8, 0], duration: 280, ease: 'outCubic' });
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-gray-900/50 flex flex-col overflow-hidden">
      <div className="shrink-0 px-3 py-1.5 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">บันทึก</h2>
        <span className="text-[9px] text-gray-600 font-mono">{logs.length}</span>
      </div>
      <div ref={listRef} className="overflow-y-auto p-2 space-y-0.5 font-mono text-[9px]">
        {logs.map(log => (
          <div key={log.id} className="log-row flex items-start gap-1.5 leading-4">
            <span className="text-gray-700 shrink-0 tabular-nums">{log.ts}</span>
            <span className={`shrink-0 font-semibold ${typeStyle[log.type]}`}>[{typeLabel[log.type]}]</span>
            <span className="text-gray-400 break-words">{log.msg}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
