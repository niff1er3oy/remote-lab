'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { animate, stagger } from 'animejs';
import { prefersReducedMotion } from '@/lib/motion';
import { fixed, signedFixed } from '@/lib/physics';
import type { LabReading } from '@/lib/lab-activity';
import {
  coilPart, MU0_HANDOUT, niceTicks, smoothPath, SOLENOID_END_CM, solenoidPart, Z_MAX_CM, Z_MIN_CM,
  type CoilPart, type SolenoidPart,
} from '@/lib/lab-graphs';

// The graphs of a visit, one per part of the lab as the worksheet has them,
// in a dialog over the summary. Each is a plain SVG that carries its own
// background, legend and axis titles, so that it can be saved as a PNG for a
// report exactly as it is shown.

const W = 640;
const H = 380;
const M = { left: 66, right: 20, top: 46, bottom: 56 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

// Inks and marks. Theory and measured are the lab room's own two colours.
const C = {
  surface: '#111827',
  grid: 'rgba(255,255,255,0.07)',
  axis: 'rgba(255,255,255,0.22)',
  text: '#9ca3af',
  strong: '#e5e7eb',
  theory: '#c8ff00',
  measured: '#22d3ee',
  end: 'rgba(255,255,255,0.28)',
};
const FONT = "'Leelawadee UI', Tahoma, 'Noto Sans Thai', 'Segoe UI', sans-serif";
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400';

type Tab = 'coil' | 'solenoid';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'coil', label: 'ตอนที่ 1 ขดลวดเดี่ยว' },
  { id: 'solenoid', label: 'ตอนที่ 2 โซลีนอยด์' },
];

type Tip = { x: number; y: number; lines: string[] };

/** μ0 in units of 10^-6 H/m, to four figures. */
const micro = (mu0: number) => (mu0 * 1e6).toFixed(4);

export default function LabGraphs({ readings, onClose }: { readings: LabReading[]; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('coil');
  const [tip, setTip] = useState<Tip | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ coil: null, solenoid: null });
  const coil = coilPart(readings);
  const solenoid = solenoidPart(readings);
  const hasData = tab === 'coil' ? coil.points.length > 0 : solenoid.points.length > 0;

  // The dialog opens on its first tab, and Escape closes it from anywhere in it.
  useEffect(() => { tabRefs.current.coil?.focus(); }, []);

  // The lines draw themselves in and the points follow, each time a graph is shown.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || prefersReducedMotion()) return;
    const lines = Array.from(svg.querySelectorAll<SVGPathElement>('[data-draw]'));
    const runs = lines.map((path) => {
      const length = typeof path.getTotalLength === 'function' ? path.getTotalLength() : 0;
      if (!length) return null;
      path.style.strokeDasharray = `${length}`;
      return animate(path, { strokeDashoffset: [length, 0], duration: 700, ease: 'outCubic' });
    });
    const dots = animate(svg.querySelectorAll('[data-point]'), {
      opacity: [0, 1], duration: 360, delay: stagger(40, { start: 300 }), ease: 'outCubic',
    });
    return () => {
      runs.forEach((r) => r?.pause());
      dots.pause();
      lines.forEach((path) => { path.style.strokeDasharray = ''; path.style.strokeDashoffset = ''; });
    };
  }, [tab]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    // Keyboard focus stays inside the dialog while it is open.
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: Tab = tab === 'coil' ? 'solenoid' : 'coil';
    setTab(next);
    setTip(null);
    tabRefs.current[next]?.focus();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="graphs-title" onKeyDown={onKeyDown}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-3 short:py-2">
          <h2 id="graphs-title" className="text-base font-semibold text-white">กราฟผลการทดลอง</h2>
          <div role="tablist" aria-label="ตอนของการทดลอง" className="flex gap-1 rounded-full border border-white/10 p-1">
            {TABS.map((t) => (
              <button
                key={t.id} ref={(el) => { tabRefs.current[t.id] = el; }}
                role="tab" id={`graph-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="graph-panel"
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => { setTab(t.id); setTip(null); }} onKeyDown={onTabKey}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${tab === t.id ? 'bg-[#c8ff00] text-gray-950' : 'text-gray-400 hover:text-white'} ${FOCUS}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button" onClick={onClose} aria-label="ปิดกราฟ"
            className={`flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-gray-300 transition-colors hover:border-cyan-500/30 hover:text-white ${FOCUS}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div id="graph-panel" role="tabpanel" aria-labelledby={`graph-tab-${tab}`} className="px-5 py-4 short:py-3">
          {hasData ? (
            <>
              <svg
                ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-h-[52vh]" role="img"
                aria-label={tab === 'coil' ? 'กราฟความเข้มสนามแม่เหล็กกับจำนวนรอบของขดลวดเดี่ยว' : 'กราฟความเข้มสนามแม่เหล็กกับระยะตามแนวแกน Z ของโซลีนอยด์'}
                fontFamily={FONT} onMouseLeave={() => setTip(null)}
              >
                <rect width={W} height={H} rx="12" fill={C.surface} />
                {tab === 'coil' ? <CoilChart part={coil} onTip={setTip} /> : <SolenoidChart part={solenoid} onTip={setTip} />}
                {tip && <TipBox tip={tip} />}
              </svg>
              {tab === 'coil' ? <CoilFacts part={coil} /> : <SolenoidFacts part={solenoid} />}
            </>
          ) : (
            <p className="py-10 text-center text-sm text-gray-400">
              {tab === 'coil'
                ? 'ยังไม่มีค่าของตอนนี้ เลือกขดลวดเดี่ยวในห้องแลปเพื่อวัดค่าก่อน'
                : 'ยังไม่มีค่าของตอนนี้ เลือกโซลีนอยด์ในห้องแลปแล้วเลื่อนหัววัดเพื่อวัดค่าก่อน'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 px-5 py-3 short:py-2">
          <p className="text-xs text-gray-500">ชี้หรือแตะที่จุดเพื่อดูค่า</p>
          <button
            type="button" disabled={!hasData}
            onClick={() => { setTip(null); if (svgRef.current) void savePng(svgRef.current, tab); }}
            className={`flex items-center gap-2 rounded-full bg-[#c8ff00] px-4 py-1.5 text-xs font-semibold text-gray-950 transition-colors hover:bg-white disabled:bg-gray-800 disabled:text-gray-500 ${FOCUS}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </svg>
            บันทึกกราฟเป็น PNG
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pieces shared by both graphs ──────────────────────────────────────────────

const yOf = (b: number, top: number) => M.top + PLOT_H - (b / top) * PLOT_H;

function Frame({ xTicks, xOf, xTitle, yTicks, yTitle, xLabel = String }: {
  xTicks: number[]; xOf: (v: number) => number; xTitle: string;
  yTicks: number[]; yTitle: string; xLabel?: (v: number) => string;
}) {
  const top = yTicks[yTicks.length - 1];
  const digits = yTicks.some((t) => !Number.isInteger(t * 10)) ? 2 : yTicks.some((t) => !Number.isInteger(t)) ? 1 : 0;
  return (
    <g>
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={M.left} x2={W - M.right} y1={yOf(t, top)} y2={yOf(t, top)} stroke={t === 0 ? C.axis : C.grid} strokeWidth="1" />
          <text x={M.left - 8} y={yOf(t, top) + 4} textAnchor="end" fontSize="12" fill={C.text}>{t.toFixed(digits)}</text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={`x${t}`} x={xOf(t)} y={M.top + PLOT_H + 18} textAnchor="middle" fontSize="12" fill={C.text}>{xLabel(t)}</text>
      ))}
      <text x={M.left + PLOT_W / 2} y={H - 12} textAnchor="middle" fontSize="13" fill={C.strong}>{xTitle}</text>
      <text transform={`translate(18 ${M.top + PLOT_H / 2}) rotate(-90)`} textAnchor="middle" fontSize="13" fill={C.strong}>{yTitle}</text>
    </g>
  );
}

type Key = { label: string; mark: 'line' | 'dash' | 'dot' | 'square' | 'line-dot'; color: string };

// The legend sits inside the graph, so that a saved PNG keeps it.
function Legend({ keys }: { keys: Key[] }) {
  // Each key starts where the ones before it, mark and words, end.
  const starts = keys.map((_, i) => keys.slice(0, i).reduce((x, k) => x + 34 + k.label.length * 7.4, M.left));
  return (
    <g>
      {keys.map((k, i) => {
        const at = starts[i];
        return (
          <g key={k.label} transform={`translate(${at} 22)`}>
            {k.mark === 'line' && <line x1="0" x2="20" y1="0" y2="0" stroke={k.color} strokeWidth="2" />}
            {k.mark === 'dash' && <line x1="0" x2="20" y1="0" y2="0" stroke={k.color} strokeWidth="2" strokeDasharray="5 4" />}
            {k.mark === 'dot' && <circle cx="10" cy="0" r="5" fill={k.color} />}
            {k.mark === 'line-dot' && <><line x1="0" x2="20" y1="0" y2="0" stroke={k.color} strokeWidth="2" /><circle cx="10" cy="0" r="4.5" fill={k.color} stroke={C.surface} strokeWidth="2" /></>}
            {k.mark === 'square' && <rect x="5" y="-5" width="10" height="10" fill="none" stroke={k.color} strokeWidth="2" />}
            <text x="26" y="4" fontSize="12" fill={C.strong}>{k.label}</text>
          </g>
        );
      })}
    </g>
  );
}

// A measured point: bigger than it looks to hover, focusable, ringed in the
// surface colour where it overlaps a line.
function Point({ x, y, lines, onTip }: { x: number; y: number; lines: string[]; onTip: (t: Tip | null) => void }) {
  const show = () => onTip({ x, y, lines });
  return (
    <g data-point tabIndex={0} role="img" aria-label={lines.join(' ')} className="cursor-pointer outline-none"
      onMouseEnter={show} onFocus={show} onBlur={() => onTip(null)}>
      <circle cx={x} cy={y} r="14" fill="transparent" />
      <circle cx={x} cy={y} r="6" fill={C.measured} stroke={C.surface} strokeWidth="2" />
    </g>
  );
}

function TipBox({ tip }: { tip: Tip }) {
  const width = 12 + Math.max(...tip.lines.map((l) => l.length)) * 6.6;
  const height = 10 + tip.lines.length * 17;
  const x = Math.min(Math.max(tip.x + 12, M.left), W - M.right - width);
  const y = tip.y - height - 10 < M.top ? tip.y + 12 : tip.y - height - 10;
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={width} height={height} rx="6" fill="#030712" stroke="rgba(255,255,255,0.15)" />
      {tip.lines.map((l, i) => (
        <text key={i} x={x + 6} y={y + 18 + i * 17} fontSize="12" fill={i === 0 ? C.strong : C.text}>{l}</text>
      ))}
    </g>
  );
}

// ── Part 1: B against the number of turns ────────────────────────────────────

const N_MAX = 3.5;

function CoilChart({ part, onTip }: { part: CoilPart; onTip: (t: Tip | null) => void }) {
  const xOf = (n: number) => M.left + (n / N_MAX) * PLOT_W;
  const top = niceTicks(Math.max(...part.points.flatMap((p) => [p.bMeasured, p.bTheory]), (part.slope ?? 0) * N_MAX) * 1.05);
  const yTop = top[top.length - 1];
  const theoryPerTurn = part.oneCurrent && part.points.length ? part.points[0].bTheory / part.points[0].n : null;
  return (
    <g>
      <Frame xTicks={[0, 1, 2, 3]} xOf={xOf} xTitle="จำนวนรอบของขดลวด (n)" yTicks={top} yTitle="B (mT)" />
      <Legend keys={[
        { label: 'ทฤษฎี', mark: theoryPerTurn === null ? 'square' : 'line', color: C.theory },
        { label: 'วัดจริง', mark: 'dot', color: C.measured },
        ...(part.slope !== null ? [{ label: 'เส้นตรงจากค่าวัด', mark: 'dash' as const, color: C.measured }] : []),
      ]} />
      {theoryPerTurn !== null
        ? <path data-draw d={`M${xOf(0)} ${yOf(0, yTop)} L${xOf(N_MAX)} ${yOf(theoryPerTurn * N_MAX, yTop)}`} stroke={C.theory} strokeWidth="2" fill="none" />
        : part.points.map((p) => (
          <rect key={`t${p.n}`} x={xOf(p.n) - 5} y={yOf(p.bTheory, yTop) - 5} width="10" height="10" fill="none" stroke={C.theory} strokeWidth="2" />
        ))}
      {part.slope !== null && (
        <path data-draw d={`M${xOf(0)} ${yOf(0, yTop)} L${xOf(N_MAX)} ${yOf(part.slope * N_MAX, yTop)}`} stroke={C.measured} strokeWidth="2" strokeDasharray="6 5" fill="none" />
      )}
      {part.points.map((p) => (
        <Point key={p.n} x={xOf(p.n)} y={yOf(p.bMeasured, yTop)} onTip={onTip} lines={[
          `ขดลวด ${p.n} รอบ  I = ${+p.I.toFixed(3)} A`,
          `วัดจริง ${fixed(p.bMeasured, 3)} mT`,
          `ทฤษฎี ${p.bTheory.toFixed(3)} mT`,
        ]} />
      ))}
    </g>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-gray-950/60 px-3 py-2">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm font-semibold text-white">{children}</dd>
    </div>
  );
}

function CoilFacts({ part }: { part: CoilPart }) {
  const I = part.points[0]?.I;
  return (
    <div className="mt-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label="เส้นตรงจากค่าวัด">{part.slope === null ? '—' : `B = ${part.slope.toFixed(4)} n`}</Fact>
        <Fact label="μ₀ จากกราฟ (×10⁻⁶ H/m)">{part.mu0 === null ? '—' : micro(part.mu0)}</Fact>
        <Fact label="μ₀ อ้างอิง (×10⁻⁶ H/m)">{micro(MU0_HANDOUT)}</Fact>
        <Fact label="ความคลาดเคลื่อน">{part.errorPercent === null ? '—' : `${signedFixed(part.errorPercent, 2)} %`}</Fact>
      </dl>
      <p className="mt-2 text-xs text-gray-400">
        μ₀ หาจากความชันของเส้นตรงที่ลากผ่านจุดกำเนิด ตามสมการ B₀ = μ₀nI / 2R โดย R = 13 mm
        {part.oneCurrent && I !== undefined ? ` และ I = ${+I.toFixed(3)} A` : ' แต่ละจุดใช้กระแสที่ตั้งไว้ตอนวัดจุดนั้น'}
        {' '}ความคลาดเคลื่อนเทียบกับค่า μ₀ ในใบแลป
      </p>
      {part.points.length < 3 && (
        <p className="mt-1 text-xs text-gray-500">วัดแล้ว {part.points.length} จาก 3 ขดลวด ค่าที่ได้จะน่าเชื่อถือขึ้นเมื่อวัดครบ</p>
      )}
      {part.unmeasured.length > 0 && (
        <p className="mt-1 text-xs text-gray-500">ขดลวด {part.unmeasured.join(', ')} รอบ ไม่มีค่าเพราะเซนเซอร์ไม่ส่งค่าตอนวัด จึงไม่อยู่ในกราฟ</p>
      )}
    </div>
  );
}

// ── Part 2: B along the solenoid's axis ──────────────────────────────────────

const Z_TICKS = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10];

function SolenoidChart({ part, onTip }: { part: SolenoidPart; onTip: (t: Tip | null) => void }) {
  const xOf = (z: number) => M.left + ((z - Z_MIN_CM) / (Z_MAX_CM - Z_MIN_CM)) * PLOT_W;
  const top = niceTicks(Math.max(...part.points.map((p) => p.bMeasured), ...part.curve.map((c) => c.b)) * 1.05);
  const yTop = top[top.length - 1];
  const curve = part.curve.map((c, i) => `${i ? 'L' : 'M'}${xOf(c.zCm).toFixed(1)} ${yOf(c.b, yTop).toFixed(1)}`).join(' ');
  // The measured values joined by a smooth line, as the worksheet's graph is drawn by hand.
  const measuredLine = smoothPath(part.points.map((p) => [xOf(p.zCm), yOf(p.bMeasured, yTop)]));
  return (
    <g>
      <Frame xTicks={Z_TICKS} xOf={xOf} xTitle="ระยะตามแนวแกน Z (cm)" yTicks={top} yTitle="B (mT)" xLabel={(z) => (z > 0 ? `+${z}` : String(z))} />
      <Legend keys={[
        { label: 'ทฤษฎี', mark: 'line', color: C.theory },
        { label: 'วัดจริง', mark: 'line-dot', color: C.measured },
      ]} />
      {[-SOLENOID_END_CM, SOLENOID_END_CM].map((z) => (
        <line key={z} x1={xOf(z)} x2={xOf(z)} y1={M.top + 10} y2={M.top + PLOT_H} stroke={C.end} strokeDasharray="3 4" />
      ))}
      <text x={xOf(SOLENOID_END_CM) + 6} y={M.top + 20} fontSize="11" fill={C.text}>ปลายขดลวด</text>
      {curve && <path data-draw d={curve} stroke={C.theory} strokeWidth="2" fill="none" />}
      {measuredLine && <path data-draw data-measured-line d={measuredLine} stroke={C.measured} strokeWidth="2" fill="none" />}
      {part.points.map((p) => (
        <Point key={p.zCm} x={xOf(p.zCm)} y={yOf(p.bMeasured, yTop)} onTip={onTip} lines={[
          `Z = ${p.zCm > 0 ? '+' : ''}${p.zCm} cm`,
          `วัดจริง ${fixed(p.bMeasured, 3)} mT`,
          `ทฤษฎี ${p.bTheory.toFixed(3)} mT`,
        ]} />
      ))}
    </g>
  );
}

function SolenoidFacts({ part }: { part: SolenoidPart }) {
  const middle = part.points.find((p) => p.zCm === 0);
  return (
    <div className="mt-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label="ตำแหน่งที่วัดแล้ว">{part.points.length} จาก 21</Fact>
        <Fact label="กระแส (I)">{part.I === null ? '—' : `${+part.I.toFixed(3)} A`}</Fact>
        <Fact label="B ที่กึ่งกลาง วัดจริง">{middle ? `${fixed(middle.bMeasured, 3)} mT` : '—'}</Fact>
        <Fact label="B ที่กึ่งกลาง ทฤษฎี">{middle ? `${middle.bTheory.toFixed(3)} mT` : '—'}</Fact>
      </dl>
      <p className="mt-2 text-xs text-gray-400">
        เส้นทฤษฎีจากสมการ B_Z ในใบแลป ของโซลีนอยด์ 100 รอบ ยาว 80 mm รัศมี 21 mm เส้นสีฟ้าลากผ่านค่าที่วัดได้ทุกจุด เส้นประคือปลายขดลวดที่ ±{SOLENOID_END_CM} cm
      </p>
      {part.mixedCurrents && (
        <p className="mt-1 text-xs text-gray-500">บางจุดวัดที่กระแสต่างกัน เส้นทฤษฎีวาดตามกระแสของจุดที่วัดล่าสุด</p>
      )}
      {part.unmeasured.length > 0 && (
        <p className="mt-1 text-xs text-gray-500">
          ตำแหน่ง {part.unmeasured.map((z) => (z > 0 ? `+${z}` : z)).join(', ')} cm ไม่มีค่าเพราะเซนเซอร์ไม่ส่งค่าตอนวัด จึงไม่อยู่ในกราฟ
        </p>
      )}
    </div>
  );
}

// ── Saving as a PNG ──────────────────────────────────────────────────────────

const SCALE = 3;

/** Draws the graph as it is shown onto a canvas, three times as fine, and hands it over as a file. */
async function savePng(svg: SVGSVGElement, tab: Tab) {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  // What the entrance left on the marks is not part of the graph.
  copy.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(W));
  copy.setAttribute('height', String(H));
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy));

  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = tab === 'coil' ? 'lab8_part1_B_vs_n.png' : 'lab8_part2_B_vs_z.png';
    link.click();
    URL.revokeObjectURL(link.href);
  }, 'image/png');
}
