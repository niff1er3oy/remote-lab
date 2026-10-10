'use client';
import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { animate, stagger, scrambleText, createLayout } from 'animejs';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/app/components/useNotifications';
import { BellIcon, UnreadBadge, NotifPanel } from '@/app/components/GlobalNotifications';
import MathSource from '@/app/components/MathSource';
import { pointAdjustment, supplyOffValue } from '@/lib/sensor';
import { cleanCurrents, DEFAULT_CURRENTS, type Currents } from '@/lib/instruments';
import { calcBCoil, calcBSolenoid, cmText, fixed, PROBE_MAX, PROBE_POSITIONS, PROBE_STEP_M, probeZ, signedFixed, SOLENOID } from '@/lib/physics';
import { prefersReducedMotion, press } from '@/lib/motion';
import { readLatency, type LatencyReading, type LatencySample } from '@/lib/webrtc-latency';
import { clockTime, describeEvent, positionsOf, readingsOf, type EndReason, type LabEvent, type LabReading } from '@/lib/lab-activity';
import { createSaveQueue, fitToSave, MAX_EVENTS } from '@/lib/lab-record';
import { backgroundSize, createVectorAverager, fieldAbove, vectorFromSensor, type FieldVector } from '@/lib/sensor';
import { FieldViz } from './FieldViz';
import LabSummary, { type SaveState } from './LabSummary';

// KaTeX is only needed once the assistant writes a formula, so it is fetched
// then rather than with the page.
const KatexMath = lazy(() => import('@/app/components/KatexMath'));

// ── Types ─────────────────────────────────────────────────────────────────────

// `script` is the rig script that switches the instrument on (see "Rig commands").
type CoilInst = { id: number; type: 'coil'; name: string; sub: string; script: string; I0: number; turns: number; R: number; icon: ReactNode };
type SolInst = { id: number; type: 'solenoid'; name: string; sub: string; script: string; I0: number; N: number; L: number; R: number; icon: ReactNode };
type Inst = CoilInst | SolInst;

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) { return String(Math.floor(n)).padStart(2, '0'); }
function hhmmss(s: number) { return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`; }

// `error` marks a notice about a failed request (shown, never sent back to the
// model); `cutShort` marks an answer that ran into the length limit.
interface ChatMsg { id: number; role: 'user' | 'assistant'; content: string; error?: boolean; cutShort?: boolean }
let _cid = 0;

// ── Instruments (อ้างอิงใบแลป 04203102) ──────────────────────────────────────

const instruments: Inst[] = [
  // ตอนที่ 1 — ขดลวดเดี่ยว  I₀ = 5 A
  {
    id: 0, type: 'coil', name: 'ขดลวดเดี่ยว 1 รอบ', sub: 'n=1 · R=13 มม.',
    script: 'coil_1.py', I0: DEFAULT_CURRENTS['coil_1.py'], turns: 1, R: 0.013,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    id: 1, type: 'coil', name: 'ขดลวดเดี่ยว 2 รอบ', sub: 'n=2 · R=13 มม.',
    script: 'coil_2.py', I0: DEFAULT_CURRENTS['coil_2.py'], turns: 2, R: 0.013,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" /><circle cx="12" cy="12" r="2" />
      </svg>
    ),
  },
  {
    id: 2, type: 'coil', name: 'ขดลวดเดี่ยว 3 รอบ', sub: 'n=3 · R=13 มม.',
    script: 'coil_3.py', I0: DEFAULT_CURRENTS['coil_3.py'], turns: 3, R: 0.013,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="6.5" />
        <circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1.5" />
      </svg>
    ),
  },
  // ตอนที่ 2 — โซลีนอยด์  L=80 mm · R=21 mm · I₀ = 0.3 A (ผู้ดูแลระบบปรับได้)
  // ชุดทดลองจริงมีโซลีนอยด์อันเดียวคือ 100 รอบ (ใบแลปกล่าวถึง 150 รอบด้วย แต่ไม่มีบนเครื่อง)
  {
    id: 3, type: 'solenoid', name: 'โซลีนอยด์ 100 รอบ', sub: 'n=100 · L=80 มม.',
    script: 'sole.py', I0: SOLENOID.I, N: SOLENOID.N, L: SOLENOID.L, R: SOLENOID.R,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="9" width="20" height="6" rx="1" />
        <path d="M2 12h20" strokeDasharray="3 2" />
      </svg>
    ),
  },
];

// ── Rig commands ──────────────────────────────────────────────────────────────
// The rig understands six commands and the server runs nothing else
// (app/api/hardware/route.ts): a script per coil that switches it on, sole.py
// which switches the solenoid on and takes the probe to a position, and a break
// script per circuit that switches it off.

type RigCommand = { script: string; position?: number };

// The solenoid always starts with the probe at the centre, which is also where
// the page's own Z is reset to when an instrument is chosen.
const startCommand = (inst: Inst): RigCommand =>
  inst.type === 'solenoid' ? { script: inst.script, position: 0 } : { script: inst.script };
const breakCommand = (type: Inst['type']): RigCommand =>
  ({ script: type === 'coil' ? 'coil_b.py' : 'sole_b.py' });

// Resolves to null once the rig has run the command, or to a message for the
// student when it has not.
async function sendToRig(command: RigCommand): Promise<string | null> {
  try {
    const res = await fetch('/api/hardware', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.error ?? 'อุปกรณ์ไม่ตอบรับคำสั่ง';
  } catch {
    return 'เชื่อมต่อกับอุปกรณ์ไม่ได้';
  }
}

// How long a fresh reading is waited for after the probe arrives. Twenty
// values take about a second; longer than this and the sensor is not sending.
const FRESH_READING_MS = 4000;
// How long the probe is left to come to rest once the arm has stopped, before
// a reading is taken there. Until the reading is in, the page shows the
// measured value as waiting rather than whatever the sensor sees on the way.
const ARM_SETTLE_MS = 3000;
const armSettled = () => new Promise<void>(resolve => setTimeout(resolve, ARM_SETTLE_MS));
// A sensor that has sent nothing for this long is not waited for at all.
const SENSOR_SILENT_MS = 1000;

// How often the page tells the server it is still open. The server takes a
// page that has been quiet for much longer to have left (lib/lab-presence.ts).
const HEARTBEAT_MS = 20_000;

// What the server says about the power supply. `supply` is null when it does
// not know or could not be asked; `held` means an admin has switched it off
// and the student cannot switch it on; `error` is why a request was refused.
type SupplyAnswer = { supply: boolean | null; held: boolean; error: string | null };

// Tells the server this page has entered, is still in, or is leaving the lab
// room (the power supply follows from that), or asks it to switch the supply.
// `instrument` is the script of the instrument selected: the supply is
// switched on for that one.
async function tellPresence(action: 'enter' | 'stay' | 'leave' | 'on' | 'off', instrument?: string): Promise<SupplyAnswer> {
  try {
    const res = await fetch('/api/lab/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, instrument }),
      keepalive: action === 'leave',
    });
    const data = await res.json().catch(() => null);
    return {
      supply: typeof data?.supply === 'boolean' ? data.supply : null,
      held: data?.held === true,
      error: res.ok ? null : (data?.error ?? 'สั่งแหล่งจ่ายไฟไม่สำเร็จ'),
    };
  } catch {
    return { supply: null, held: false, error: 'เชื่อมต่อกับเซิร์ฟเวอร์ไม่ได้' };
  }
}

// ── The visit's record on the server ──────────────────────────────────────────
// The record is saved as the visit goes, not only when it ends: a refresh, the
// back button or a crash then leaves the latest of it on the server, and a
// student who comes back in the same round continues from it.

// How long after an event the record is saved. Events that come close together
// go in one save.
const AUTOSAVE_MS = 3000;
// How long before a save that failed is tried again.
const SAVE_RETRY_MS = 15_000;
// A request the browser finishes after the page has gone (keepalive, a beacon)
// may carry 64 KiB at most, shared among those in flight.
const KEEPALIVE_MAX_BYTES = 60_000;

// What is already kept of this round's visit: its events, none when there is
// no record yet, or null when that could not be found out.
async function loadKept(bookingId: string): Promise<LabEvent[] | null> {
  try {
    const res = await fetch(`/api/lab/record?booking=${encodeURIComponent(bookingId)}`);
    if (res.status === 404) return [];
    const data = res.ok ? await res.json() : null;
    return data?.ok && Array.isArray(data.events) ? data.events : null;
  } catch {
    return null;
  }
}

// The save made while the tab closes or reloads, when no reply can be waited
// for. Only this one is left with the browser to finish: a long visit's record
// is over the size such a request may carry, and it then goes as an ordinary
// request, which may not arrive. The saves made during the visit have already
// kept all but the last few seconds of it.
function saveWhileLeaving(bookingId: string | null, events: LabEvent[]) {
  if (!bookingId || !events.length) return;
  const body = JSON.stringify({ booking_id: bookingId, events: fitToSave(events).events });
  const small = new Blob([body]).size <= KEEPALIVE_MAX_BYTES;
  if (small && navigator.sendBeacon?.('/api/lab/record', body)) return;
  fetch('/api/lab/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: small,
  }).catch(() => { });
}

// ── Access Gate ───────────────────────────────────────────────────────────────

type AccessState =
  | { status: 'loading' }
  | { status: 'denied'; reason: 'auth' }
  | { status: 'denied'; reason: 'no_booking'; next: { start_time: string; experiment_name: string } | null }
  | {
    status: 'allowed'; end_time: string; experiment_name: string; disabled: string[]; currents: Currents;
    /**
     * What is already kept of this round's visit (the student was here before
     * and left): empty when nothing is, null when it could not be loaded.
     */
    kept: LabEvent[] | null;
  };

function useAccessGate() {
  const [access, setAccess] = useState<AccessState>({ status: 'loading' });
  const activeBookingId = useRef<string | null>(null);
  // The round this visit belongs to, kept after the round has been marked
  // complete: the visit's record is saved under it.
  const visitBooking = useRef<string | null>(null);
  // Once the student has started, a round found over from outside does not
  // turn the room into the "no booking" screen: the page ends the visit as
  // the finish button does, so its record is closed, saved and shown.
  const started = useRef(false);
  const markStarted = useCallback(() => { started.current = true; }, []);
  const [roundClosed, setRoundClosed] = useState(false);

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
          visitBooking.current = bookingId;
          fetch(`/api/bookings/${bookingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start' }),
          }).catch(() => { });
          // Before the student can start: a visit that continues one begins
          // from what was kept of it.
          const kept = await loadKept(bookingId);
          setAccess({
            status: 'allowed', end_time: d.booking.end_time, experiment_name: d.booking.experiment_name,
            kept,
            disabled: Array.isArray(d.disabled_instruments) ? d.disabled_instruments : [],
            // The current each instrument is set to, as the admin has it, for the whole visit.
            currents: cleanCurrents(d.currents),
          });
        } else {
          setAccess({ status: 'denied', reason: 'no_booking', next: d.next_booking ?? null });
        }
      })
      .catch(() => setAccess({ status: 'denied', reason: 'auth' }));
  }, []);

  // Re-check ทุก 60 วินาที — ถ้าเวลาหมดให้ mark complete แล้ว kick out
  // (หลังกดเริ่มแล้วไม่ kick out: หน้าแลปจบการทดลองเอง แล้วแสดงสรุป)
  useEffect(() => {
    if (access.status !== 'allowed') return;
    const intervalId = setInterval(() => {
      fetch('/api/bookings/active-session')
        .then(r => r.json())
        .then(d => {
          // An answer that failed (a server error, a dropped session) says
          // nothing about the round: it is asked again in a minute.
          if (d.ok && !d.active) {
            if (activeBookingId.current) {
              completeBooking(activeBookingId.current);
              activeBookingId.current = null;
            }
            if (started.current) setRoundClosed(true);
            else setAccess({ status: 'denied', reason: 'no_booking', next: d.next_booking ?? null });
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

  return { access, onComplete, visitBooking, roundClosed, markStarted };
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
  { label: 'Lab Manual', file: 'Lab Manual.pdf' },
  { label: 'Briefing Slides', file: 'Briefing Slides.pdf' },
  { label: 'Worksheet', file: 'Worksheet.pdf' },
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
  const { access, onComplete, visitBooking, roundClosed, markStarted } = useAccessGate();
  const [labStarted, setLabStarted] = useState(false);
  const [instrument, setInstrument] = useState(0);
  const [z, setZ] = useState(0); // Z position in metres (solenoid only, one of the probe's 21 positions)
  const [measData, setMeasData] = useState<Map<number, MeasRecord>>(new Map());
  const [realSensorValue, setRealSensorValue] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const isBusy = isRunning || isMoving;
  const [compactTab, setCompactTab] = useState<'camera' | 'setup' | 'viz' | 'assist'>('camera');
  const [compactCam, setCompactCam] = useState<'main' | 'secondary'>('main');
  const router = useRouter();
  // Everything the student does in this visit (lib/lab-activity.ts): the log
  // tab shows it as it grows, and the summary on leaving is built from it.
  const [events, setEvents] = useState<LabEvent[]>([]);
  // The same list, readable at once by whatever saves it.
  const eventsNow = useRef<LabEvent[]>([]);
  const record = useCallback((e: Omit<LabEvent, 'at'>) => {
    eventsNow.current = [...eventsNow.current, { ...e, at: Date.now() }];
    setEvents(eventsNow.current);
  }, []);
  const [ended, setEnded] = useState(false);
  const ending = useRef(false);
  // The reading last taken for the record. Null when the sensor sent nothing
  // for it: there is then no measurement to record.
  const sensorNow = useRef<number | null>(null);
  const lastValueAt = useRef(0);
  // The room's own field (the Earth's, and whatever else is near the rig):
  // read once on entering, before anything is switched on, and taken off every
  // value the sensor sends after that, component by component. `background` is
  // its size, for the screen: undefined until that reading has been tried;
  // null when the sensor sent nothing to take it from, and the values shown
  // then still include it.
  const [background, setBackground] = useState<number | null | undefined>(undefined);
  const backgroundNow = useRef<FieldVector | null>(null);
  const backgroundTried = useRef(false);
  // The screen shows every value as it arrives. What goes on record is not one
  // value but a reading: twenty in a row, taken where the probe now is, and
  // their mean.
  const [averager] = useState(() => createVectorAverager());
  // Takes a reading from now on, which takes about a second; the next command
  // waits for it. Null, at once, when the sensor is not sending. This is the
  // field as the sensor has it, all three components, the background still in it.
  const freshVector = useCallback(async () => {
    const silent = Date.now() - lastValueAt.current > SENSOR_SILENT_MS;
    const reading = silent ? null : await averager.fresh(FRESH_READING_MS);
    // A silent sensor has no reading, and its last value is no longer shown.
    if (reading === null) setRealSensorValue(null);
    return reading;
  }, [averager]);
  // The same as the one number the lab works with: the size of the field with
  // the background in force taken off.
  const freshReading = useCallback(async () => {
    const vector = await freshVector();
    const reading = vector === null ? null : fieldAbove(vector, backgroundNow.current);
    sensorNow.current = reading;
    return reading;
  }, [freshVector]);
  // Makes `vector` the background from here on.
  const takeAsBackground = useCallback((vector: FieldVector) => {
    backgroundNow.current = vector;
    setBackground(backgroundSize(vector));
    return backgroundSize(vector);
  }, []);
  const chat = useChat(useCallback((question: string) => record({ kind: 'question', detail: question }), [record]));
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

  // The instrument type whose layout is on screen, for the entrance of the
  // second camera when the type changes.
  const shownType = useRef<Inst['type']>('coil');
  const rightColRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (prevInstrumentRef.current === instrument) return;
    const inst = instruments[instrument];
    const typeChanged = inst.type !== shownType.current;
    prevInstrumentRef.current = instrument;
    layoutCtrlRef.current?.animate({ duration: 600, ease: 'outCubic', delay: stagger(30) });
    if (typeChanged) {
      shownType.current = inst.type;
      if (rightColRef.current) {
        animate(rightColRef.current, {
          opacity: [0, 1],
          scale: [0.94, 1],
          translateX: [24, 0],
          duration: 480,
          ease: 'outBack(1.2)',
        });
      }
    }
  }, [instrument]);

  // Instruments an admin has closed are not offered. If the one selected by
  // default is among them, the first open one takes its place before the
  // student starts.
  const closed = access.status === 'allowed' ? access.disabled : NO_INSTRUMENTS;
  if (!labStarted && closed.includes(instruments[instrument].script)) {
    const open = instruments.findIndex(i => !closed.includes(i.script));
    if (open >= 0) setInstrument(open);
  }

  // The current each circuit carries: the admin's setting, read when the
  // visit began. The rig does not measure it.
  const currents = access.status === 'allowed' ? access.currents : DEFAULT_CURRENTS;
  const ampsOf = useCallback((inst: Inst) => currents[inst.script] ?? inst.I0, [currents]);
  // The instrument selected, for what is said to the server outside a render.
  const selectedScript = useRef(instruments[0].script);
  useEffect(() => { selectedScript.current = instruments[instrument].script; }, [instrument]);

  // What was kept of this round's visit when the page was entered.
  const keptEvents = access.status === 'allowed' ? access.kept ?? NO_EVENTS : NO_EVENTS;
  const [tableRestored, setTableRestored] = useState(false);

  // Reset Z and measurement data when instrument changes
  const [prevInstrumentForReset, setPrevInstrumentForReset] = useState(instrument);
  if (instrument !== prevInstrumentForReset) {
    setPrevInstrumentForReset(instrument);
    setZ(0);
    // Back in the same round: the first time the solenoid is chosen, its table
    // holds the positions measured before leaving.
    const chosen = instruments[instrument];
    const restore = labStarted && !tableRestored && chosen.type === 'solenoid';
    setMeasData(restore ? keptTable(keptEvents, chosen) : new Map());
    if (restore) setTableRestored(true);
  }

  // ── Rig control ───────────────────────────────────────────────────────────
  // Which circuit this page has switched on: set once a start command has gone
  // through, cleared once its break command has. The break sent on a switch or
  // on leaving is always the one for this circuit, never for the instrument
  // being switched to.
  const powered = useRef<Inst | null>(null);
  // A command the rig did not carry out. `canRetry` is for a failed switch,
  // which can be run again as a whole; a failed probe move is simply repeated
  // by picking the position again.
  const [rigError, setRigError] = useState<{ text: string; canRetry: boolean } | null>(null);
  const [rigAttempt, setRigAttempt] = useState(0);

  // ── Keeping the record ────────────────────────────────────────────────────
  // The record is kept in the database, so the summary can be opened again
  // from the dashboard's history, and so a visit that is left can be continued.
  // `keptUnknown` is true while it is not known what the server already keeps
  // of this round (it could not be loaded on entering). Nothing is saved until
  // it is known: the server keeps the longer of two records, and this visit's
  // part alone could outgrow the earlier part and replace it.
  const keptUnknown = useRef(false);
  const fullTold = useRef(false);
  const [queueSave] = useState(() => createSaveQueue());
  const sendRecord = useCallback(async (): Promise<boolean> => {
    const bookingId = visitBooking.current;
    if (!bookingId) return false;
    if (keptUnknown.current) {
      const kept = await loadKept(bookingId);
      if (kept === null) return false;
      keptUnknown.current = false;
      if (kept.length) {
        eventsNow.current = [...kept, ...eventsNow.current];
        setEvents(eventsNow.current);
      }
    }
    const { events: fit, left } = fitToSave(eventsNow.current);
    if (left > 0 && !fullTold.current) {
      fullTold.current = true;
      setRigError({ text: `บันทึกเต็มแล้ว (${MAX_EVENTS} รายการ) รายการถัดจากนี้ไม่ถูกเก็บลงประวัติ ดาวน์โหลด CSV ตอนจบเพื่อเก็บให้ครบ`, canRetry: false });
    }
    try {
      // Not keepalive: that caps the body at 64 KiB, which a long visit passes.
      const res = await fetch('/api/lab/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, events: fit }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [visitBooking]);
  // One save at a time; one asked for meanwhile follows it with the events there are then.
  const pushRecord = useCallback(() => queueSave(sendRecord), [queueSave, sendRecord]);
  // The save the summary reports on, and its retry button.
  const [save, setSave] = useState<SaveState>('saving');
  const saveRecord = useCallback(async () => {
    setSave('saving');
    setSave(await pushRecord() ? 'saved' : 'failed');
  }, [pushRecord]);
  // The student is in the room once the booking has been confirmed and they
  // have pressed start, until the visit ends.
  const inRoom = access.status === 'allowed' && labStarted && !ended;

  // Saved a few seconds after each event, so that leaving in any way (refresh,
  // back, a crash) loses those seconds at most. A save that failed is tried
  // again, later, even if nothing more happens.
  const saveFailed = useRef(false);
  const [saveRetry, setSaveRetry] = useState(0);
  useEffect(() => {
    if (!inRoom || events.length === 0) return;
    let gone = false;
    const timer = setTimeout(() => {
      pushRecord().then((ok) => {
        saveFailed.current = !ok;
        if (!ok && !gone) setSaveRetry(n => n + 1);
      });
    }, saveFailed.current ? SAVE_RETRY_MS : AUTOSAVE_MS);
    return () => { gone = true; clearTimeout(timer); };
  }, [events, inRoom, pushRecord, saveRetry]);

  // The power supply that feeds the coils and the solenoid. The student does
  // not switch it: the server switches it on when they enter the room and off
  // when the room is empty, and an admin can switch it at any time. Null until
  // the server has said whether it is on.
  const [supplyOn, setSupplyOn] = useState<boolean | null>(null);
  const [supplyHeld, setSupplyHeld] = useState(false);
  const [supplyBusy, setSupplyBusy] = useState(false);
  // The student's own switch. The server still switches the supply on at
  // entry and off when the room empties, and an admin's switching off wins.
  const switchSupply = useCallback(async (on: boolean) => {
    setSupplyBusy(true);
    const { supply, held, error } = await tellPresence(on ? 'on' : 'off', selectedScript.current);
    if (supply !== null) setSupplyOn(supply);
    setSupplyHeld(held);
    record({ kind: 'supply', ok: error === null, detail: on ? 'on' : 'off' });
    setRigError(error === null ? null : { text: `${on ? 'เปิด' : 'ปิด'}แหล่งจ่ายไฟไม่สำเร็จ: ${error}`, canRetry: false });
    setSupplyBusy(false);
  }, [record]);
  // The calibration set again at the point the probe is at (lib/sensor.ts):
  // the offset that brought a value read there further than 15 % from theory
  // to a random place between 7 % and 15 % under it. It
  // goes on what is shown for as long as the probe stays, and is 0 for a value
  // that needed none. The page does not say when it has done so.
  const [pointAdjust, setPointAdjust] = useState(0);
  // What the solenoid shows with its supply off, picked again with each
  // message from the sensor (lib/sensor.ts).
  const [supplyOffShown, setSupplyOffShown] = useState(0);
  const supplyOnNow = useRef<boolean | null>(null);
  useEffect(() => { supplyOnNow.current = supplyOn; }, [supplyOn]);
  // The supply going off ends the point's calibration: the solenoid is then
  // read as a coil is, and when the supply comes back the value is shown as
  // read until the point is chosen again.
  const [supplyWas, setSupplyWas] = useState(supplyOn);
  if (supplyWas !== supplyOn) {
    setSupplyWas(supplyOn);
    if (supplyOn === false) setPointAdjust(0);
  }
  const adjustAt = useCallback((reading: number | null, bTheory: number) => {
    // No value from the sensor is no measurement, and unless the supply is
    // known to be on there is no field of the instrument's to speak of: in
    // neither case is there anything to calibrate against theory.
    const adjust = reading === null || supplyOnNow.current !== true ? 0 : pointAdjustment(reading, bTheory);
    setPointAdjust(adjust);
    // With the supply off the solenoid's value is the one picked close to
    // zero (lib/sensor.ts), on record as on screen. Only the solenoid's
    // readings come this way.
    if (reading !== null && supplyOnNow.current === false) return { value: supplyOffValue() };
    return { value: reading === null ? null : reading + adjust };
  }, []);

  // Set 0: the student has the background read again, with no current in the
  // winding (the sensor would otherwise read the very field being measured,
  // and that would be taken off from then on). With a coil the student
  // switches the supply off first and it is read where the probe is. With the
  // solenoid the page does it all: the supply goes off, the arm goes home
  // (sole_b.py), clear of the solenoid, the background is read there, and
  // then the supply goes back on and the probe back to the middle of the
  // solenoid, which is measured as it is when the solenoid is first switched on.
  const [zeroing, setZeroing] = useState(false);
  const setZero = useCallback(async (): Promise<boolean> => {
    const inst = instruments[instrument];
    if (inst.type === 'solenoid') {
      const wasOn = supplyOn === true;
      const supplyTo = async (on: boolean): Promise<string | null> => {
        const { supply, held, error } = await tellPresence(on ? 'on' : 'off', inst.script);
        if (supply !== null) setSupplyOn(supply);
        setSupplyHeld(held);
        record({ kind: 'supply', ok: error === null, detail: on ? 'on' : 'off' });
        return error;
      };
      setZeroing(true);
      setIsRunning(true);
      try {
        adjustAt(null, 0); // the point the probe was at is being left
        let failed = wasOn ? await supplyTo(false) : null;
        if (failed) failed = `ปิดแหล่งจ่ายไฟไม่สำเร็จ: ${failed}`;
        let home = false;
        if (!failed) {
          failed = await sendToRig(breakCommand(inst.type));
          record({ kind: 'power-off', instrument: inst.name, ok: !failed, detail: failed ?? undefined });
          if (failed) failed = `พาแขนกลกลับ home ไม่สำเร็จ: ${failed}`;
          else { home = true; powered.current = null; }
        }
        if (!failed) await armSettled();
        const vector = failed ? null : await freshVector();
        if (!failed && vector === null) failed = 'เซนเซอร์ไม่ส่งค่า';
        if (vector !== null) record({ kind: 'zero', ok: true, bMeasured: takeAsBackground(vector) });
        else record({ kind: 'zero', ok: false, bMeasured: null, detail: failed ?? undefined });
        // The supply the page switched off goes back on, whatever became of the zero.
        const back = wasOn ? await supplyTo(true) : null;
        // The arm is home with the solenoid cut: the probe goes back to the
        // middle, as it does when the solenoid is switched on.
        let restart: string | null = null;
        if (home) {
          restart = await sendToRig(startCommand(inst));
          record({ kind: 'power-on', instrument: inst.name, ok: !restart, detail: restart ?? undefined });
          if (!restart) {
            powered.current = inst;
            setZ(0);
            // Measured only with current in the winding.
            if (wasOn && !back) {
              const I = ampsOf(inst);
              const bTheory = calcBSolenoid(inst.N, I, inst.L, inst.R, 0);
              await armSettled();
              const at = adjustAt(await freshReading(), bTheory);
              setMeasData(prev => new Map(prev).set(0, { bMeasured: at.value ?? 0, bTheory, zero: backgroundNow.current && backgroundSize(backgroundNow.current) }));
              record({ kind: 'move', instrument: inst.name, ok: true, zCm: 0, I, bTheory, bMeasured: at.value });
            }
          }
        }
        setRigError(failed
          ? { text: `ตั้งศูนย์ไม่สำเร็จ: ${failed} ค่าศูนย์เดิมยังใช้อยู่`, canRetry: false }
          : back ? { text: `ตั้งศูนย์แล้ว แต่เปิดแหล่งจ่ายไฟคืนไม่สำเร็จ: ${back}`, canRetry: false }
            : restart ? { text: `ตั้งศูนย์แล้ว แต่เปิดใช้อุปกรณ์อีกครั้งไม่สำเร็จ: ${restart}`, canRetry: true } : null);
        return !failed;
      } finally {
        setZeroing(false);
        setIsRunning(false);
      }
    }
    if (supplyOn === true) {
      setRigError({ text: 'ตั้งศูนย์ได้เมื่อแหล่งจ่ายไฟปิดอยู่: ปิดแหล่งจ่ายไฟก่อน แล้วกด Set 0 อีกครั้ง', canRetry: false });
      return false;
    }
    setZeroing(true);
    const vector = await freshVector();
    setZeroing(false);
    if (vector === null) {
      record({ kind: 'zero', ok: false, bMeasured: null });
      setRigError({ text: 'ตั้งศูนย์ไม่สำเร็จ: เซนเซอร์ไม่ส่งค่า ค่าศูนย์เดิมยังใช้อยู่', canRetry: false });
      return false;
    }
    record({ kind: 'zero', ok: true, bMeasured: takeAsBackground(vector) });
    adjustAt(null, 0); // the point's offset was worked out against the old zero
    setRigError(null);
    return true;
  }, [instrument, supplyOn, freshVector, freshReading, takeAsBackground, record, ampsOf, adjustAt]);

  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!inRoom) return;
    let gone = false;
    (async () => {
      // First the room's own field, while nothing is switched on: the supply
      // comes on only once it has been read.
      if (!backgroundTried.current) {
        const vector = await freshVector();
        if (gone) return;
        backgroundTried.current = true;
        const size = vector === null ? null : takeAsBackground(vector);
        if (vector === null) { backgroundNow.current = null; setBackground(null); }
        record({ kind: 'background', ok: size !== null, bMeasured: size });
      }
      const { supply: on, held } = await tellPresence('enter', selectedScript.current);
      if (gone) return;
      setSupplyOn(on);
      setSupplyHeld(held);
      record({ kind: 'supply', ok: on === true, detail: 'on' });
      if (on !== true) setRigError({ text: 'เปิดแหล่งจ่ายไฟไม่สำเร็จ แจ้งผู้ดูแลระบบหากอุปกรณ์ไม่ทำงาน', canRetry: false });
      setEntered(true);
    })();
    const beat = setInterval(() => {
      tellPresence('stay', selectedScript.current).then(({ supply: on, held }) => { if (!gone && on !== null) { setSupplyOn(on); setSupplyHeld(held); } });
    }, HEARTBEAT_MS);
    // Closing the tab leaves no time for a reply: the goodbye is left with the browser.
    const bye = () => {
      navigator.sendBeacon?.('/api/lab/presence', JSON.stringify({ action: 'leave' }));
      // A visit left without finishing still keeps what it had recorded.
      if (!ending.current && !keptUnknown.current) saveWhileLeaving(visitBooking.current, eventsNow.current);
    };
    window.addEventListener('pagehide', bye);
    return () => {
      gone = true;
      clearInterval(beat);
      window.removeEventListener('pagehide', bye);
      // Leaving by the back button or a link changes the page without
      // unloading it, so no pagehide fires: the record is saved from here, as
      // an ordinary request. Ending the visit saves it itself.
      if (!ending.current) void pushRecord();
      // The room is empty again. Ending the visit has already said so, and
      // saying it twice does no harm.
      void tellPresence('leave');
    };
  }, [inRoom, record, freshVector, takeAsBackground, visitBooking, pushRecord]);

  // Nothing is sent to the rig before the supply has been switched on.
  const rigReady = inRoom && entered;

  // A coil has no "record" step of its own, so what it read is noted when the
  // coil is left. The solenoid's values are noted at each probe position.
  const recordReading = useCallback(async (inst: Inst) => {
    if (inst.type !== 'coil') return;
    // Taken while the coil is still on, before anything else is sent to the rig.
    const I = ampsOf(inst);
    const bTheory = calcBCoil(inst.turns, I, inst.R);
    // A coil's value is recorded as it was read: the calibration of a
    // measuring point (lib/sensor.ts) is the solenoid's alone.
    record({ kind: 'reading', instrument: inst.name, I, bTheory, bMeasured: await freshReading() });
  }, [record, freshReading, ampsOf]);

  useEffect(() => {
    if (!rigReady) return;
    const inst = instruments[instrument];

    (async () => {
      setIsRunning(true);
      try {
        const previous = powered.current;
        if (previous) {
          await recordReading(previous);
          const failed = await sendToRig(breakCommand(previous.type));
          record({ kind: 'power-off', instrument: previous.name, ok: !failed, detail: failed ?? undefined });
          // A circuit that could not be cut stays the only one that is on.
          if (failed) { setRigError({ text: `ตัดวงจรอุปกรณ์เดิมไม่สำเร็จ: ${failed}`, canRetry: true }); return; }
          powered.current = null;
          await new Promise(r => setTimeout(r, 500)); // let the rig settle
        }
        adjustAt(null, 0); // the point the probe was at has been left
        const failed = await sendToRig(startCommand(inst));
        record({ kind: 'power-on', instrument: inst.name, ok: !failed, detail: failed ?? undefined });
        if (failed) { setRigError({ text: `เปิดใช้อุปกรณ์ไม่สำเร็จ: ${failed}`, canRetry: true }); return; }
        powered.current = inst;
        setRigError(null);
        // Switching the solenoid on puts the probe at its middle, which is a
        // measuring position like the others: its reading goes on record too.
        if (inst.type === 'solenoid') {
          const I = ampsOf(inst);
          const bTheory = calcBSolenoid(inst.N, I, inst.L, inst.R, 0);
          await armSettled();
          const at = adjustAt(await freshReading(), bTheory);
          // No value from the sensor is 0 on screen, never the theory value.
          setMeasData(prev => new Map(prev).set(0, { bMeasured: at.value ?? 0, bTheory, zero: backgroundNow.current && backgroundSize(backgroundNow.current) }));
          record({ kind: 'move', instrument: inst.name, ok: true, zCm: 0, I, bTheory, bMeasured: at.value });
        } else {
          // A coil is shown as it is read, whatever its distance from
          // theory: no calibration is set at its one measuring point.
          await freshReading();
        }
      } finally {
        setIsRunning(false);
      }
    })();
  }, [instrument, rigReady, rigAttempt, record, recordReading, freshReading, ampsOf, adjustAt]);

  // The visit is over, by the finish button, by the clock or because the round
  // was ended from outside: cut whatever is
  // live, close the record and show the summary in place of the lab room.
  const endVisit = useCallback(async (how: EndReason) => {
    if (ending.current) return;
    ending.current = true;
    const live = powered.current;
    if (live) {
      await recordReading(live);
      const failed = await sendToRig(breakCommand(live.type));
      record({ kind: 'power-off', instrument: live.name, ok: !failed, detail: failed ?? undefined });
      if (!failed) powered.current = null;
    }
    // Leaving the room is what switches the supply off, when nobody else is in it.
    const { supply } = await tellPresence('leave');
    setSupplyOn(supply);
    record({ kind: 'supply', ok: supply === false, detail: 'off' });
    record({ kind: 'end', detail: how });
    setEnded(true);
    void saveRecord();
  }, [record, recordReading, saveRecord]);

  // The round was ended from outside while the student was in the room (an
  // admin ended it, or the server's clock passed its end before the countdown
  // here did): the visit ends as it does by the finish button.
  const endFromOutside = useEffectEvent(() => { void endVisit('round-closed'); });
  useEffect(() => {
    if (roundClosed) endFromOutside();
  }, [roundClosed]);

  const reportMove = useCallback((text: string | null, zCm: number, bTheory: number, bMeasured: number | null = null) => {
    setRigError(text === null ? null : { text: `เลื่อนหัววัดไม่สำเร็จ ค่าที่ตำแหน่งนี้จึงไม่ถูกบันทึก: ${text}`, canRetry: false });
    const inst = instruments[instrument];
    record(text === null
      ? { kind: 'move', instrument: inst.name, ok: true, zCm, I: ampsOf(inst), bTheory, bMeasured }
      : { kind: 'move', instrument: inst.name, ok: false, zCm, detail: text });
  }, [instrument, record, ampsOf]);

  // Read real sensor data via WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      // Connect to the same domain (e.g. Cloudflare tunnel domain) to let Next.js proxy it to the sensor service (SENSOR_URL)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/sensor`;
      
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        const vector = vectorFromSensor(event.data);
        if (vector === null) return;
        lastValueAt.current = Date.now();
        averager.add(vector);
        // With the room's own field taken off, once it has been read.
        setRealSensorValue(fieldAbove(vector, backgroundNow.current));
        setSupplyOffShown(supplyOffValue());
      };
      ws.onclose = () => {
        reconnectTimeout = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws?.close();
    };

    connect();

    // A sensor that has stopped sending has no value: its last one does not
    // stay on screen as if it were still being read.
    const watch = setInterval(() => {
      if (Date.now() - lastValueAt.current > SENSOR_SILENT_MS) setRealSensorValue(null);
    }, SENSOR_SILENT_MS);

    return () => {
      clearInterval(watch);
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [averager]);

  // Entry animations — run only after both access granted AND intro dismissed
  useEffect(() => {
    if (access.status !== 'allowed' || !labStarted) return;
    if (topRowRef.current) animate(topRowRef.current, { opacity: [0, 1], translateY: [-16, 0], duration: 650, ease: 'outCubic' });
    if (btmRowRef.current) animate(btmRowRef.current, { opacity: [0, 1], translateY: [16, 0], duration: 650, delay: 120, ease: 'outCubic' });
    if (rightRef.current) animate(rightRef.current, { opacity: [0, 1], translateX: [24, 0], duration: 650, delay: 80, ease: 'outCubic' });
  }, [access.status, labStarted]);

  const [labName, setLabName] = useState('การทดลองที่ 8 สนามแม่เหล็กและกฎของไบโอต-ซาวัต');
  if (access.status === 'allowed' && access.experiment_name && access.experiment_name !== labName) setLabName(access.experiment_name);

  // Before the access gate: the booking is marked complete as the visit ends,
  // and the gate would otherwise replace the summary with "no booking".
  if (ended) return <LabSummary events={events} experimentName={labName} onLeave={() => router.push('/dashboard')} save={save} onRetrySave={saveRecord} />;

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
  if (!labStarted) {
    const kept = access.kept;
    const start = () => {
      // A visit that continues one goes on from what was kept of it: the
      // summary, the CSV and every save hold the earlier part, then this one.
      keptUnknown.current = kept === null;
      eventsNow.current = kept ?? [];
      record({ kind: 'start' });
      markStarted();
      setLabStarted(true);
      // The solenoid is already the one chosen when the coils are closed.
      const chosen = instruments[instrument];
      if (chosen.type === 'solenoid') {
        setMeasData(keptTable(keptEvents, chosen));
        setTableRestored(true);
      }
    };
    return <LabIntroScreen endTime={access.end_time} onStart={start} />;
  }

  const inst = instruments[instrument];
  // The rig does not measure current: I is the value each circuit is set to.
  const I = ampsOf(inst);
  const bTheory = inst.type === 'coil'
    ? calcBCoil(inst.turns, I, inst.R)
    : calcBSolenoid(inst.N, I, inst.L, inst.R, z);
  // No value from the sensor is shown as 0, never as the theory value: the two
  // would then agree exactly when nothing was measured at all.
  // With the calibration of the point the probe is at, while the supply is
  // known to be on (otherwise there is no field of the instrument's to calibrate).
  // The solenoid with its supply off shows the value picked close to zero.
  const bMeasured = realSensorValue === null ? 0
    : inst.type === 'solenoid' && supplyOn === false ? supplyOffShown
      : realSensorValue + (supplyOn === true ? pointAdjust : 0);
  // What the assistant is told with each question: the readings on screen and
  // the state of the room, so that it can say why a value is what it is.
  const chatReadings: ChatReadings = {
    inst, I, bTheory, bMeasured, z, background,
    supply: supplyHeld ? 'held' : supplyOn === true ? 'on' : supplyOn === false ? 'off' : undefined,
    busy: isRunning,
    sensor: realSensorValue !== null,
    rezeroed: events.filter(e => e.kind === 'zero' && e.ok).length,
    error: rigError?.text,
    endTime: access.end_time,
    recorded: readingsOf(events),
  };
  // The theory field at the middle of the winding: the field model draws the
  // probe's two arrows against it.
  const bPeak = inst.type === 'coil' ? bTheory : calcBSolenoid(inst.N, I, inst.L, inst.R, 0);

  return (
    <div className="flex flex-col h-screen bg-[#030712] text-white overflow-hidden">
      <SessionBar
        endTime={access.end_time}
        onFinish={() => { onComplete(); endVisit('finished'); }}
        onTimeUp={() => { onComplete(); endVisit('time-up'); }}
      />
      {rigError && (
        <div role="alert" className="shrink-0 flex items-center justify-between gap-3 border-b border-red-500/25 bg-red-500/10 px-4 py-1 text-sm text-red-300">
          <span className="min-w-0 truncate" title={rigError.text}>{rigError.text}</span>
          <span className="flex shrink-0 items-center gap-2">
            {rigError.canRetry && (
              <button
                onClick={() => { setRigError(null); setRigAttempt(n => n + 1); }}
                disabled={isBusy}
                className="h-6 rounded-full border border-red-400/40 px-3 text-xs font-semibold text-red-200 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                ลองใหม่
              </button>
            )}
            <button
              onClick={() => setRigError(null)}
              className="h-6 rounded-full border border-white/10 px-3 text-xs text-gray-400 hover:text-white transition-colors"
            >
              ปิด
            </button>
          </span>
        </div>
      )}
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
            <CameraSection stream="cam1" name="กล้องหลัก" />
            <div ref={rightColRef} className="flex flex-col gap-3 h-full min-h-0">
              <CameraSection
                stream={inst.type === 'solenoid' ? 'cam2' : 'cam3'}
                name="กล้องเสริม"
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
              <InstrumentSelector active={instrument} onSelect={handleInstrumentSelect} disabled={isBusy} closed={closed} />
              <SupplySwitch on={supplyOn} held={supplyHeld} busy={supplyBusy || isBusy} onSwitch={switchSupply} />
              <SensorPanel
                inst={inst} I={I}
                bTheory={bTheory} bMeasured={bMeasured} background={background}
                z={z} waiting={isBusy}
                zero={{ set: setZero, busy: zeroing || isBusy || !rigReady, blocked: supplyOn === true && inst.type === 'coil', arm: inst.type === 'solenoid' }}
              />
            </div>
            <FormulaPanel inst={inst} I={I} z={z} widthClassName="w-[210px] xl:w-[240px]" />
            <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3 short:gap-2">
              <div className="flex-1 min-h-0 flex flex-col">
                <SplitFieldPanel
                  instType={inst.type} turns={inst.type === 'coil' ? inst.turns : 0}
                  bTheory={bTheory} bMeasured={bMeasured} bPeak={bPeak}
                  I={I} z={z} waiting={isBusy}
                />
              </div>
              {inst.type === 'solenoid' && (
                <div className="shrink-0 h-[190px] short:h-[150px] flex flex-col">
                  <SolenoidDataPanel
                    z={z} setZ={setZ}
                    bTheory={bTheory}
                    measData={measData} setMeasData={setMeasData}
                    N={inst.N}
                    isMoving={isMoving} setIsMoving={setIsMoving}
                    onMoveError={reportMove} adjustAt={adjustAt}
                    freshReading={freshReading}
                    background={background}
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
            readings={chatReadings}
            events={events}
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
                  <CameraSection stream="cam1" name="กล้องหลัก" />
                ) : (
                  <CameraSection
                    stream={inst.type === 'solenoid' ? 'cam2' : 'cam3'}
                    name="กล้องเสริม"
                  />
                )}
              </div>
            </div>
          )}

          {compactTab === 'setup' && (
            <div className="flex flex-col gap-3">
              <InstrumentSelector active={instrument} onSelect={handleInstrumentSelect} disabled={isBusy} closed={closed} />
              <SupplySwitch on={supplyOn} held={supplyHeld} busy={supplyBusy || isBusy} onSwitch={switchSupply} />
              <SensorPanel
                inst={inst} I={I}
                bTheory={bTheory} bMeasured={bMeasured} background={background}
                z={z} waiting={isBusy}
                zero={{ set: setZero, busy: zeroing || isBusy || !rigReady, blocked: supplyOn === true && inst.type === 'coil', arm: inst.type === 'solenoid' }}
              />
              <FormulaPanel inst={inst} I={I} z={z} widthClassName="w-full" />
            </div>
          )}

          {compactTab === 'viz' && (
            <div className="h-full flex flex-col gap-3">
              <div className="flex-1 min-h-[280px] flex flex-col">
                <SplitFieldPanel
                  instType={inst.type} turns={inst.type === 'coil' ? inst.turns : 0}
                  bTheory={bTheory} bMeasured={bMeasured} bPeak={bPeak}
                  I={I} z={z} waiting={isBusy}
                />
              </div>
              {inst.type === 'solenoid' && (
                <div className="flex-1 min-h-[220px] flex flex-col">
                  <SolenoidDataPanel
                    z={z} setZ={setZ}
                    bTheory={bTheory}
                    measData={measData} setMeasData={setMeasData}
                    N={inst.N}
                    isMoving={isMoving} setIsMoving={setIsMoving}
                    onMoveError={reportMove} adjustAt={adjustAt}
                    freshReading={freshReading}
                    background={background}
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
            readings={chatReadings}
                events={events}
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

function RightTabs({ chat, readings, events }: {
  chat: ReturnType<typeof useChat>;
  readings: ChatReadings;
  events: LabEvent[];
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
        <LogPanel events={events} />
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

function SessionBar({ endTime, onFinish, onTimeUp }: { endTime: string; onFinish: () => void; onTimeUp: () => void }) {
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

  const overlayOpen = panelOpen || docsOpen;
  useEffect(() => {
    if (!overlayOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPanelOpen(false); setDocsOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayOpen]);

  // เวลาหมด → จบการทดลองอัตโนมัติ (ทันทีที่ countdown ถึง 0)
  const timeUp = useEffectEvent(onTimeUp);
  useEffect(() => {
    if (remaining <= 0 && !autoCompleted.current) {
      autoCompleted.current = true;
      timeUp();
    }
  }, [remaining]);

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
          onClick={onFinish}
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
// What a camera pane is showing. Only 'live' has a picture; the other three
// cover the pane with a notice.
type CamStatus = 'connecting' | 'lost' | 'failed' | 'live';

const CAM_NOTICE: Record<Exclude<CamStatus, 'live'>, { text: string; hint?: string }> = {
  connecting: { text: 'กำลังเชื่อมต่อกล้อง' },
  lost: { text: 'สัญญาณขาดหาย กำลังเชื่อมต่อใหม่' },
  failed: { text: 'เชื่อมต่อกล้องไม่ได้', hint: 'ระบบจะลองใหม่อัตโนมัติ' },
};

function CameraSection({ stream = 'dji', name = 'กล้องหลัก' }: { stream?: string; name?: string }) {
  const noticeRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // The connection in use, for the latency readout to take its statistics from.
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState<CamStatus>('connecting');
  const live = status === 'live';

  useEffect(() => {
    if (!noticeRef.current || prefersReducedMotion()) return;
    animate(noticeRef.current.querySelectorAll('.corner'), {
      opacity: [0, 1], scale: [0.4, 1], duration: 500, delay: stagger(80, { start: 300 }), ease: 'outBack',
    });
  }, []);

  // The notice gives way to the picture when it arrives and comes back when it
  // goes. Nothing is drawn over a live picture: the rig has to be seen clearly.
  useLayoutEffect(() => {
    const notice = noticeRef.current;
    const video = videoRef.current;
    if (!notice || !video) return;
    if (!live) {
      notice.style.visibility = 'visible';
      notice.style.opacity = '1';
      return;
    }
    if (prefersReducedMotion()) {
      notice.style.visibility = 'hidden';
      return;
    }
    const fades = [
      animate(notice, { opacity: [1, 0], duration: 320, ease: 'outQuad', onComplete: () => { notice.style.visibility = 'hidden'; } }),
      animate(video, { opacity: [0, 1], duration: 420, ease: 'outQuad' }),
    ];
    if (badgeRef.current) fades.push(animate(badgeRef.current, { scale: [0.82, 1], duration: 420, ease: 'outBack(1.6)' }));
    return () => { fades.forEach(fade => fade.pause()); video.style.opacity = '1'; };
  }, [live]);

  // WebRTC (WHEP) stream connection
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let pc: RTCPeerConnection | null = null;
    let stopped = false;
    let attempts = 0;

    async function connect() {
      if (stopped || !video) return;
      // A retry keeps the notice it had: "cannot connect" should not flick back
      // to "connecting" every three seconds.
      if (attempts++ === 0) setStatus('connecting');

      pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      pc.ontrack = (event) => {
        if (!video) return;
        video.srcObject = event.streams[0] ?? null;
        // A second track arriving restarts playback and rejects the first
        // play() with an AbortError; that is not a fault.
        video.play().catch((err: unknown) => { if ((err as { name?: string })?.name !== 'AbortError') console.error(err); });
        setStatus('live');
      };

      pc.oniceconnectionstatechange = () => {
        if (!pc) return;
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          setStatus('lost');
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
        setStatus('failed');
        pc.close();
        if (!stopped) setTimeout(connect, 3000);
        return;
      }

      const sdpAnswer = await resp.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
    }

    connect().catch(() => {
      setStatus('failed');
      if (!stopped) setTimeout(connect, 3000);
    });

    return () => {
      stopped = true;
      pc?.close();
      pcRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [stream]);

  const notice = CAM_NOTICE[live ? 'connecting' : status];

  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/50 overflow-hidden h-full">
      <div className="relative h-full bg-[#050810] overflow-hidden">
        {/* The whole frame, never cropped: an edge of the rig cut off is worse
            than a dark band beside the picture. */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain"
          autoPlay
          playsInline
          muted
        />

        <div ref={noticeRef} role="status" className="absolute inset-0 z-10 flex items-center justify-center bg-[#050810]/90 backdrop-blur-sm">
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'linear-gradient(rgba(200,255,0,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }} />
          <div className="corner absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#c8ff00]/40" />
          <div className="corner absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-[#c8ff00]/40" />
          <div className="corner absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-[#c8ff00]/40" />
          <div className="corner absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#c8ff00]/40" />

          <div className="relative flex flex-col items-center gap-2 px-4 text-center">
            {status === 'failed' ? (
              <svg className="text-gray-500" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /><path d="M3 3l18 18" />
              </svg>
            ) : (
              <svg className="animate-spin motion-reduce:animate-none text-[#c8ff00]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
            )}
            <span className={`text-sm ${status === 'failed' ? 'text-gray-300' : 'text-[#c8ff00]'}`}>{notice.text}</span>
            {notice.hint && <span className="text-xs text-gray-500">{notice.hint}</span>}
          </div>
        </div>

        <div ref={badgeRef} className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/70 border border-white/10 px-2.5 py-0.5 text-sm z-20">
          {live && (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-[#c8ff00] animate-pulse motion-reduce:animate-none inline-block" />
              <span className="text-white font-semibold">สด</span>
              <span className="text-gray-500">·</span>
            </>
          )}
          <span className="text-gray-400">{name}</span>
        </div>
        <CamLatency pcRef={pcRef} />
      </div>
    </div>
  );
}

// How far behind the picture is, read from the connection once a second. This
// is the delay from the camera server to the screen (see lib/webrtc-latency.ts);
// the camera's own delay before the server cannot be measured from the browser,
// which the tooltip spells out. The chip itself shows only a dot and the figure.
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
      aria-label={`ความหน่วงสตรีม ${Math.round(reading.total)} มิลลิวินาที`}
      title={`ความหน่วงจากเซิร์ฟเวอร์กล้องถึงจอนี้: เครือข่าย ${ms(reading.network)} + บัฟเฟอร์ ${ms(reading.buffer)} + ถอดรหัส ${ms(reading.decode)} ยังไม่รวมความหน่วงของตัวกล้องและช่วงกล้องถึงเซิร์ฟเวอร์ ซึ่งวัดจากเบราว์เซอร์ไม่ได้`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      <span className="text-gray-300">ความหน่วงสตรีม</span>
      <span className={`font-mono font-semibold tabular-nums ${tone.text}`}>{Math.round(reading.total)}</span>
      <span className="text-gray-500">ms</span>
    </div>
  );
}

// ── Power supply ──────────────────────────────────────────────────────────────

// The switch for the supply that feeds the coils and the solenoid. The server
// switches it on when the student enters the room and off when the room is
// empty; in between the student can switch it here. `on` is null while its
// state is not known (the switch then reads as off); `held` means an admin
// has switched it off, and the student cannot switch it on.
function SupplySwitch({ on, held, busy, onSwitch }: { on: boolean | null; held: boolean; busy: boolean; onSwitch: (on: boolean) => void }) {
  const knobRef = useRef<HTMLSpanElement>(null);
  const settled = useRef<boolean | null>(on);

  // The knob springs when the supply actually changes state.
  useLayoutEffect(() => {
    const changed = settled.current !== null && on !== null && settled.current !== on;
    settled.current = on;
    if (changed && knobRef.current && !prefersReducedMotion())
      animate(knobRef.current, { scale: [0.6, 1], duration: 420, ease: 'outBack(2.2)' });
  }, [on]);

  const locked = held && on !== true;
  const why = locked ? 'ผู้ดูแลระบบปิดแหล่งจ่ายไฟไว้ จึงเปิดเองไม่ได้' : undefined;
  return (
    <div title={why} className="shrink-0 rounded-xl border border-white/10 bg-gray-900/50 px-3 py-1 flex items-center justify-between gap-3">
      {/* One line, in a column that can be 200 px wide: the state is one short
          word, and why a locked switch is locked is in its tooltip and name. */}
      <p className="min-w-0 truncate text-sm font-semibold text-white">
        แหล่งจ่ายไฟ{' '}
        <span role="status" className={`font-normal ${on ? 'text-[#c8ff00]' : 'text-gray-500'}`}>
          {busy ? 'รอ…' : locked ? 'ล็อก' : on === null ? '…' : on ? 'เปิด' : 'ปิด'}
        </span>
      </p>
      <button
        role="switch" aria-checked={on === true} aria-label={why ? `แหล่งจ่ายไฟ ${why}` : 'แหล่งจ่ายไฟ'}
        disabled={busy || locked}
        onClick={() => onSwitch(on !== true)}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${on ? 'border-[#c8ff00]/50 bg-[#c8ff00]/25' : 'border-white/10 bg-gray-800'}`}
        style={on ? { boxShadow: '0 0 12px rgba(200,255,0,0.25)' } : undefined}
      >
        <span ref={knobRef} className={`absolute top-[3px] h-5 w-5 rounded-full transition-[left] duration-200 ${on ? 'left-[23px] bg-[#c8ff00]' : 'left-[3px] bg-gray-500'}`} />
      </button>
    </div>
  );
}

// ── Instrument Selector ───────────────────────────────────────────────────────

const NO_INSTRUMENTS: string[] = [];

// `closed` lists the instruments (by script) an admin has switched off: they
// are left out, and so is a group with nothing left in it.
function InstrumentSelector({ active, onSelect, disabled, closed = NO_INSTRUMENTS }: { active: number; onSelect: (i: number) => void; disabled?: boolean; closed?: string[] }) {
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
            {GROUPS.filter(g => instruments.some(inst => inst.type === g.type && !closed.includes(inst.script))).map(g => (
              <div key={g.type}>
                <p className="text-sm font-bold text-gray-600 uppercase tracking-widest px-2 py-1">{g.label}</p>
                {instruments.map((inst, i) => {
                  if (inst.type !== g.type || closed.includes(inst.script)) return null;
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

function SplitFieldPanel({ instType, turns, bTheory, bMeasured, bPeak, I, z, waiting }: {
  /** The rig is still carrying out a command: there is no measured value to show yet. */
  waiting: boolean;
  instType: 'solenoid' | 'coil';
  /** Turns of the single coil; not used for the solenoid. */
  turns: number;
  bTheory: number; bMeasured: number;
  /** The theory field at the middle of the winding, which the model's arrows are drawn against. */
  bPeak: number;
  I: number;
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
            วัดจริง · {waiting ? 'รอค่า' : `${fixed(bMeasured, 3)} mT`}
          </span>
        </div>
        {/* I is already in the readings panel; it only joins this bar when it is wide. */}
        <div className="flex items-center gap-3 text-sm font-mono whitespace-nowrap">
          {instType === 'solenoid' && (
            <span className="text-gray-500">Z = <span style={{ color: '#a78bfa' }}>{cmText(z)} cm</span></span>
          )}
          <span className="lg:hidden xl:inline text-gray-500">I = <span style={{ color: '#c8ff00' }}>{I.toFixed(2)} A</span></span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <FieldViz kind={instType} turns={turns} zCm={Number(cmText(z))} bTheory={bTheory} bMeasured={waiting ? 0 : bMeasured} bPeak={bPeak} />
      </div>
    </div>
  );
}

// ── Sensor Panel ──────────────────────────────────────────────────────────────

function SensorPanel({ inst, I, bTheory, bMeasured, background, z, zero, waiting }: {
  /** The rig is still carrying out a command (the arm moving, the probe settling, a reading being averaged): the measured value is not shown until it is done. */
  waiting: boolean;
  inst: Inst;
  I: number;
  bTheory: number; bMeasured: number;
  /** The zero that the measured value has had taken off; null when none could be read, undefined before it was tried. */
  background: number | null | undefined;
  z: number;
  /**
   * The Set 0 button. `set` resolves to whether the zero was set; `busy`
   * while it is being read or the rig is at work; `blocked` while the supply
   * is on, when pressing it only says to switch the supply off first.
   */
  /** `arm`: with the solenoid, the arm goes home for the background to be read again. */
  zero: { set: () => Promise<boolean>; busy: boolean; blocked: boolean; arm: boolean };
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const zeroRef = useRef<HTMLButtonElement>(null);
  // The button swells for a moment when the zero has been set.
  const pressZero = async () => {
    if (await zero.set() && zeroRef.current) press(zeroRef.current, 1.14);
  };

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
  // The measured value says what was done to it.
  const measured = {
    label: 'B วัดจริง', value: fixed(bMeasured, 3), unit: 'mT', color: '#22d3ee',
    ...(background === undefined ? {}
      // The note is shown at every width, so in the narrow lg column it is cut
      // to what fits beside the value: the word for the background drops out,
      // and the unit too, which the row's own unit already gives.
      : background === null ? {
        hintAtLg: true,
        hint: <>(ยังไม่หัก<span className="lg:hidden xl:inline">พื้นหลัง</span>)</>,
        tip: 'B วัดจริง ยังรวมสนามพื้นหลังอยู่ เพราะเซนเซอร์ไม่ส่งค่าตอนเข้าห้อง ปิดแหล่งจ่ายไฟแล้วกด Set 0 เพื่ออ่านใหม่',
      }
        : {
          hintAtLg: true,
          hint: <>หัก<span className="lg:hidden">พื้นหลัง</span> {fixed(background, 3)}<span className="lg:hidden xl:inline"> mT</span></>,
          tip: `B วัดจริง หักสนามพื้นหลัง ${fixed(background, 3)} mT ออกแล้ว (อ่านตอนเข้าห้อง หรือตอนกด Set 0 ครั้งล่าสุด)`,
        }),
  };

  const rows: SensorRowProps[] = inst.type === 'coil'
    ? [
      { label: `จำนวนรอบ (n)`, value: String(inst.turns), unit: 'รอบ', color: '#a3e635' },
      { label: 'กระแส (I)', value: I.toFixed(2), unit: 'A', color: '#c8ff00' },
      { label: 'B ทฤษฎี', value: bTheory.toFixed(3), unit: 'mT', color: '#c8ff00' },
      measured,
      { label: 'ΔB', hint: '(วัด − ทฤษฎี)', value: signedFixed(delta, 3), unit: 'mT', color: Math.abs(delta) > bTheory * 0.05 ? '#f87171' : '#86efac' },
    ]
    : [
      { label: 'ตำแหน่ง Z', value: cmText(z), unit: 'cm', color: '#a78bfa' },
      { label: 'กระแส (I)', value: I.toFixed(2), unit: 'A', color: '#c8ff00' },
      { label: 'B ทฤษฎี', value: bTheory.toFixed(3), unit: 'mT', color: '#c8ff00' },
      measured,
      { label: 'ΔB', hint: '(วัด − ทฤษฎี)', value: signedFixed(delta, 3), unit: 'mT', color: Math.abs(delta) > bTheory * 0.05 ? '#f87171' : '#86efac' },
    ];

  return (
    <div ref={panelRef} className="flex-1 min-h-0 flex flex-col rounded-xl border border-white/10 bg-gray-900/50 p-3 short:p-2.5">
      <div className="shrink-0 mb-2.5 short:mb-1.5 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">ค่าที่วัดได้</h2>
        {/* The negative margin keeps the heading's line the height it was: the
            rows below have none to give on a laptop screen. */}
        <button
          ref={zeroRef} type="button" onClick={pressZero} disabled={zero.busy} aria-disabled={zero.blocked || undefined}
          aria-label="Set 0 ตั้งค่าที่เซนเซอร์อ่านได้ตอนนี้เป็นศูนย์"
          title={zero.blocked ? 'ปิดแหล่งจ่ายไฟก่อน จึงจะตั้งศูนย์ได้' : zero.arm ? 'ปิดแหล่งจ่ายไฟชั่วคราว พาแขนกลกลับ home อ่านสนามพื้นหลังใหม่ แล้วพาหัววัดกลับมาที่กึ่งกลางโซลีนอยด์' : 'ตั้งค่าที่เซนเซอร์อ่านได้ตอนนี้เป็นศูนย์ (สนามพื้นหลัง ณ ตำแหน่งนี้)'}
          className={`-my-1 h-6 shrink-0 rounded-md border px-2 text-xs font-semibold normal-case tracking-normal transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${zero.blocked ? 'border-white/5 text-gray-500' : 'border-white/10 text-gray-200 hover:border-cyan-500/30 hover:text-white'}`}
        >
          Set 0
        </button>
      </div>
      {/* Rows prefer 42px and squeeze down to 32px when the panel is short, so
          all six readings stay on screen; the scrollbar is only a fallback. */}
      <div className="flex-1 min-h-0 flex flex-col gap-1.5 short:gap-1 overflow-y-auto">
        {rows.map(r => (
          <SensorRow key={r.label} {...(waiting && (r.label === 'B วัดจริง' || r.label === 'ΔB') ? { ...r, value: 'รอค่า', unit: '', color: '#6b7280' } : r)} />
        ))}
      </div>
    </div>
  );
}

// `hint` is a note beside the label and `tip` its tooltip. In the narrow lg
// column a note is left to the tooltip unless `hintAtLg` says it fits there.
type SensorRowProps = { label: string; hint?: ReactNode; hintAtLg?: boolean; tip?: string; value: string; unit: string; color: string };

function SensorRow({ label, hint, hintAtLg, tip, value, unit, color }: SensorRowProps) {
  const valRef = useRef<HTMLSpanElement>(null);
  const prevRef = useRef(value);
  useEffect(() => {
    if (prevRef.current !== value && valRef.current) {
      animate(valRef.current, { scale: [1.12, 1], opacity: [0.5, 1], duration: 260, ease: 'outBack' });
    }
    prevRef.current = value;
  }, [value]);
  return (
    <div className="s-card grow-0 shrink basis-[42px] min-h-[32px] flex items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-gray-950/60 px-2.5">
      <span title={tip ?? (typeof hint === 'string' ? `${label} ${hint}` : undefined)} className="min-w-0 text-sm lg:text-[13px] xl:text-sm leading-tight text-gray-400 line-clamp-2">
        {/* The label and its note each stay whole; the space between them is
            where the note drops to a line of its own when the two do not fit. */}
        <span className="whitespace-nowrap">{label}</span>{' '}
        {/* No room beside the value in the narrow lg column: the tooltip carries
            the note there, unless it was made to fit. */}
        {hint && <span className={`text-[11px] text-gray-500 whitespace-nowrap ${hintAtLg ? '' : 'lg:hidden xl:inline'}`}>{hint}</span>}
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
    'Z ส่งผลต่อ B_Z อย่างไร?',
  ],
};

// What the assistant is told about the experiment at the moment of asking.
type ChatReadings = {
  inst: Inst;
  I: number;
  bTheory: number; bMeasured: number;
  z: number;
  /** The background taken off bMeasured; null when it could not be read, undefined before it was tried. */
  background: number | null | undefined;
  /** The state of the room, for the assistant to answer from. */
  supply: 'on' | 'off' | 'held' | undefined;
  busy: boolean;
  sensor: boolean;
  rezeroed: number;
  error: string | undefined;
  /** When the round ends, ISO; the minutes left are worked out when a question is sent. */
  endTime: string;
  recorded: LabReading[];
};

// The conversation with the AI assistant. It lives in the page, above the two
// layouts, so the desktop panel and the compact "ผู้ช่วย" tab show the same
// chat and neither loses it when it is hidden or unmounted.
function useChat(onAsk: (question: string) => void) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState(false);

  async function send(text: string, { inst, I, bTheory, bMeasured, z, background, supply, busy, sensor, rezeroed, error, endTime, recorded }: ChatReadings) {
    if (!text.trim() || streaming) return;
    onAsk(text.trim());
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
            I, bTheory, bMeasured,
            z: inst.type === 'solenoid' ? z : undefined,
            background,
            supply, busy, sensor, rezeroed, error,
            minutesLeft: Math.max(0, Math.round((Date.parse(endTime) - Date.now()) / 60_000)),
            recorded,
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

// A number as text with a real minus sign, as the handout prints it.
const minus = (text: string) => text.replace('-', '−');

// Full size in the single-column compact tree; one step smaller in the narrow
// desktop column so a line like "b/√(R²+b²) = −0.8854" fits without wrapping.
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
              <span className="text-gray-400"> = μ₀nI / 2R</span>
            </div>

            {/* Substituted fraction */}
            <div className="text-gray-400 pl-3 space-y-0.5">
              <div className="text-gray-500">=</div>
              <div className="text-gray-300">1.2566×10⁻⁶ × {n} × {I.toFixed(2)}</div>
              <div className="h-px bg-gray-700" />
              <div className="text-gray-300">2 × {(R * 1000).toFixed(0)}×10⁻³</div>
            </div>

            {/* Parameters */}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {([
                { k: 'n', v: `${n} รอบ`, c: '#a3e635' },
                { k: 'R', v: `${(R * 1000).toFixed(0)} มม.` },
                { k: 'I', v: `${I.toFixed(2)} A`, c: '#22d3ee' },
                { k: 'μ₀', v: '1.2566×10⁻⁶ H/m' },
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

  // Solenoid, written as the lab handout writes it:
  //   B_Z = (μ₀nI / 2L) [ a/√(R²+a²) − b/√(R²+b²) ],  a = Z + L/2,  b = Z − L/2
  const { N, L, R } = inst;
  const a = z + L / 2;
  const b = z - L / 2;
  const termA = a / Math.sqrt(R * R + a * a);
  const termB = b / Math.sqrt(R * R + b * b);
  const result = calcBSolenoid(N, I, L, R, z);

  return (
    <div className="flex-1 flex flex-col min-h-0 rounded-lg border border-white/[0.07] bg-gray-950/60 px-3 py-2.5 short:py-2">
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider leading-tight shrink-0">
        โซลีนอยด์จำกัดความยาว
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto font-mono">
        <div className={`min-h-full flex flex-col justify-evenly gap-1.5 py-1 ${FORMULA_TEXT}`}>
          {/* Formula */}
          <div className="space-y-0.5">
            <div><span style={{ color: '#c8ff00' }}>B_Z</span><span className="text-gray-400"> = (μ₀nI / 2L)</span></div>
            <div className="text-gray-400 pl-4">× [ a/√(R²+a²)</div>
            <div className="text-gray-400 pl-4">{'  '}− b/√(R²+b²) ]</div>
          </div>

          {/* a and b */}
          <div className="space-y-0.5">
            <div className="text-gray-600">
              a = Z + L/2 = <span style={{ color: '#a78bfa' }}>{minus(cmText(a))} cm</span>
            </div>
            <div className="text-gray-600">
              b = Z − L/2 = <span style={{ color: '#a78bfa' }}>{minus(cmText(b))} cm</span>
            </div>
          </div>

          {/* The two terms in the bracket */}
          <div className="space-y-0.5">
            <div className="text-gray-600">a/√(R²+a²) = <span className="text-gray-300">{minus(termA.toFixed(4))}</span></div>
            <div className="text-gray-600">b/√(R²+b²) = <span className="text-gray-300">{minus(termB.toFixed(4))}</span></div>
            <div className="text-gray-600">ผลต่าง = <span className="text-gray-200">{(termA - termB).toFixed(4)}</span></div>
          </div>

          {/* Parameters */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 whitespace-nowrap">
            <span className="text-gray-600">Z=<span style={{ color: '#a78bfa' }}>{minus(cmText(z))}cm</span></span>
            <span className="text-gray-600">n=<span style={{ color: '#a3e635' }}>{N}</span></span>
            <span className="text-gray-600">L=<span className="text-gray-400">{(L * 1000).toFixed(0)}mm</span></span>
            <span className="text-gray-600">R=<span className="text-gray-400">{(R * 1000).toFixed(0)}mm</span></span>
            <span className="text-gray-600">I = <span style={{ color: '#22d3ee' }}>{I.toFixed(2)} A</span></span>
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="shrink-0 pt-2 mt-1 short:pt-1.5 border-t border-white/[0.07] flex items-baseline gap-2">
        <span className="font-mono text-sm text-gray-500">B_Z =</span>
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

// One measured position of the solenoid: `zero` is what had been taken off
// bMeasured when it was read (null when no zero had been read).
type MeasRecord = { bMeasured: number; bTheory: number; zero: number | null };

const NO_EVENTS: LabEvent[] = [];

// The table as a kept record has it: the positions the probe reached, each
// with its latest value and the zero in force then. A position with no value
// from the sensor reads 0, as it does when it is measured.
function keptTable(events: LabEvent[], inst: Inst): Map<number, MeasRecord> {
  return new Map(positionsOf(events, inst.name)
    .filter(p => PROBE_POSITIONS.includes(p.zCm))
    .map(p => [p.zCm, { bMeasured: p.bMeasured ?? 0, bTheory: p.bTheory, zero: p.zero }]));
}

function SolenoidDataPanel({ z, setZ, bTheory, measData, setMeasData, N, isMoving, setIsMoving, onMoveError, adjustAt, freshReading, background, disabled }: {
  /** Sets the calibration at the point just reached; gives the value to show and record. */
  adjustAt: (reading: number | null, bTheory: number) => { value: number | null };
  z: number; setZ: (v: number) => void;
  bTheory: number;
  measData: Map<number, MeasRecord>;
  setMeasData: React.Dispatch<React.SetStateAction<Map<number, MeasRecord>>>;
  N: number;
  isMoving: boolean; setIsMoving: (v: boolean) => void;
  /** Called with a message when the rig did not move the probe, and with null when it did. */
  onMoveError: (message: string | null, zCm: number, bTheory: number, bMeasured?: number | null) => void;
  /** A reading made of values taken from now on; null when the sensor sends none. */
  freshReading: () => Promise<number | null>;
  /** The zero the sensor's values have had taken off, kept with each position measured. */
  background: number | null | undefined;
  disabled?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Columns are the probe's positions (−10…+10); each is headed by where that
  // puts the probe, in cm.
  const zCm = Math.round(z / PROBE_STEP_M);
  const recorded = measData.size;
  const allZ = PROBE_POSITIONS;
  const zLabel = (position: number) => { const cm = cmText(probeZ(position)); return position > 0 ? `+${cm}` : cm; };
  const COL_W = 64; // px per Z column
  const LABEL_W = 100; // px for row-label column

  const liveRef = useRef({ bTheory });
  useEffect(() => { liveRef.current = { bTheory }; }, [bTheory]);

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

  // Choosing the position the probe is already at starts over there: the arm
  // is sent to it again, and the value is read and its calibration set anew.
  async function moveToPosition(zVal: number) {
    if (disabled || isMoving) return;
    const from = zCm;
    setIsMoving(true);
    setZ(probeZ(zVal));
    adjustAt(null, 0); // the point the probe was at is being left
    let at: { value: number | null } = { value: null };
    const failed = await sendToRig({ script: 'sole.py', position: zVal });
    if (failed) {
      // Nothing is recorded for a position the probe did not reach, and Z goes
      // back to the last place it is known to have been.
      setZ(probeZ(from));
    } else {
      // The probe is in place: once it has come to rest, only values taken
      // from here on count.
      await armSettled();
      const reading = await freshReading();
      // No reading here is 0: not the theory value, and not the value last
      // seen, which may be from the position the probe has just left.
      const { bTheory: bT } = liveRef.current;
      at = adjustAt(reading, bT);
      setMeasData(prev => new Map(prev).set(zVal, { bMeasured: at.value ?? 0, bTheory: bT, zero: background ?? null }));
    }
    onMoveError(failed, +cmText(probeZ(zVal)), liveRef.current.bTheory, at.value);
    setIsMoving(false);
  }

  function clearAll() { setMeasData(new Map()); }

  function downloadCSV() {
    // B_measured has the zero in force taken off; the last column says how much (empty when none had been read).
    const header = 'position,Z (cm),B_theory (mT),B_measured (mT),delta_B (mT),delta_B (%),B_zero (mT)\n';
    const rows = allZ
      .filter(zv => measData.has(zv))
      .map(zv => {
        const p = measData.get(zv)!;
        const d = p.bMeasured - p.bTheory;
        const pct = (d / p.bTheory) * 100;
        return `${zv},${cmText(probeZ(zv))},${p.bTheory.toFixed(4)},${fixed(p.bMeasured, 4)},${fixed(d, 4)},${fixed(pct, 2)},${p.zero === null ? '' : fixed(p.zero, 4)}`;
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
      getValue: p => ({ text: fixed(p.bMeasured, 3), color: '#22d3ee' }),
    },
    {
      key: 'delta', label: 'ΔB%', color: '#6b7280',
      getValue: p => {
        const d = (p.bMeasured - p.bTheory) / p.bTheory * 100;
        return { text: signedFixed(d, 1), color: Math.abs(d) > 5 ? '#f87171' : '#86efac' };
      },
    },
  ];

  return (
    <div ref={panelRef} className="flex-1 min-w-0 rounded-xl border border-white/10 bg-gray-900/50 flex flex-col overflow-hidden" style={{ opacity: 0 }}>
      {/* Header bar */}
      <div className="shrink-0 px-3 py-1.5 border-b border-white/5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">ข้อมูลแนวแกน Z</h2>
          <span className="text-sm font-mono text-gray-600">n={N}</span>
          <span className="text-sm font-semibold" style={{ color: recorded === allZ.length ? '#c8ff00' : '#22d3ee' }}>{recorded}/{allZ.length}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isMoving && (
            <div className="flex items-center gap-1.5 text-sm text-violet-400">
              <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              <span className="font-mono tabular-nums">{zLabel(zCm)} cm</span>
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
                    disabled={disabled}
                    title={isCurrent ? 'วัดซ้ำที่ตำแหน่งนี้' : undefined}
                    className={`shrink-0 h-[30px] w-full flex items-center justify-center text-sm font-mono font-semibold border-b border-white/5 transition-colors
                      ${isCurrent && isMoving ? 'text-violet-400 animate-pulse' : ''}
                      ${isCurrent && !isMoving ? 'text-[#c8ff00] hover:bg-white/5 cursor-pointer' : ''}
                      ${!isCurrent && !isMoving ? 'text-gray-600 hover:text-gray-300 hover:bg-white/5 cursor-pointer' : ''}
                      ${!isCurrent && isMoving ? 'text-gray-700 cursor-not-allowed' : ''}
                    `}
                  >
                    {zLabel(zVal)}
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



// What has happened in this visit so far, as it happens. The same list becomes
// the summary and the CSV when the visit ends.
function LogPanel({ events }: { events: LabEvent[] }) {
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    const rows = listRef.current.querySelectorAll('.log-row');
    const last = rows[rows.length - 1] as HTMLElement | undefined;
    if (last && !prefersReducedMotion()) animate(last, { opacity: [0, 1], translateX: [-8, 0], duration: 280, ease: 'outCubic' });
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [events.length]);

  return (
    <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-gray-900/50 flex flex-col overflow-hidden">
      <div className="shrink-0 px-3 py-1.5 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400">บันทึกการทดลอง</h2>
        <span className="text-sm text-gray-600 font-mono">{events.length}</span>
      </div>
      <div ref={listRef} className="overflow-y-auto p-2 space-y-0.5 font-mono text-sm">
        {events.length === 0 && <p className="px-1 py-2 font-sans text-gray-600">ยังไม่มีรายการ</p>}
        {events.map((e, i) => (
          <div key={i} className="log-row flex items-start gap-1.5 leading-5">
            <span className="text-gray-700 shrink-0 tabular-nums">{clockTime(e.at)}</span>
            <span className={`break-words font-sans ${e.ok === false ? 'text-red-300' : e.kind === 'move' || e.kind === 'reading' ? 'text-cyan-300' : 'text-gray-300'}`}>{describeEvent(e)}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
