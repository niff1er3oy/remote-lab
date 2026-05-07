'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, stagger, scrambleText } from 'animejs';
import Link from 'next/link';

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
type SolInst  = { id: number; type: 'solenoid'; name: string; sub: string; I0: number; N: number; L: number; R: number; icon: ReactNode };
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
        <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>
      </svg>
    ),
  },
  {
    id: 1, type: 'coil', name: 'ขดลวดเดี่ยว 2 รอบ', sub: 'n=2 · R=13 มม.',
    I0: 5, turns: 2, R: 0.013,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/>
      </svg>
    ),
  },
  {
    id: 2, type: 'coil', name: 'ขดลวดเดี่ยว 3 รอบ', sub: 'n=3 · R=13 มม.',
    I0: 5, turns: 3, R: 0.013,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6.5"/>
        <circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.5"/>
      </svg>
    ),
  },
  // ตอนที่ 2 — โซลีนอยด์  L=160 mm · R=13 mm · I₀ = 1 A
  {
    id: 3, type: 'solenoid', name: 'โซลีนอยด์ 75 รอบ', sub: 'N=75 · L=160 มม.',
    I0: 1, N: 75, L: 0.16, R: 0.013,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="9" width="20" height="6" rx="1"/>
        <path d="M2 12h20" strokeDasharray="3 2"/>
      </svg>
    ),
  },
  {
    id: 4, type: 'solenoid', name: 'โซลีนอยด์ 150 รอบ', sub: 'N=150 · L=160 มม.',
    I0: 1, N: 150, L: 0.16, R: 0.013,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="8" width="20" height="8" rx="1"/>
        <path d="M2 10.5h20M2 12h20M2 13.5h20" strokeDasharray="3 2"/>
      </svg>
    ),
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RemoteLabPage() {
  const [instrument, setInstrument] = useState(0);
  const [I, setI] = useState(5.0);
  const [z, setZ] = useState(0); // Z position in metres (solenoid only, ±0.15 m)
  const [measData, setMeasData] = useState<Map<number, { bMeasured: number; bTheory: number }>>(new Map());
  const topRowRef = useRef<HTMLDivElement>(null);
  const btmRowRef = useRef<HTMLDivElement>(null);
  const rightRef  = useRef<HTMLDivElement>(null);

  // Reset I, Z, and measurement data when instrument changes
  useEffect(() => {
    const inst = instruments[instrument];
    setI(inst.I0);
    setZ(0);
    setMeasData(new Map());
  }, [instrument]);

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

  // Entry animations
  useEffect(() => {
    if (topRowRef.current) animate(topRowRef.current, { opacity: [0, 1], translateY: [-16, 0], duration: 650, ease: 'outCubic' });
    if (btmRowRef.current) animate(btmRowRef.current, { opacity: [0, 1], translateY: [16, 0], duration: 650, delay: 120, ease: 'outCubic' });
    if (rightRef.current)  animate(rightRef.current,  { opacity: [0, 1], translateX: [24, 0], duration: 650, delay: 80,  ease: 'outCubic' });
  }, []);

  const inst = instruments[instrument];
  const I0 = inst.I0;
  const bTheory   = inst.type === 'coil'
    ? calcBCoil(inst.turns, I0, inst.R)
    : calcBSolenoid(inst.N, I0, inst.L, inst.R, z);
  const bMeasured = inst.type === 'coil'
    ? calcBCoil(inst.turns, I, inst.R)
    : calcBSolenoid(inst.N, I, inst.L, inst.R, z);

  return (
    <div className="flex flex-col h-screen bg-[#030712] text-white overflow-hidden">
      <SessionBar />
      <div className="flex-1 overflow-hidden p-3 flex gap-3">

        {/* Left ── Camera + FieldViz (top) · InstrSel + Sensor (bottom) */}
        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
          <div
            ref={topRowRef}
            className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-3"
            style={{ opacity: 0 }}
          >
            <CameraSection />
            <SplitFieldPanel
              instType={inst.type}
              bTheory={bTheory} bMeasured={bMeasured}
              I={I} I0={I0} z={z}
            />
          </div>
          <div
            ref={btmRowRef}
            className="shrink-0 flex gap-3"
            style={{ opacity: 0 }}
          >
            <InstrumentSelector active={instrument} onSelect={setInstrument} />
            <SensorPanel
              inst={inst} I={I} I0={I0}
              bTheory={bTheory} bMeasured={bMeasured}
              z={z}
            />
            <FormulaPanel inst={inst} I={I} z={z} />
            {inst.type === 'solenoid' && (
              <SolenoidDataPanel
                z={z} setZ={setZ}
                bMeasured={bMeasured} bTheory={bTheory}
                measData={measData} setMeasData={setMeasData}
                N={inst.N}
              />
            )}
          </div>
        </div>

        {/* Right ── Chat + Log */}
        <div
          ref={rightRef}
          className="w-[260px] shrink-0 flex flex-col gap-3 overflow-hidden"
          style={{ opacity: 0 }}
        >
          <ChatPanel inst={inst} I={I} I0={I0} bTheory={bTheory} bMeasured={bMeasured} z={z} />
          <LogPanel instrument={instrument} I={I} bMeasured={bMeasured} z={z} instType={inst.type} />
        </div>

      </div>
    </div>
  );
}

// ── Session Bar ───────────────────────────────────────────────────────────────

function SessionBar() {
  const [secs, setSecs] = useState(0);
  const barRef = useRef<HTMLElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (barRef.current) animate(barRef.current, { opacity: [0, 1], translateY: [-20, 0], duration: 600, ease: 'outCubic' });
    if (labelRef.current) animate(labelRef.current, { innerHTML: scrambleText({ chars: 'braille', from: 'left', override: '' }) });
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header ref={barRef} className="shrink-0 border-b border-white/10 bg-[#030712]/95 h-12 px-4 flex items-center justify-between gap-4" style={{ opacity: 0 }}>
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-md bg-[#c8ff00] flex items-center justify-center shrink-0" style={{ boxShadow: '0 0 10px rgba(200,255,0,0.5)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#030712" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3h6M9 3v7l-5 9h16l-5-9V3" />
          </svg>
        </div>
        <span className="text-sm font-semibold">Remote<span className="text-[#c8ff00]">Lab</span></span>
      </div>
      <div className="hidden md:flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#c8ff00] animate-pulse inline-block" style={{ boxShadow: '0 0 4px #c8ff00' }} />
          <span className="text-[#c8ff00] font-semibold">LIVE</span>
        </span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">LAB 8: <span ref={labelRef} className="text-white">สนามแม่เหล็กและกฎไบโอต-ซาวัต</span></span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">Session: <span className="text-white font-mono">LAB8-2026-0089</span></span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">เวลา: <span className="font-mono text-white">{hhmmss(secs)}</span></span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link href="/" className="text-xs px-3 py-1.5 rounded-md border border-white/10 text-gray-400 hover:text-white transition-colors">← กลับ</Link>
        <button className="text-xs px-3 py-1.5 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 font-semibold transition-colors flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
          หยุดฉุกเฉิน
        </button>
      </div>
    </header>
  );
}

// ── Camera ────────────────────────────────────────────────────────────────────

function CameraSection() {
  const crossRef = useRef<HTMLDivElement>(null);
  const cornersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ring = crossRef.current?.querySelector('.cross-ring') as HTMLElement | null;
    if (ring) animate(ring, { rotate: [0, 360], duration: 12000, ease: 'linear', loop: true });
    if (cornersRef.current) {
      animate(cornersRef.current.querySelectorAll('.corner'), {
        opacity: [0, 1], scale: [0.4, 1], duration: 500, delay: stagger(80, { start: 300 }), ease: 'outBack',
      });
    }
  }, []);

  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/50 overflow-hidden h-full">
      <div className="relative h-full bg-[#050810] overflow-hidden">
        <div className="absolute inset-0 pointer-events-none z-10" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)' }} />
        <div className="absolute inset-0 pointer-events-none opacity-10" style={{
          backgroundImage: 'linear-gradient(rgba(200,255,0,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.5) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }} />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 select-none pointer-events-none">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(200,255,0,0.12)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" />
          </svg>
          <span className="text-[9px] text-[#c8ff00]/20 font-mono uppercase tracking-widest">กล้องหลัก — ด้านหน้า</span>
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

function InstrumentSelector({ active, onSelect }: { active: number; onSelect: (i: number) => void }) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rowRef.current) return;
    animate(rowRef.current.querySelectorAll('.inst-card'), {
      opacity: [0, 1], translateY: [18, 0], scale: [0.94, 1],
      duration: 500, delay: stagger(80, { start: 200 }), ease: 'outCubic',
    });
  }, []);

  function handleSelect(i: number) {
    if (i === active) return;
    const card = rowRef.current?.querySelectorAll('.inst-card')[i] as HTMLElement | null;
    if (card) animate(card, { scale: [0.94, 1.04, 1], duration: 360, ease: 'outBack' });
    onSelect(i);
  }

  return (
    <div className="shrink-0 w-[220px] rounded-xl border border-white/10 bg-gray-900/50 p-3 overflow-y-auto">
      <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">เลือกอุปกรณ์วัด</h2>
      <div ref={rowRef} className="flex flex-col gap-1.5">
        <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest pt-0.5">ตอนที่ 1 — ขดลวดเดี่ยว</p>
        {instruments.map((inst, i) => {
          if (inst.type !== 'coil') return null;
          return (
            <button key={inst.id} onClick={() => handleSelect(i)}
              className={`inst-card opacity-0 relative rounded-lg border p-2.5 text-left transition-colors overflow-hidden ${i === active ? 'bg-[#c8ff00]/8 border-[#c8ff00]/40 text-[#c8ff00]' : 'bg-gray-950/60 border-white/[0.08] text-gray-400 hover:border-white/20 hover:text-gray-300'}`}
              style={{ boxShadow: i === active ? '0 0 20px rgba(200,255,0,0.06) inset' : undefined }}
            >
              {i === active && <div className="absolute top-0 left-3 right-3 h-px bg-linear-to-r from-transparent via-[#c8ff00]/50 to-transparent" />}
              <div className="flex items-center gap-2">
                <div className={i === active ? 'text-[#c8ff00]' : 'text-gray-600'}>{inst.icon}</div>
                <div>
                  <p className="text-[11px] font-semibold leading-none">{inst.name}</p>
                  <p className={`text-[9px] mt-0.5 ${i === active ? 'text-[#c8ff00]/60' : 'text-gray-600'}`}>{inst.sub}</p>
                </div>
                {i === active && <div className="ml-auto flex items-center gap-1 text-[9px] font-semibold text-[#c8ff00]"><span className="h-1 w-1 rounded-full bg-[#c8ff00] animate-pulse inline-block" />ON</div>}
              </div>
            </button>
          );
        })}
        <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest pt-1.5">ตอนที่ 2 — โซลีนอยด์</p>
        {instruments.map((inst, i) => {
          if (inst.type !== 'solenoid') return null;
          return (
            <button key={inst.id} onClick={() => handleSelect(i)}
              className={`inst-card opacity-0 relative rounded-lg border p-2.5 text-left transition-colors overflow-hidden ${i === active ? 'bg-[#c8ff00]/8 border-[#c8ff00]/40 text-[#c8ff00]' : 'bg-gray-950/60 border-white/[0.08] text-gray-400 hover:border-white/20 hover:text-gray-300'}`}
              style={{ boxShadow: i === active ? '0 0 20px rgba(200,255,0,0.06) inset' : undefined }}
            >
              {i === active && <div className="absolute top-0 left-3 right-3 h-px bg-linear-to-r from-transparent via-[#c8ff00]/50 to-transparent" />}
              <div className="flex items-center gap-2">
                <div className={i === active ? 'text-[#c8ff00]' : 'text-gray-600'}>{inst.icon}</div>
                <div>
                  <p className="text-[11px] font-semibold leading-none">{inst.name}</p>
                  <p className={`text-[9px] mt-0.5 ${i === active ? 'text-[#c8ff00]/60' : 'text-gray-600'}`}>{inst.sub}</p>
                </div>
                {i === active && <div className="ml-auto flex items-center gap-1 text-[9px] font-semibold text-[#c8ff00]"><span className="h-1 w-1 rounded-full bg-[#c8ff00] animate-pulse inline-block" />ON</div>}
              </div>
            </button>
          );
        })}
      </div>
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
    <div className="flex flex-col rounded-xl border border-white/10 bg-gray-900/50 overflow-hidden min-h-0">
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

// ── Solenoid SVG ──────────────────────────────────────────────────────────────

const SOLENOID_OUTER: Record<'theory' | 'measured', string[]> = {
  theory: [
    'M 60,90 C 28,70 26,32 160,32 C 294,32 292,70 260,90',
    'M 260,90 C 292,110 294,148 160,148 C 26,148 28,110 60,90',
    'M 60,90 C 10,55 8,5 160,5 C 312,5 310,55 260,90',
    'M 260,90 C 310,125 312,175 160,175 C 8,175 10,125 60,90',
  ],
  measured: [
    'M 60,90 C 24,68 23,30 160,34 C 296,30 294,72 260,90',
    'M 260,90 C 296,110 298,150 160,146 C 22,150 24,112 60,90',
    'M 60,90 C 8,53 6,3 160,7 C 314,3 312,57 260,90',
    'M 260,90 C 314,125 316,177 160,173 C 4,177 8,127 60,90',
  ],
};
const SOLENOID_INSIDE = ['M 65,74 L 255,74', 'M 65,90 L 255,90', 'M 65,106 L 255,106'];

function SolenoidSVG({ mode }: { mode: 'theory' | 'measured' }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const color = mode === 'theory' ? '#c8ff00' : '#22d3ee';
  useFlPathAnimation(svgRef, (i) => 2400 + i * 220, mode);

  return (
    <svg ref={svgRef} viewBox="0 0 320 180" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <rect x="60" y="64" width="200" height="52" fill={`${color}05`} stroke={`${color}30`} strokeWidth="1.5" rx="2" />
      {Array.from({ length: 11 }, (_, i) => (
        <line key={i} x1={64 + i * 18} y1="64" x2={73 + i * 18} y2="64" stroke={`${color}35`} strokeWidth="2.5" />
      ))}
      {Array.from({ length: 11 }, (_, i) => (
        <line key={i} x1={64 + i * 18} y1="116" x2={73 + i * 18} y2="116" stroke={`${color}35`} strokeWidth="2.5" />
      ))}
      <text x="263" y="94" fontSize="10" fill={`${color}80`} fontFamily="monospace" fontWeight="bold">N</text>
      <text x="45" y="94" fontSize="10" fill={`${color}80`} fontFamily="monospace" fontWeight="bold">S</text>
      {SOLENOID_OUTER[mode].map((d, i) => (
        <path key={i} className="fl" d={d} fill="none" stroke={color} strokeWidth="1" opacity="0.5" />
      ))}
      {SOLENOID_INSIDE.map((d, i) => (
        <path key={i} className="fl" d={d} fill="none" stroke={color} strokeWidth="1.4" opacity="0.85" />
      ))}
      {[74, 90, 106].map(y => (
        <polygon key={y} points={`250,${y - 4} 258,${y} 250,${y + 4}`} fill={color} opacity="0.7" />
      ))}
      <text x="160" y="170" fontSize="8" fill={`${color}40`} fontFamily="monospace" textAnchor="middle">
        {mode === 'theory' ? 'THEORETICAL · Bz=μ₀NI(a+b)/2L' : 'MEASURED · sensor data'}
      </text>
    </svg>
  );
}

// ── Single Coil SVG ───────────────────────────────────────────────────────────

const COIL_AXIAL = ['M 5,90 L 148,90', 'M 172,90 L 315,90'];
const COIL_LOOPS: Record<'theory' | 'measured', string[]> = {
  theory: [
    'M 162,88 C 183,78 190,56 160,46 C 130,56 137,78 158,88',
    'M 158,92 C 137,102 130,124 160,134 C 190,124 183,102 162,92',
    'M 162,88 C 200,70 206,32 160,20 C 114,32 120,70 158,88',
    'M 158,92 C 120,110 114,148 160,160 C 206,148 200,110 162,92',
    'M 162,88 C 214,60 218,8 160,4 C 102,8 106,60 158,88',
    'M 158,92 C 106,120 102,172 160,176 C 218,172 214,120 162,92',
  ],
  measured: [
    'M 162,88 C 186,76 192,54 160,44 C 128,56 135,80 158,88',
    'M 158,92 C 135,104 128,126 160,136 C 192,122 186,102 162,92',
    'M 162,88 C 204,68 208,30 160,18 C 112,34 118,72 158,88',
    'M 158,92 C 118,112 112,150 160,162 C 208,146 204,108 162,92',
    'M 162,88 C 218,58 220,6 160,2 C 100,10 104,62 158,88',
    'M 158,92 C 104,118 100,170 160,178 C 220,174 218,122 162,92',
  ],
};

function CoilSVG({ mode }: { mode: 'theory' | 'measured' }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const color = mode === 'theory' ? '#c8ff00' : '#22d3ee';
  useFlPathAnimation(svgRef, (i) => 2600 + i * 180, mode);

  return (
    <svg ref={svgRef} viewBox="0 0 320 180" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {COIL_LOOPS[mode].map((d, i) => (
        <path key={i} className="fl" d={d} fill="none" stroke={color}
          strokeWidth={i < 2 ? 1.4 : i < 4 ? 1.1 : 0.8}
          opacity={i < 2 ? 0.8 : i < 4 ? 0.6 : 0.4}
        />
      ))}
      {COIL_AXIAL.map((d, i) => (
        <path key={i} className="fl" d={d} fill="none" stroke={color} strokeWidth="1.2" opacity="0.7" />
      ))}
      <polygon points="140,86 148,90 140,94" fill={color} opacity="0.6" />
      <polygon points="180,86 172,90 180,94" fill={color} opacity="0.6" />
      <circle cx="160" cy="90" r="14" fill={`${color}06`} stroke={`${color}50`} strokeWidth="2" />
      <circle cx="160" cy="90" r="3.5" fill={color} opacity="0.8" />
      <circle cx="160" cy="90" r="1.5" fill="#030712" />
      <text x="274" y="86" fontSize="10" fill={`${color}80`} fontFamily="monospace" fontWeight="bold">N</text>
      <text x="36" y="86" fontSize="10" fill={`${color}80`} fontFamily="monospace" fontWeight="bold">S</text>
      <text x="160" y="172" fontSize="8" fill={`${color}40`} fontFamily="monospace" textAnchor="middle">
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
    <div ref={panelRef} className="shrink-0 w-[220px] rounded-xl border border-white/10 bg-gray-900/50 p-3">
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
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
              accText += ev.delta.text;
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
            <div className={`max-w-[90%] rounded-xl px-2.5 py-1.5 text-[11px] leading-5 whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-[#c8ff00]/10 border border-[#c8ff00]/25 text-[#c8ff00]/90'
                : 'bg-gray-800/60 border border-white/[0.07] text-gray-300'
            }`}>
              {msg.content || (streaming && msg.role === 'assistant' ? (
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                </span>
              ) : '')}
            </div>
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
              { k: 'n',  v: `${n} รอบ`,                    c: '#a3e635' },
              { k: 'R',  v: `${(R*1000).toFixed(0)} มม.` },
              { k: 'μ₀', v: '4π×10⁻⁷ H/m' },
              { k: 'I',  v: `${I.toFixed(3)} A`,            c: '#22d3ee' },
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
            a = {halfLcm} + {zCm} = <span style={{ color: '#a78bfa' }}>{(a*100).toFixed(0)} cm</span>
          </div>
          <div className="text-gray-600">
            b = {halfLcm} − {zCm} = <span style={{ color: '#a78bfa' }}>{(b*100).toFixed(0)} cm</span>
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
          <span className="text-gray-600">L=<span className="text-gray-400">{(L*1000).toFixed(0)}mm</span></span>
          <span className="text-gray-600">R=<span className="text-gray-400">{(R*1000).toFixed(0)}mm</span></span>
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
    <div className="shrink-0 w-[220px] rounded-xl border border-white/10 bg-gray-900/50 p-3 flex flex-col">
      <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 shrink-0">สูตรการคำนวณ</h2>
      <FormulaCard inst={inst} I={I} z={z} />
    </div>
  );
}

// ── Solenoid Data Panel ───────────────────────────────────────────────────────

type MeasRecord = { bMeasured: number; bTheory: number };

function SolenoidDataPanel({ z, setZ, bMeasured, bTheory, measData, setMeasData, N }: {
  z: number; setZ: (v: number) => void;
  bMeasured: number; bTheory: number;
  measData: Map<number, MeasRecord>;
  setMeasData: React.Dispatch<React.SetStateAction<Map<number, MeasRecord>>>;
  N: number;
}) {
  const panelRef  = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const zCm     = Math.round(z * 100);
  const recorded = measData.size;
  const allZ     = Array.from({ length: 31 }, (_, i) => i - 15); // −15…+15
  const COL_W    = 48; // px per Z column
  const LABEL_W  = 72; // px for row-label column

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

  // ── Auto-scan state ──
  const [scanning, setScanning] = useState(false);
  const scanRef = useRef({ active: false, dir: 1 as 1 | -1, z, bMeasured, bTheory });

  useEffect(() => {
    scanRef.current.z = z;
    scanRef.current.bMeasured = bMeasured;
    scanRef.current.bTheory = bTheory;
  }, [z, bMeasured, bTheory]);

  useEffect(() => () => { scanRef.current.active = false; }, []);

  function startScan(dir: 1 | -1) {
    if (scanRef.current.active) {
      scanRef.current.active = false;
      setScanning(false);
      return;
    }
    scanRef.current.active = true;
    scanRef.current.dir = dir;
    setScanning(true);

    function step() {
      if (!scanRef.current.active) return;
      const curCm = Math.round(scanRef.current.z * 100);
      setMeasData(prev => new Map(prev).set(curCm, {
        bMeasured: scanRef.current.bMeasured,
        bTheory:   scanRef.current.bTheory,
      }));
      const nextCm = curCm + scanRef.current.dir;
      if (nextCm < -15 || nextCm > 15) {
        scanRef.current.active = false;
        setScanning(false);
        return;
      }
      setZ(nextCm / 100);
      setTimeout(step, 900);
    }
    step();
  }

  function record()  { setMeasData(prev => new Map(prev).set(zCm, { bMeasured, bTheory })); }
  function clearAll(){ scanRef.current.active = false; setScanning(false); setMeasData(new Map()); }

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
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">ข้อมูลแนวแกน Z</h2>
            <span className="text-[9px] font-mono text-gray-600">N={N}</span>
            <span className="text-[9px] font-semibold" style={{ color: recorded === 31 ? '#c8ff00' : '#22d3ee' }}>{recorded}/31</span>
          </div>
          {/* Z slider */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[9px] font-mono font-bold tabular-nums shrink-0" style={{ color: '#a78bfa' }}>
              {zCm > 0 ? `+${zCm}` : zCm} cm
            </span>
            <input
              type="range" min="-15" max="15" step="1"
              value={zCm}
              onChange={e => setZ(Number(e.target.value) / 100)}
              className="flex-1 h-1 cursor-pointer accent-violet-400 min-w-0"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Scan ‹ */}
          <button
            onClick={() => startScan(-1)}
            disabled={!scanning && zCm <= -15}
            title={scanning && scanRef.current.dir === -1 ? 'หยุด' : 'สแกนถอยหลัง'}
            className={`h-6 w-6 flex items-center justify-center rounded-md border text-[11px] font-bold transition-colors ${
              scanning && scanRef.current.dir === -1
                ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed'
            }`}
          >{scanning && scanRef.current.dir === -1 ? '■' : '‹'}</button>

          {/* Record */}
          <button
            onClick={record}
            disabled={scanning}
            className="text-[9px] px-2 py-1 rounded-md bg-[#c8ff00]/10 border border-[#c8ff00]/30 text-[#c8ff00] hover:bg-[#c8ff00]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-semibold leading-none"
          >บันทึก {zCm > 0 ? `+${zCm}` : zCm} cm</button>

          {/* Scan › */}
          <button
            onClick={() => startScan(1)}
            disabled={!scanning && zCm >= 15}
            title={scanning && scanRef.current.dir === 1 ? 'หยุด' : 'สแกนไปหน้า'}
            className={`h-6 w-6 flex items-center justify-center rounded-md border text-[11px] font-bold transition-colors ${
              scanning && scanRef.current.dir === 1
                ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed'
            }`}
          >{scanning && scanRef.current.dir === 1 ? '■' : '›'}</button>

          {recorded > 0 && !scanning && (
            <>
              <button
                onClick={downloadCSV}
                title="ดาวน์โหลด CSV"
                className="h-6 w-6 flex items-center justify-center rounded-md border border-white/10 text-gray-400 hover:border-[#c8ff00]/40 hover:text-[#c8ff00] transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v13M5 14l7 7 7-7"/><path d="M3 21h18"/>
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
              const point     = measData.get(zVal);
              return (
                <div
                  key={zVal}
                  data-z={zVal}
                  className={`shrink-0 flex flex-col border-r border-white/[0.04] last:border-0 transition-colors ${isCurrent ? 'bg-[#c8ff00]/8' : ''}`}
                  style={{ width: COL_W }}
                >
                  {/* Z value header */}
                  <div className={`shrink-0 h-[26px] flex items-center justify-center text-[9px] font-mono font-semibold border-b border-white/5 select-none ${isCurrent ? 'text-[#c8ff00]' : 'text-gray-600'}`}>
                    {zVal > 0 ? `+${zVal}` : zVal}
                  </div>
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
    <div className="shrink-0 rounded-xl border border-white/10 bg-gray-900/50 flex flex-col overflow-hidden" style={{ maxHeight: '130px' }}>
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
