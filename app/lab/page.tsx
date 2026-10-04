'use client';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { animate, stagger, scrambleText, createLayout } from 'animejs';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/app/components/useNotifications';
import { BellIcon, UnreadBadge, NotifPanel } from '@/app/components/GlobalNotifications';
import MathSource from '@/app/components/MathSource';
import { calcBCoil, calcBSolenoid } from '@/lib/physics';
import { readLatency, type LatencyReading, type LatencySample } from '@/lib/webrtc-latency';
import { FieldViz3D } from './FieldViz';

// KaTeX is only needed once the assistant writes a formula, so it is fetched
// then rather than with the page.
const KatexMath = lazy(() => import('@/app/components/KatexMath'));

// ── Types ─────────────────────────────────────────────────────────────────────

type CoilInst = { id: number; type: 'coil'; name: string; sub: string; I0: number; turns: number; R: number; icon: ReactNode };
type SolInst = { id: number; type: 'solenoid'; name: string; sub: string; I0: number; N: number; L: number; R: number; icon: ReactNode };
type Inst = CoilInst | SolInst;

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) { return String(Math.floor(n)).padStart(2, '0'); }
function hhmmss(s: number) { return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`; }
function nowTime() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

// `error` marks a notice about a failed request (shown, never sent back to the
// model); `cutShort` marks an answer that ran into the length limit.
interface ChatMsg { id: number; role: 'user' | 'assistant'; content: string; error?: boolean; cutShort?: boolean }
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
  // ชุดทดลองจริงมีโซลีนอยด์อันเดียวคือ 75 รอบ (ใบแลปกล่าวถึง 150 รอบด้วย แต่ไม่มีบนเครื่อง)
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
];

// ── Access Gate ───────────────────────────────────────────────────────────────

type AccessState =
  | { status: 'loading' }
  | { status: 'denied'; reason: 'auth' }
  | { status: 'denied'; reason: 'no_booking'; next: { start_time: string; experiment_name: string } | null }
  | { status: 'allowed'; end_time: string; experiment_name: string };

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
          setAccess({ status: 'allowed', end_time: d.booking.end_time, experiment_name: d.booking.experiment_name });
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
            <p className="text-sm text-gray-600 mb-6">สามารถเข้าใช้งานได้เฉพาะในช่วงเวลาที่จองไว้เท่านั้น</p>

            {access.next ? (
              <div className="mb-6 rounded-xl border border-[#c8ff00]/20 bg-[#c8ff00]/5 px-4 py-3 text-sm">
                <p className="text-sm text-gray-500 mb-1">การจองถัดไป</p>
                <p className="font-semibold text-white">{access.next.experiment_name}</p>
                <p className="text-sm text-[#c8ff00] mt-0.5">{formatDateTime(access.next.start_time)}</p>
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
              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:text-[#c8ff00] hover:bg-white/[0.03] transition-colors group"
              onClick={onClose}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-600 group-hover:text-[#c8ff00] transition-colors">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="flex-1 truncate">{label}</span>
              <span className="text-sm text-gray-600 font-mono shrink-0">PDF</span>
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
    // Spacing tightens under `short:` so the start button stays on screen
    // without scrolling on an 11–12" display.
    <div className="min-h-screen bg-[#030712] flex items-center justify-center px-6 py-6 short:py-3" style={{
      backgroundImage: 'linear-gradient(rgba(200,255,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.025) 1px, transparent 1px)',
      backgroundSize: '64px 64px',
    }}>
      <div ref={cardRef} className="w-full max-w-lg" style={{ opacity: 0 }}>

        {/* Header */}
        <div className="mb-8 short:mb-3 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-3 py-1 text-sm font-semibold text-[#c8ff00] mb-4 short:mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c8ff00] animate-pulse inline-block" />
            LAB8 · กำลังจะเริ่มการทดลอง
          </span>
          <h1 ref={titleRef} className="text-2xl short:text-xl font-bold text-white mb-2 short:mb-0">
            กฎของ Biot-Savart และสนามแม่เหล็ก
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed short:hidden">
            ศึกษาสนามแม่เหล็กที่เกิดจากลวดตัวนำรูปทรงต่างๆ<br />
            และตรวจสอบความถูกต้องของกฎ Biot-Savart เชิงทดลอง
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-gray-900/60 p-6 mb-5 short:p-4 short:mb-3">

          {/* Time remaining */}
          <div className="flex items-center justify-between mb-5 pb-4 short:mb-3 short:pb-3 border-b border-white/[0.06]">
            <span className="text-sm text-gray-500 flex items-center gap-1.5">
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
          <div className="grid grid-cols-2 gap-3 mb-5 short:gap-2 short:mb-3 text-sm">
            {[
              { label: 'รหัสการทดลอง', value: 'LAB8' },
              { label: 'ระยะเวลา', value: '120 นาที' },
              { label: 'อุปกรณ์หลัก', value: 'ขดลวด / โซลีนอยด์' },
              { label: 'ระดับ', value: 'ปฏิบัติการฟิสิกส์' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-gray-950/60 border border-white/[0.06] px-3 py-2.5 short:py-1.5">
                <p className="text-gray-600 mb-0.5">{label}</p>
                <p className="text-white font-medium">{value}</p>
              </div>
            ))}
          </div>

          {/* Documents */}
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 short:mb-2">เอกสารประกอบการทดลอง</p>
          <div ref={docsRef} className="flex flex-col gap-2 short:gap-1.5">
            {LAB8_DOCS.map(({ label, file }) => (
              <a
                key={file}
                href={`/doc/lab8/${encodeURIComponent(file)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="doc-btn flex items-center gap-3 rounded-xl border border-white/[0.08] bg-gray-950/60 px-4 py-2.5 short:py-1.5 text-sm text-gray-300 hover:border-[#c8ff00]/30 hover:text-[#c8ff00] transition-colors group"
                style={{ opacity: 0 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-600 group-hover:text-[#c8ff00] transition-colors">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <polyline points="9 15 12 18 15 15" />
                </svg>
                <span className="flex-1 truncate">{label}</span>
                <span className="text-sm text-gray-600 font-mono shrink-0">PDF</span>
              </a>
            ))}
          </div>
        </div>

        {/* Start button */}
        <button
          ref={btnRef}
          onClick={onStart}
          className="w-full rounded-2xl bg-[#c8ff00] py-3.5 short:py-3 text-sm font-bold text-gray-950 hover:bg-white transition-colors"
          style={{ opacity: 0, boxShadow: '0 0 32px rgba(200,255,0,0.3)' }}
        >
          เริ่มการทดลอง →
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RemoteLabPage() {
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
  const [compactTab, setCompactTab] = useState<'camera' | 'setup' | 'viz' | 'assist'>('camera');
  const [compactCam, setCompactCam] = useState<'main' | 'secondary'>('main');
  const chat = useChat();
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
  const [prevInstrumentForReset, setPrevInstrumentForReset] = useState(instrument);
  if (instrument !== prevInstrumentForReset) {
    setPrevInstrumentForReset(instrument);
    const inst = instruments[instrument];
    setI(inst.I0);
    setZ(0);
    setMeasData(new Map());
  }

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
    const targetScript = ['coil_1.py', 'coil_2.py', 'coil_3.py', 'sole_75.py'][instrument] || 'coil_1.py';

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
        } catch { }
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
      <SessionBar endTime={access.end_time} onComplete={onComplete} onExit={handleLabExit} />
      {/* Tablet/desktop tree — ≥1024px, side-by-side columns */}
      <div className="hidden lg:flex flex-1 overflow-hidden p-3 gap-3 short:p-2 short:gap-2">

        {/* Left ── Camera (top) · InstrSel + Sensor + Formula + FieldViz (bottom).
            The camera row takes the height its 16:9 feeds want and the bottom row
            takes the rest, but never less than its readings need: on a short
            screen the cameras give up height first and the column scrolls as a
            last resort, so no reading is ever cut off. */}
        <div ref={leftColRef} className="flex-1 min-w-0 min-h-0 flex flex-col gap-3 short:gap-2 overflow-x-hidden overflow-y-auto">
          <div
            ref={topRowRef}
            className="min-h-[180px] aspect-[32/9] grid grid-cols-2 gap-3 short:gap-2"
            style={{ opacity: 0 }}
          >
            <CameraSection stream="cam1" name="กล้องหลัก" view="ด้านหน้า" />
            <div ref={rightColRef} className="flex flex-col gap-3 h-full min-h-0">
              <CameraSection
                stream={inst.type === 'solenoid' ? 'cam2' : 'cam3'}
                name="กล้องเสริม" view="ด้านข้าง"
              />
            </div>
          </div>
          <div
            ref={btmRowRef}
            className="flex-1 min-h-[376px] short:min-h-[336px] flex items-stretch gap-3 short:gap-2"
            style={{ opacity: 0 }}
          >
            {/* Left column — selector stacked above sensor values */}
            <div className="shrink-0 min-h-0 flex flex-col gap-3 short:gap-2 w-[200px] xl:w-[230px]">
              <InstrumentSelector active={instrument} onSelect={handleInstrumentSelect} disabled={isBusy} />
              <SensorPanel
                inst={inst} I={I} I0={I0}
                bTheory={bTheory} bMeasured={bMeasured}
                z={z}
              />
            </div>
            <FormulaPanel inst={inst} I={I} z={z} widthClassName="w-[210px] xl:w-[240px]" />
            <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3 short:gap-2">
              <div className="flex-1 min-h-0 flex flex-col">
                <SplitFieldPanel
                  instType={inst.type}
                  bTheory={bTheory} bMeasured={bMeasured}
                  I={I} I0={I0} z={z}
                />
              </div>
              {inst.type === 'solenoid' && (
                <div className="shrink-0 h-[190px] short:h-[150px] flex flex-col">
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
          className="w-[220px] xl:w-[260px] shrink-0 flex flex-col overflow-hidden"
          style={{ opacity: 0 }}
        >
          <RightTabs
            chat={chat}
            readings={{ inst, I, I0, bTheory, bMeasured, z }}
            logProps={{ instrument, I, bMeasured, z, instType: inst.type }}
          />
        </div>

      </div>

      {/* Compact tree — <1024px, one region at a time via bottom tab bar */}
      <div className="flex lg:hidden flex-1 min-h-0 flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {compactTab === 'camera' && (
            <div className="h-full flex flex-col gap-3">
              <div className="shrink-0 flex rounded-xl border border-white/10 overflow-hidden bg-gray-900/50">
                <button
                  onClick={() => setCompactCam('main')}
                  className={`flex-1 py-2 text-sm font-semibold transition-colors ${compactCam === 'main' ? 'bg-[#c8ff00]/10 text-[#c8ff00] border-b border-[#c8ff00]/50' : 'text-gray-500 hover:text-gray-300'}`}
                >กล้องหลัก</button>
                <button
                  onClick={() => setCompactCam('secondary')}
                  className={`flex-1 py-2 text-sm font-semibold transition-colors ${compactCam === 'secondary' ? 'bg-[#c8ff00]/10 text-[#c8ff00] border-b border-[#c8ff00]/50' : 'text-gray-500 hover:text-gray-300'}`}
                >กล้องเสริม</button>
              </div>
              <div className="flex-1 min-h-0">
                {compactCam === 'main' ? (
                  <CameraSection stream="cam1" name="กล้องหลัก" view="ด้านหน้า" />
                ) : (
                  <CameraSection
                    stream={inst.type === 'solenoid' ? 'cam2' : 'cam3'}
                    name="กล้องเสริม" view="ด้านข้าง"
                  />
                )}
              </div>
            </div>
          )}

          {compactTab === 'setup' && (
            <div className="flex flex-col gap-3">
              <InstrumentSelector active={instrument} onSelect={handleInstrumentSelect} disabled={isBusy} />
              <SensorPanel
                inst={inst} I={I} I0={I0}
                bTheory={bTheory} bMeasured={bMeasured}
                z={z}
              />
              <FormulaPanel inst={inst} I={I} z={z} widthClassName="w-full" />
            </div>
          )}

          {compactTab === 'viz' && (
            <div className="h-full flex flex-col gap-3">
              <div className="flex-1 min-h-[280px] flex flex-col">
                <SplitFieldPanel
                  instType={inst.type}
                  bTheory={bTheory} bMeasured={bMeasured}
                  I={I} I0={I0} z={z}
                />
              </div>
              {inst.type === 'solenoid' && (
                <div className="flex-1 min-h-[220px] flex flex-col">
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
          )}

          {compactTab === 'assist' && (
            <div className="h-full flex flex-col">
              <RightTabs
                chat={chat}
            readings={{ inst, I, I0, bTheory, bMeasured, z }}
                logProps={{ instrument, I, bMeasured, z, instType: inst.type }}
              />
            </div>
          )}
        </div>

        <CompactTabBar active={compactTab} onSelect={setCompactTab} />
      </div>
    </div>
  );
}

// ── Compact bottom tab bar (< lg) ──────────────────────────────────────────────

function CompactTabBar({ active, onSelect }: {
  active: 'camera' | 'setup' | 'viz' | 'assist';
  onSelect: (tab: 'camera' | 'setup' | 'viz' | 'assist') => void;
}) {
  const TABS: { id: 'camera' | 'setup' | 'viz' | 'assist'; label: string; icon: React.ReactNode }[] = [
    {
      id: 'camera', label: 'กล้อง', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" />
        </svg>
      )
    },
    {
      id: 'setup', label: 'อุปกรณ์', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      )
    },
    {
      id: 'viz', label: 'กราฟ', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" /><path d="M18.4 8.6L13 14l-3-3-4.4 4.4" />
        </svg>
      )
    },
    {
      id: 'assist', label: 'ผู้ช่วย', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      )
    },
  ];

  return (
    <div className="shrink-0 flex border-t border-white/10 bg-gray-950/95">
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`flex-1 flex flex-col items-center gap-1 py-2 text-sm font-semibold transition-colors ${active === t.id ? 'text-[#c8ff00]' : 'text-gray-500 hover:text-gray-300'
            }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Right Tabs ───────────────────────────────────────────────────────────────

type RightTabId = 'ai' | 'log';

function RightTabs({ chat, readings, logProps }: {
  chat: ReturnType<typeof useChat>;
  readings: ChatReadings;
  logProps: { instrument: number; I: number; bMeasured: number; z: number; instType: 'coil' | 'solenoid' };
}) {
  const [tab, setTab] = useState<RightTabId>('ai');

  const TABS: { id: RightTabId; label: string }[] = [
    { id: 'ai', label: 'AI ผู้ช่วย' },
    { id: 'log', label: 'บันทึก' },
  ];

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Tab header */}
      <div className="shrink-0 flex rounded-xl border border-white/10 overflow-hidden bg-gray-900/50">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 text-sm font-semibold transition-colors ${tab === t.id
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
        <ChatPanel chat={chat} readings={readings} />
      </div>
      <div className={`flex-1 min-h-0 flex flex-col ${tab !== 'log' ? 'hidden' : ''}`}>
        <LogPanel {...logProps} />
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

function SessionBar({ endTime, onComplete, onExit }: { endTime: string; onComplete: () => void; onExit?: () => Promise<void> }) {
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
      {/* Full cluster — decorative details only shown when there's room.
          Never wraps: below xl the lab title and elapsed time drop out, and the
          title truncates before anything else is squeezed. */}
      <div className="hidden lg:flex flex-1 min-w-0 items-center justify-center gap-3 xl:gap-4 text-sm whitespace-nowrap">
        <span className="shrink-0 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#c8ff00] animate-pulse inline-block" style={{ boxShadow: '0 0 4px #c8ff00' }} />
          <span className="text-[#c8ff00] font-semibold">LIVE</span>
        </span>
        <span className="hidden xl:inline shrink-0 text-gray-600">|</span>
        <span className="hidden xl:block min-w-0 truncate text-gray-400">LAB 8: <span ref={labelRef} className="text-white">สนามแม่เหล็กและกฎไบโอต-ซาวัต</span></span>
        <span className="hidden xl:inline shrink-0 text-gray-600">|</span>
        <span className="hidden xl:inline shrink-0 text-gray-400">เวลา: <span className="font-mono text-white">{hhmmss(secs)}</span></span>
        <span className="shrink-0 text-gray-600">|</span>
        <span className="shrink-0 text-gray-400 flex items-center gap-1.5">
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

      {/* Compact essentials — the countdown must never disappear, even on the smallest screens */}
      <div className="flex lg:hidden items-center gap-2.5 text-sm min-w-0">
        <span className={`flex items-center gap-1 font-mono font-semibold tabular-nums shrink-0 ${remaining < 300 ? 'text-red-400 animate-pulse' : remaining < 600 ? 'text-yellow-400' : 'text-white'
          }`}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          {fmtCountdown(remaining)}
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
          className="text-sm px-3 py-1.5 rounded-md border border-white/10 text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          กลับ
        </button>
        <button
          onClick={handleLeave}
          className="text-sm px-3 py-1.5 rounded-md bg-[#c8ff00]/10 border border-[#c8ff00]/30 text-[#c8ff00] hover:bg-[#c8ff00]/20 font-semibold transition-colors flex items-center gap-1.5"
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

// `name` is which camera this is (shown on the badge over the feed); `view` is
// the angle it looks from, shown with the name while there is no picture.
function CameraSection({ stream = 'dji', name = 'กล้องหลัก', view = 'ด้านหน้า' }: { stream?: string; name?: string; view?: string }) {
  const crossRef = useRef<HTMLDivElement>(null);
  const cornersRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // The connection in use, for the latency readout to take its statistics from.
  const pcRef = useRef<RTCPeerConnection | null>(null);
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
      pcRef.current = pc;
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

      const resp = await fetch(`/api/cam/${stream}/whep`, {
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
      pcRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/50 overflow-hidden h-full">
      <div className="relative h-full bg-[#050810] overflow-hidden flex items-center justify-center">
        {/* Video stream */}
        {/* On a short screen the box is wider than the feed; show the whole
            frame there instead of cropping the top and bottom of the rig. */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover short:object-contain z-0"
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
              <span className="text-sm text-[#c8ff00] font-mono tracking-widest uppercase">{streamError}</span>
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
          <span className="text-sm text-[#c8ff00]/20 font-mono uppercase tracking-widest">{name} — {view}</span>
        </div>
        <div ref={cornersRef}>
          <div className="corner absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#c8ff00]/40" style={{ opacity: 0 }} />
          <div className="corner absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-[#c8ff00]/40" style={{ opacity: 0 }} />
          <div className="corner absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-[#c8ff00]/40" style={{ opacity: 0 }} />
          <div className="corner absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#c8ff00]/40" style={{ opacity: 0 }} />
        </div>
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/70 border border-white/10 px-2.5 py-0.5 text-sm z-20">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
          <span className="text-white font-semibold">REC</span>
          <span className="text-gray-500">·</span>
          <span className="text-gray-400">{name}</span>
        </div>
        <div ref={crossRef} className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="relative w-8 h-8">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-[#c8ff00]/25" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#c8ff00]/25" />
            <div className="cross-ring absolute inset-1.5 rounded-full border border-dashed border-[#c8ff00]/20" />
          </div>
        </div>
        <CamLatency pcRef={pcRef} />
        <CamTimestamp />
      </div>
    </div>
  );
}

// How far behind the picture is, read from the connection once a second. This
// is the delay from the camera server to the screen (see lib/webrtc-latency.ts);
// the camera's own delay before the server cannot be measured from the browser,
// which is why the label says "stream" and the tooltip spells it out.
function CamLatency({ pcRef }: { pcRef: React.RefObject<RTCPeerConnection | null> }) {
  const [reading, setReading] = useState<LatencyReading | null>(null);

  useEffect(() => {
    let watched: RTCPeerConnection | null = null;
    let sample: LatencySample | null = null;
    let stopped = false;

    const read = async () => {
      const pc = pcRef.current;
      if (pc !== watched) { watched = pc; sample = null; }
      if (!pc || pc.connectionState === 'closed') { setReading(null); return; }
      try {
        const result = readLatency(await pc.getStats(), sample);
        if (stopped || pcRef.current !== pc) return;
        sample = result.sample;
        setReading(result.reading);
      } catch {
        if (!stopped) setReading(null);
      }
    };

    const timer = setInterval(read, 1000);
    return () => { stopped = true; clearInterval(timer); };
  }, [pcRef]);

  if (!reading) return null;

  const chip = 'absolute bottom-2 left-2 z-20 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/70 px-2.5 py-0.5 text-sm select-none';

  if (reading.stalled) {
    return (
      <div className={chip} title="ไม่มีภาพใหม่เข้ามาในช่วงวินาทีที่ผ่านมา ภาพที่เห็นอาจค้างอยู่">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        <span className="text-red-400">ภาพค้าง</span>
      </div>
    );
  }

  const ms = (v: number | null) => (v === null ? 'ไม่ทราบ' : `${Math.round(v)} ms`);
  const tone = reading.total < 150 ? { dot: 'bg-[#c8ff00]', text: 'text-[#c8ff00]' }
    : reading.total < 400 ? { dot: 'bg-yellow-400', text: 'text-yellow-400' }
    : { dot: 'bg-red-500', text: 'text-red-400' };

  return (
    <div
      className={chip}
      title={`ความหน่วงจากเซิร์ฟเวอร์กล้องถึงจอนี้: เครือข่าย ${ms(reading.network)} + บัฟเฟอร์ ${ms(reading.buffer)} + ถอดรหัส ${ms(reading.decode)} ยังไม่รวมความหน่วงของตัวกล้องและช่วงกล้องถึงเซิร์ฟเวอร์ ซึ่งวัดจากเบราว์เซอร์ไม่ได้`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      <span className="text-gray-400">หน่วงสตรีม</span>
      <span className={`font-mono font-semibold tabular-nums ${tone.text}`}>{Math.round(reading.total)}</span>
      <span className="text-gray-500">ms</span>
    </div>
  );
}

function CamTimestamp() {
  const [time, setTime] = useState(() => nowTime());
  useEffect(() => {
    const t = setInterval(() => setTime(nowTime()), 1000);
    return () => clearInterval(t);
  }, []);
  return <div className="absolute bottom-2 right-2 text-sm font-mono text-[#c8ff00]/40 z-20 select-none">{time}</div>;
}

// ── Instrument Selector ───────────────────────────────────────────────────────

function InstrumentSelector({ active, onSelect, disabled }: { active: number; onSelect: (i: number) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number }>({ top: 0, left: 0, width: 0, maxHeight: 400 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const activeInst = instruments[active];

  useEffect(() => {
    if (!open) return;
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      const margin = 8;
      const spaceBelow = window.innerHeight - r.bottom - margin;
      const spaceAbove = r.top - margin;

      // Flip upward when there isn't enough room below and above has more
      // space — otherwise the dropdown can run off the bottom of the
      // viewport (the instrument selector sits near the bottom of the page
      // on the tablet/desktop layout).
      if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
        setDropPos({ top: r.bottom + 6, left: r.left, width: r.width, maxHeight: Math.max(spaceBelow, 120) });
      } else {
        setDropPos({ bottom: window.innerHeight - r.top + 6, left: r.left, width: r.width, maxHeight: Math.max(spaceAbove, 120) });
      }
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
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 short:py-1.5 rounded-xl border bg-gray-900/50 text-left transition-colors
          ${disabled ? 'opacity-60 cursor-not-allowed border-white/10' : 'cursor-pointer hover:border-white/20'}
          ${open ? 'border-[#c8ff00]/40' : 'border-white/10'}
        `}
      >
        <div className={`shrink-0 ${disabled ? 'text-gray-600' : 'text-[#c8ff00]'}`}>{activeInst.icon}</div>
        {/* leading-tight, not leading-none: Thai vowel and tone marks need the
            extra line height or adjacent lines overlap. */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider leading-tight short:hidden">อุปกรณ์วัด</p>
          <p className="text-sm font-semibold text-white leading-tight truncate">{activeInst.name}</p>
          <p className="text-xs text-gray-500 leading-tight truncate">{activeInst.sub}</p>
        </div>
        {/* The desktop column is too narrow for the badge next to the full
            instrument name; the open list still marks the active one as ON. */}
        <div className="flex lg:hidden items-center gap-1 text-sm font-semibold text-[#c8ff00] shrink-0">
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
            className="fixed z-[100] rounded-xl border border-white/10 bg-gray-950 p-2 flex flex-col gap-0.5 overflow-y-auto"
            style={{
              opacity: 0, left: dropPos.left, width: dropPos.width, maxHeight: dropPos.maxHeight,
              top: dropPos.top, bottom: dropPos.bottom,
              boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
            }}
          >
            {GROUPS.map(g => (
              <div key={g.type}>
                <p className="text-sm font-bold text-gray-600 uppercase tracking-widest px-2 py-1">{g.label}</p>
                {instruments.map((inst, i) => {
                  if (inst.type !== g.type) return null;
                  const isCur = i === active;
                  return (
                    <button
                      key={inst.id}
                      onClick={() => handleSelect(i)}
                      className={`inst-item relative w-full rounded-lg border p-2.5 short:py-1.5 text-left transition-colors overflow-hidden
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
                          <p className="text-sm font-semibold leading-none truncate">{inst.name}</p>
                          <p className={`text-sm mt-0.5 truncate ${isCur ? 'text-[#c8ff00]/60' : 'text-gray-600'}`}>{inst.sub}</p>
                        </div>
                        {isCur && (
                          <div className="ml-auto flex items-center gap-1 text-sm font-semibold text-[#c8ff00] shrink-0">
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
  return (
    <div className="flex-1 flex flex-col rounded-xl border border-white/10 bg-gray-900/50 overflow-hidden min-h-0">
      {/* Wraps onto a second line in a narrow column instead of breaking words.
          Not `uppercase`: that would render the unit mT as MT. */}
      <div className="shrink-0 px-3 xl:px-4 py-2 short:py-1.5 border-b border-white/5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm 2xl:text-base font-semibold tracking-wide whitespace-nowrap">
          <span className="flex items-center gap-1.5" style={{ color: '#c8ff00' }}>
            <span className="h-2 w-2 shrink-0 rounded-full inline-block" style={{ backgroundColor: '#c8ff00' }} />
            ทฤษฎี · {bTheory.toFixed(3)} mT
          </span>
          <span className="text-gray-600 font-normal">VS</span>
          <span className="flex items-center gap-1.5" style={{ color: '#22d3ee' }}>
            <span className="h-2 w-2 shrink-0 rounded-full inline-block" style={{ backgroundColor: '#22d3ee' }} />
            วัดจริง · {bMeasured.toFixed(3)} mT
          </span>
        </div>
        {/* I₀ and I are already in the readings panel; they only join this bar when it is wide. */}
        <div className="flex items-center gap-3 text-sm font-mono whitespace-nowrap">
          {instType === 'solenoid' && (
            <span className="text-gray-500">Z = <span style={{ color: '#a78bfa' }}>{(z * 100).toFixed(0)} cm</span></span>
          )}
          <span className="lg:hidden 2xl:inline text-gray-600">I₀ = {I0.toFixed(2)} A</span>
          <span className="lg:hidden xl:inline text-gray-500">I = <span style={{ color: '#22d3ee' }}>{I.toFixed(3)} A</span></span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <FieldViz3D instType={instType} />
      </div>
    </div>
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
      { label: 'ΔB', hint: '(วัด − ทฤษฎี)', value: `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`, unit: 'mT', color: Math.abs(delta) > bTheory * 0.05 ? '#f87171' : '#86efac' },
    ]
    : [
      { label: 'ตำแหน่ง Z', value: (z * 100).toFixed(0), unit: 'cm', color: '#a78bfa' },
      { label: 'กระแสออกแบบ (I₀)', value: I0.toFixed(2), unit: 'A', color: '#c8ff00' },
      { label: 'กระแสที่วัดได้ (I)', value: I.toFixed(4), unit: 'A', color: '#22d3ee' },
      { label: 'B ทฤษฎี', value: bTheory.toFixed(3), unit: 'mT', color: '#c8ff00' },
      { label: 'B วัดจริง', value: bMeasured.toFixed(3), unit: 'mT', color: '#22d3ee' },
      { label: 'ΔB', hint: '(วัด − ทฤษฎี)', value: `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`, unit: 'mT', color: Math.abs(delta) > bTheory * 0.05 ? '#f87171' : '#86efac' },
    ];

  return (
    <div ref={panelRef} className="flex-1 min-h-0 flex flex-col rounded-xl border border-white/10 bg-gray-900/50 p-3 short:p-2.5">
      <h2 className="shrink-0 text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2.5 short:mb-1.5">ค่าที่วัดได้</h2>
      {/* Rows prefer 42px and squeeze down to 34px when the panel is short, so
          all six readings stay on screen; the scrollbar is only a fallback. */}
      <div className="flex-1 min-h-0 flex flex-col gap-1.5 short:gap-1 overflow-y-auto">
        {rows.map(r => (
          <SensorRow key={r.label} {...r} />
        ))}
      </div>
    </div>
  );
}

function SensorRow({ label, hint, value, unit, color }: { label: string; hint?: string; value: string; unit: string; color: string }) {
  const valRef = useRef<HTMLSpanElement>(null);
  const prevRef = useRef(value);
  useEffect(() => {
    if (prevRef.current !== value && valRef.current) {
      animate(valRef.current, { scale: [1.12, 1], opacity: [0.5, 1], duration: 260, ease: 'outBack' });
    }
    prevRef.current = value;
  }, [value]);
  return (
    <div className="s-card grow-0 shrink basis-[42px] min-h-[34px] flex items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-gray-950/60 px-2.5">
      <span title={hint ? `${label} ${hint}` : undefined} className="min-w-0 text-sm lg:text-[13px] xl:text-sm leading-tight text-gray-400 line-clamp-2">
        {label}
        {/* No room beside the value in the narrow lg column; the tooltip carries it there. */}
        {hint && <span className="ml-1 text-[11px] text-gray-500 whitespace-nowrap lg:hidden xl:inline">{hint}</span>}
      </span>
      <div className="shrink-0 flex items-baseline gap-1">
        <span ref={valRef} className="text-sm xl:text-base font-mono font-bold tabular-nums" style={{ color }}>{value}</span>
        <span className="text-sm text-gray-500">{unit}</span>
      </div>
    </div>
  );
}

// ── Chat Panel ────────────────────────────────────────────────────────────────

// ── Markdown renderer (hand-written; formulas are typeset by KaTeX) ───────────

// A formula from the assistant, typeset by KaTeX. Every formula in a reply goes
// through this one component. Its LaTeX source is shown in its place until
// KaTeX has loaded, and stays if KaTeX cannot parse it.
function MathText({ tex, display = false }: { tex: string; display?: boolean }) {
  return (
    <Suspense fallback={<MathSource tex={tex} display={display} />}>
      <KatexMath tex={tex} display={display} />
    </Suspense>
  );
}

// The model writes math either way: $…$ and $$…$$, or \(…\) and \[…\].
const INLINE_PARTS = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;

function parseInline(text: string, key?: string | number): React.ReactNode {
  const parts = text.split(INLINE_PARTS);
  return (
    <span key={key}>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**'))
          return <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>;
        if (p.startsWith('*') && p.endsWith('*'))
          return <em key={i} className="italic text-gray-200">{p.slice(1, -1)}</em>;
        if (p.startsWith('`') && p.endsWith('`'))
          return <code key={i} className="font-mono text-sm bg-gray-950/90 text-[#c8ff00]/80 px-1 py-0.5 rounded">{p.slice(1, -1)}</code>;
        if ((p.startsWith('$$') && p.endsWith('$$') && p.length > 4) || (p.startsWith('\\[') && p.endsWith('\\]')))
          return <MathText key={i} tex={p.slice(2, -2)} display />;
        if (p.startsWith('\\(') && p.endsWith('\\)'))
          return <MathText key={i} tex={p.slice(2, -2)} />;
        if (p.startsWith('$') && p.endsWith('$') && p.length > 2)
          return <MathText key={i} tex={p.slice(1, -1)} />;
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
          <code className="text-sm font-mono text-emerald-400/90 leading-relaxed whitespace-pre">{codeLines.join('\n')}</code>
        </pre>
      );
      i++; continue;
    }

    // Display math: "$$" (or "\[") opens a block that runs to the next "$$"
    // (or "\]"). The usual form puts each delimiter on a line of its own; a
    // formula opened and closed on one line is left to parseInline. A block
    // that is not closed yet (still streaming) runs to the end.
    const trimmed = line.trim();
    const close = trimmed.startsWith('$$') ? '$$' : trimmed.startsWith('\\[') ? '\\]' : null;
    if (close && (trimmed.length === 2 || !trimmed.endsWith(close))) {
      const mathLines: string[] = trimmed.length > 2 ? [trimmed.slice(2)] : [];
      i++;
      while (i < lines.length && !lines[i].includes(close)) { mathLines.push(lines[i]); i++; }
      const closed = i < lines.length;
      if (closed) {
        const closing = lines[i].slice(0, lines[i].indexOf(close)).trim();
        if (closing) mathLines.push(closing);
      }
      // A block still being streamed stays as source: half a formula either
      // fails to parse or typesets as something else, and would flicker.
      nodes.push(closed
        ? <MathText key={`dm-${i}`} tex={mathLines.join(' ')} display />
        : <MathSource key={`dm-${i}`} tex={mathLines.join(' ')} display />);
      i++; continue;
    }

    // Table: consecutive lines that start with "|". The |---|---| row only
    // marks the header and is not shown.
    if (trimmed.startsWith('|')) {
      const rows: string[][] = [];
      let header = false;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        if (cells.every(c => /^:?-{2,}:?$/.test(c))) header = rows.length === 1;
        else rows.push(cells);
        i++;
      }
      nodes.push(
        <div key={`tb-${i}`} className="my-1.5 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-xs">
            <tbody className="divide-y divide-white/[0.06]">
              {rows.map((cells, r) => (
                <tr key={r} className={header && r === 0 ? 'bg-white/[0.04] font-semibold text-white' : ''}>
                  {cells.map((cell, c) => <td key={c} className="px-2 py-1.5 align-top leading-relaxed">{parseInline(cell)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      const style = heading[1].length === 1 ? 'font-bold text-white text-sm mt-2 mb-1'
        : heading[1].length === 2 ? 'font-semibold text-[#c8ff00]/90 mt-1.5 mb-0.5'
        : 'font-semibold text-gray-200 mt-1 mb-0.5';
      nodes.push(<p key={i} className={style}>{parseInline(heading[2])}</p>);
      i++; continue;
    }

    // Quote
    const quote = line.match(/^>\s?(.*)/);
    if (quote) {
      nodes.push(
        <div key={i} className="border-l-2 border-white/15 pl-2 leading-relaxed text-gray-400">{parseInline(quote[1])}</div>
      );
      i++; continue;
    }

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
          <span className="font-mono text-sm text-[#c8ff00]/50 shrink-0 mt-px">{ol[1]}.</span>
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
    <div className="text-sm text-gray-300 space-y-0.5">
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

// What the assistant is told about the experiment at the moment of asking.
type ChatReadings = {
  inst: Inst;
  I: number; I0: number;
  bTheory: number; bMeasured: number;
  z: number;
};

// The conversation with the AI assistant. It lives in the page, above the two
// layouts, so the desktop panel and the compact "ผู้ช่วย" tab show the same
// chat and neither loses it when it is hidden or unmounted.
function useChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState(false);

  async function send(text: string, { inst, I, I0, bTheory, bMeasured, z }: ChatReadings) {
    if (!text.trim() || streaming) return;
    const userMsg: ChatMsg = { id: ++_cid, role: 'user', content: text.trim() };
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setStreaming(true);

    const fail = (content: string) =>
      setMessages(prev => [...prev.filter(m => m.content), { id: ++_cid, role: 'assistant', content, error: true }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Notices about failed requests are for the student, not the model.
          messages: nextMsgs.filter(m => !m.error && m.content).map(m => ({ role: m.role, content: m.content })),
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
        const err = await res.json().catch(() => null);
        fail(err?.error ?? 'ผู้ช่วยสอนตอบไม่ได้ในขณะนี้ ลองใหม่อีกครั้ง');
        return;
      }

      setMessages(prev => [...prev, { id: ++_cid, role: 'assistant', content: '' }]);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let answer = '';
      let cutShort = false;
      // A "data: …" line can arrive split across two reads; the unfinished
      // tail waits here for the rest of it.
      let pending = '';
      // The reply is put on screen at most every 50 ms rather than once per
      // token: a long one arrives in well over a thousand pieces, and each
      // redraw lays the whole reply out again.
      let shownAt = 0;

      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split('\n');
        pending = done ? '' : lines.pop() ?? '';

        let grew = false;
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const choice = JSON.parse(line.slice(6)).choices?.[0];
            if (choice?.delta?.content) { answer += choice.delta.content; grew = true; }
            if (choice?.finish_reason === 'length') cutShort = true;
          } catch { /* "[DONE]" and keep-alive lines are not JSON */ }
        }

        const now = performance.now();
        if (answer && (done || (grew && now - shownAt >= 50))) {
          shownAt = now;
          const content = answer;
          const cut = done && cutShort;
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content, cutShort: cut };
            return next;
          });
        }
        if (done) break;
      }

      if (!answer) fail('ผู้ช่วยสอนไม่ได้ตอบกลับมา ลองถามใหม่อีกครั้ง');
    } catch {
      fail('เชื่อมต่อไม่ได้ กรุณาลองใหม่');
    } finally {
      setStreaming(false);
    }
  }

  return { messages, streaming, send };
}

function ChatPanel({ chat, readings }: { chat: ReturnType<typeof useChat>; readings: ChatReadings }) {
  const { messages, streaming } = chat;
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Whether the list is at its end. While it is, new text keeps it there; once
  // the student scrolls up to reread, the answer stops pulling them back down.
  const following = useRef(true);

  // The newest bubble rises in. Only that one starts hidden, and only for the
  // length of the animation: this panel can be mounted with a conversation
  // already in progress (the compact tab), and those bubbles must just be there.
  useLayoutEffect(() => {
    if (!listRef.current || messages.length === 0) return;
    const bubbles = listRef.current.querySelectorAll('.chat-bubble');
    const last = bubbles[bubbles.length - 1] as HTMLElement | undefined;
    if (last) animate(last, { opacity: [0, 1], translateY: [10, 0], duration: 250, ease: 'outCubic' });
  }, [messages.length]);

  // Runs on every streamed piece of text, not only when a bubble is added.
  useEffect(() => {
    const list = listRef.current;
    if (list && following.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    setInput('');
    following.current = true;
    await chat.send(text, readings);
    inputRef.current?.focus();
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  function handleScroll() {
    const list = listRef.current;
    if (list) following.current = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  }

  const suggestions = SUGGESTIONS[readings.inst.type];

  return (
    <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-gray-900/50 flex flex-col overflow-hidden">
      <div className="shrink-0 px-3 py-2 border-b border-white/5 flex items-center gap-2">
        <div className="h-5 w-5 rounded-md bg-[#c8ff00]/10 border border-[#c8ff00]/30 flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c8ff00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">AI ผู้ช่วยสอน</span>
        {streaming && <span className="ml-auto text-sm text-[#c8ff00] animate-pulse">กำลังคิด…</span>}
      </div>

      <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col gap-1.5 pt-1">
            <p className="text-sm text-gray-600 text-center mb-1">ถามเกี่ยวกับ Lab 8 ได้เลย</p>
            {suggestions.map(s => (
              <button key={s} onClick={() => send(s)}
                className="text-left text-sm rounded-lg border border-white/[0.08] bg-gray-950/60 px-2.5 py-1.5 text-gray-400 hover:border-[#c8ff00]/30 hover:text-[#c8ff00]/80 transition-colors"
              >{s}</button>
            ))}
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`chat-bubble flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' ? (
              <div className="max-w-[90%] rounded-xl px-2.5 py-1.5 text-sm leading-5 bg-[#c8ff00]/10 border border-[#c8ff00]/25 text-[#c8ff00]/90 whitespace-pre-wrap">
                {msg.content}
              </div>
            ) : msg.error ? (
              <div role="alert" className="max-w-[95%] rounded-xl px-2.5 py-2 text-sm leading-5 bg-red-500/10 border border-red-500/25 text-red-300">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[95%] rounded-xl px-2.5 py-2 bg-gray-800/60 border border-white/[0.07]">
                <MarkdownMessage
                  content={msg.content}
                  streaming={streaming && msg === messages[messages.length - 1]}
                />
                {msg.cutShort && (
                  <p className="mt-2 border-t border-white/10 pt-2 text-xs leading-5 text-yellow-400/90">
                    คำตอบยาวเกินกำหนดจึงถูกตัดตรงนี้ พิมพ์ &quot;ต่อ&quot; เพื่อให้อธิบายต่อ
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="shrink-0 p-2 border-t border-white/5 flex gap-2 items-end">
        <textarea
          ref={inputRef} value={input}
          onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
          placeholder="ถามเกี่ยวกับการทดลอง…"
          rows={1} disabled={streaming}
          className="flex-1 resize-none rounded-lg border border-white/10 bg-gray-950/80 px-2.5 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c8ff00]/40 disabled:opacity-50 transition-colors"
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

// Full size in the single-column compact tree; one step smaller in the narrow
// desktop column so a line like "cosα₁ + cosα₂ = 1.9741" fits without wrapping.
const FORMULA_TEXT = 'text-sm lg:text-xs xl:text-[13px]';

function FormulaCard({ inst, I, z }: { inst: Inst; I: number; z: number }) {
  if (inst.type === 'coil') {
    const { turns: n, R } = inst;
    const result = calcBCoil(n, I, R);
    return (
      <div className="flex-1 flex flex-col min-h-0 rounded-lg border border-white/[0.07] bg-gray-950/60 px-3 py-2.5 short:py-2">
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider leading-tight shrink-0">
          Biot–Savart · ขดลวดเดี่ยว
        </div>

        {/* The derivation scrolls inside the card when the card is short; the
            inner min-h-full keeps it evenly spread when there is room. */}
        <div className="flex-1 min-h-0 overflow-y-auto font-mono">
          <div className={`min-h-full flex flex-col justify-evenly gap-1.5 py-1 ${FORMULA_TEXT}`}>
            {/* Algebraic form */}
            <div>
              <span style={{ color: '#c8ff00' }}>B₀</span>
              <span className="text-gray-400"> = μ₀ · n · I / (2R)</span>
            </div>

            {/* Substituted fraction */}
            <div className="text-gray-400 pl-3 space-y-0.5">
              <div className="text-gray-500">=</div>
              <div className="text-gray-300">4π×10⁻⁷ × {n} × {I.toFixed(3)}</div>
              <div className="h-px bg-gray-700" />
              <div className="text-gray-300">2 × {(R * 1000).toFixed(0)}×10⁻³</div>
            </div>

            {/* Parameters */}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {([
                { k: 'n', v: `${n} รอบ`, c: '#a3e635' },
                { k: 'R', v: `${(R * 1000).toFixed(0)} มม.` },
                { k: 'I', v: `${I.toFixed(3)} A`, c: '#22d3ee' },
                { k: 'μ₀', v: '4π×10⁻⁷ H/m' },
              ] as { k: string; v: string; c?: string }[]).map(p => (
                <div key={p.k} className="flex gap-1 whitespace-nowrap">
                  <span className="text-gray-600">{p.k} =</span>
                  <span style={{ color: p.c }} className={p.c ? '' : 'text-gray-400'}>{p.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Result */}
        <div className="shrink-0 pt-2 mt-1 short:pt-1.5 border-t border-white/[0.07] flex items-baseline gap-2">
          <span className="font-mono text-sm text-gray-500">B₀ =</span>
          <span className="font-mono text-2xl short:text-xl font-bold tabular-nums"
            style={{ color: '#c8ff00', textShadow: '0 0 18px rgba(200,255,0,0.45)' }}>
            {result.toFixed(3)}
          </span>
          <span className="text-sm text-gray-500">mT</span>
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
    <div className="flex-1 flex flex-col min-h-0 rounded-lg border border-white/[0.07] bg-gray-950/60 px-3 py-2.5 short:py-2">
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider leading-tight shrink-0">
        โซลีนอยด์จำกัดความยาว
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto font-mono">
        <div className={`min-h-full flex flex-col justify-evenly gap-1.5 py-1 ${FORMULA_TEXT}`}>
          {/* Formula */}
          <div className="space-y-0.5">
            <div><span style={{ color: '#c8ff00' }}>B_z</span><span className="text-gray-400"> = (μ₀NI / 2L)</span></div>
            <div className="text-gray-400 pl-4">× [cosα₁ + cosα₂]</div>
            <div className="text-gray-600 pl-4 short:hidden">cosα = x / √(R² + x²)</div>
          </div>

          {/* a and b */}
          <div className="space-y-0.5">
            <div className="text-gray-600">
              a = {halfLcm} + {zCm} = <span style={{ color: '#a78bfa' }}>{(a * 100).toFixed(0)} cm</span>
            </div>
            <div className="text-gray-600">
              b = {halfLcm} − {zCm} = <span style={{ color: '#a78bfa' }}>{(b * 100).toFixed(0)} cm</span>
            </div>
          </div>

          {/* cosα values */}
          <div className="space-y-0.5">
            <div className="text-gray-600">cosα₁ = <span className="text-gray-300">{cosA1.toFixed(4)}</span></div>
            <div className="text-gray-600">cosα₂ = <span className="text-gray-300">{cosA2.toFixed(4)}</span></div>
            <div className="text-gray-600">cosα₁ + cosα₂ = <span className="text-gray-200">{(cosA1 + cosA2).toFixed(4)}</span></div>
          </div>

          {/* Parameters */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 whitespace-nowrap">
            <span className="text-gray-600">N=<span style={{ color: '#a3e635' }}>{N}</span></span>
            <span className="text-gray-600">L=<span className="text-gray-400">{(L * 1000).toFixed(0)}mm</span></span>
            <span className="text-gray-600">R=<span className="text-gray-400">{(R * 1000).toFixed(0)}mm</span></span>
            <span className="text-gray-600">I = <span style={{ color: '#22d3ee' }}>{I.toFixed(3)} A</span></span>
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="shrink-0 pt-2 mt-1 short:pt-1.5 border-t border-white/[0.07] flex items-baseline gap-2">
        <span className="font-mono text-sm text-gray-500">B_z =</span>
        <span className="font-mono text-2xl short:text-xl font-bold tabular-nums"
          style={{ color: '#c8ff00', textShadow: '0 0 18px rgba(200,255,0,0.45)' }}>
          {result.toFixed(3)}
        </span>
        <span className="text-sm text-gray-500">mT</span>
      </div>
    </div>
  );
}

// ── Formula Panel ────────────────────────────────────────────────────────────

function FormulaPanel({ inst, I, z, widthClassName = 'w-[200px]' }: { inst: Inst; I: number; z: number; widthClassName?: string }) {
  return (
    <div className={`shrink-0 min-h-0 ${widthClassName} rounded-xl border border-white/10 bg-gray-900/50 p-3 short:p-2.5 flex flex-col`}>
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2 short:mb-1.5 shrink-0">สูตรการคำนวณ</h2>
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
  const COL_W = 64; // px per Z column
  const LABEL_W = 100; // px for row-label column

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
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">ข้อมูลแนวแกน Z</h2>
          <span className="text-sm font-mono text-gray-600">N={N}</span>
          <span className="text-sm font-semibold" style={{ color: recorded === 31 ? '#c8ff00' : '#22d3ee' }}>{recorded}/31</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isMoving && (
            <div className="flex items-center gap-1.5 text-sm text-violet-400">
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
                className="text-sm px-1.5 py-1 rounded-md border border-white/10 text-gray-600 hover:text-gray-400 transition-colors leading-none">
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
          <div className="shrink-0 h-[30px] px-2 flex items-center text-sm font-semibold text-gray-600 tracking-wider border-b border-white/5 select-none">
            Z (cm)
          </div>
          {dataRows.map(r => (
            <div key={r.key} className="flex-1 flex items-center px-2 border-b border-white/[0.04] last:border-0">
              <span className="text-sm font-semibold truncate" style={{ color: r.color }}>{r.label}</span>
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
                    className={`shrink-0 h-[30px] w-full flex items-center justify-center text-sm font-mono font-semibold border-b border-white/5 transition-colors
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
                          className="text-sm font-mono tabular-nums whitespace-nowrap"
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
  const [logs, setLogs] = useState<LogEntry[]>(() => [
    mkLog('info', 'เชื่อมต่ออุปกรณ์ LAB-8 สำเร็จ'),
    mkLog('cmd', `เริ่ม: ${instruments[instrument].name}`),
    mkLog('data', `I₀ = ${instruments[instrument].I0.toFixed(2)} A`),
  ]);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevInst = useRef(instrument);
  const tick = useRef(0);
  const zTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">บันทึก</h2>
        <span className="text-sm text-gray-600 font-mono">{logs.length}</span>
      </div>
      <div ref={listRef} className="overflow-y-auto p-2 space-y-0.5 font-mono text-sm">
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
