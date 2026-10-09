'use client';
import dynamic from 'next/dynamic';
import { memo, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { animate, utils } from 'animejs';
import {
  arrowLength, arrowParts, axisField, isMarked, linesFor, midPlaneMarks, modelFor, samples, shadedRuns, shadeOf, SHADES, strongest, VIEW, visibleExtent,
  type Extent, type FieldKind, type Mark,
} from '@/lib/field-geometry';
import { prefersReducedMotion } from '@/lib/motion';

// The lab room's model of the field being measured, as a section through the
// axis (2D) or turned about it (3D). Both draw the same lines, the exact ones
// of lib/field-model.ts: to scale, crowding across the mid-plane where the
// field is strong, and brighter where the field is stronger. The probe carries
// two arrows, the field there from theory and from the sensor. On the axis the
// field lies along the axis, which is where theory's arrow points; the sensor
// reports a size and no direction, and its arrow is that size drawn the same
// way, for the two to be compared by length.

export type FieldViewProps = {
  kind: FieldKind;
  /** Turns of the single coil (1, 2 or 3). Not used for the solenoid. */
  turns: number;
  /** Where the probe is along the axis, in cm from the middle of the winding. */
  zCm: number;
  /** The field at the probe from theory and from the sensor, mT. */
  bTheory: number;
  bMeasured: number;
  /** The theory field at the middle of the winding, mT: the arrows are drawn against it. */
  bPeak: number;
};

// three.js is only fetched when the 3D view is first asked for.
const FieldView3D = dynamic(() => import('./FieldView3D'), {
  ssr: false,
  loading: () => <p role="status" className="flex h-full items-center justify-center text-sm text-gray-500">กำลังโหลดมุมมอง 3D</p>,
});

const GREEN = '#c8ff00';
const CYAN = '#22d3ee';

// ── Which view ────────────────────────────────────────────────────────────────

type Mode = '2d' | '3d';
const MODE_KEY = 'lab-field-view';

// The lab room keeps two layouts mounted, each with its own copy of this
// panel, so the choice lives outside any one of them; it is also remembered
// for the next visit.
let chosen: Mode | null = null;
const watchers = new Set<() => void>();
function currentMode(): Mode {
  if (chosen === null) {
    try { chosen = window.localStorage.getItem(MODE_KEY) === '3d' ? '3d' : '2d'; } catch { chosen = '2d'; }
  }
  return chosen;
}
function chooseMode(mode: Mode) {
  chosen = mode;
  try { window.localStorage.setItem(MODE_KEY, mode); } catch { /* private browsing: the choice lasts for this visit */ }
  watchers.forEach(tell => tell());
}
const watchMode = (tell: () => void) => { watchers.add(tell); return () => { watchers.delete(tell); }; };
const serverMode = (): Mode => '2d';

/** Forgets the chosen view; for tests. */
export function resetFieldViewMode(): void {
  chosen = null;
}

// ── The section ───────────────────────────────────────────────────────────────

// A line is drawn in stretches of one shade, and over each stretch runs a row
// of dashes that show which way the field points. Where a dash passes, its
// line is about a third brighter, whatever the shade: enough to see it move,
// not enough to make a weak line pass for a strong one. Arrowheads are as
// bright as a dash on their line.
const LINE_OPACITY = (shade: number) => 0.14 + 0.54 * ((shade + 0.5) / SHADES);
const DASH_LIFT = 0.35;
const HEAD_OPACITY = (shade: number) => (1 + DASH_LIFT) * LINE_OPACITY(shade);
// Drawn over the line, so this much of its own gives the lift above.
const DASH_OPACITY = (shade: number) => (DASH_LIFT * LINE_OPACITY(shade)) / (1 - LINE_OPACITY(shade));
const DASH = 3; // px
const DASH_PERIOD = 16; // px, dash and gap together

type Stretch = { d: string; shade: number; start: number };
type DrawnLine = { level: number; stretches: Stretch[]; marks: Array<Mark & { shade: number }> };

// The page's y runs downward, so a point above the axis has a negative y.
const at = (p: { z: number; rho: number }) => `${p.z} ${p.rho === 0 ? 0 : -p.rho}`;

function drawingOf(kind: FieldKind, turns: number): { axis: DrawnLine; lines: DrawnLine[] } {
  const top = strongest(kind);
  const [axis, ...lines] = linesFor(kind, turns).map(line => {
    const pts = samples(line);
    return {
      level: line.level,
      stretches: shadedRuns(pts, line.closed, top).map(run => ({
        d: run.pts.map((p, i) => `${i ? 'L' : 'M'}${at(p)}`).join(''),
        shade: run.shade,
        start: run.start,
      })),
      marks: isMarked(kind, line.level) ? midPlaneMarks(pts, line.closed).map(mark => ({ ...mark, shade: shadeOf(mark.b, top) })) : [],
    };
  });
  return { axis, lines };
}

// Arrowheads are a fixed size on screen, down to a little over half of it in
// a drawing so small that they would touch: one at this many px to the cm.
const FULL_HEADS: Record<FieldKind, number> = { coil: 48, solenoid: 20 };
const headSize = (kind: FieldKind, u: number) => u * Math.min(1, Math.max(0.55, 1 / u / FULL_HEADS[kind]));

/** An arrowhead `size` cm to its own unit, pointing along `angle` in the (z, rho) plane. */
function Head({ mark, size }: { mark: Mark & { shade: number }; size: number }) {
  return (
    <path
      className="field-head"
      d="M-4.6 -3.3L4 0L-4.6 3.3Z"
      transform={`translate(${at(mark)}) rotate(${(-mark.angle * 180) / Math.PI}) scale(${size})`}
      fill={GREEN}
      fillOpacity={HEAD_OPACITY(mark.shade)}
    />
  );
}

function FieldLine({ line, u, head }: { line: DrawnLine; u: number; head: number }) {
  return (
    <g data-level={line.level} className="field-line">
      {line.stretches.map((s, i) => (
        <path
          key={`l${i}`} d={s.d} fill="none" stroke={GREEN} strokeOpacity={LINE_OPACITY(s.shade)}
          strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        />
      ))}
      {line.stretches.map((s, i) => (
        // The dashes of one stretch pick up where the last one's left off.
        <path
          key={`d${i}`} className="field-flow" d={s.d} fill="none" stroke={GREEN} strokeOpacity={DASH_OPACITY(s.shade)}
          strokeWidth="1.75" strokeLinecap="round" vectorEffect="non-scaling-stroke"
          strokeDasharray={`${DASH} ${DASH_PERIOD - DASH}`} strokeDashoffset={((s.start / u) % DASH_PERIOD).toFixed(2)}
        />
      ))}
      {line.marks.map((mark, i) => <Head key={`m${i}`} mark={mark} size={head} />)}
    </g>
  );
}

/** A wire seen end-on: a dot when its current comes toward the viewer, a cross when it goes away. */
function WireEnd({ x, y, toward, u }: { x: number; y: number; toward: boolean; u: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${u})`}>
      <circle r="5.5" fill="#030712" stroke="rgba(255,255,255,0.8)" strokeWidth="1.2" />
      {toward
        ? <circle r="1.6" fill="white" />
        : <path d="M-2.6 -2.6L2.6 2.6M2.6 -2.6L-2.6 2.6" stroke="white" strokeWidth="1.2" />}
    </g>
  );
}

// Everything in the section that does not move: redrawn when the instrument or
// the size of the panel changes, not with every reading of the sensor.
const SectionField = memo(function SectionField({ kind, turns, ext, u }: { kind: FieldKind; turns: number; ext: Extent; u: number }) {
  const rootRef = useRef<SVGGElement>(null);
  const halfId = useId();
  const drawing = useMemo(() => drawingOf(kind, turns), [kind, turns]);
  const model = modelFor(kind);
  const { bar } = VIEW[kind];
  const head = headSize(kind, u);

  // The dashes run along the lines, one period in a second and a half.
  useLayoutEffect(() => {
    if (!rootRef.current || prefersReducedMotion()) return;
    const flow = animate(rootRef.current.querySelectorAll('.field-flow'), {
      strokeDashoffset: `-=${DASH_PERIOD}`, duration: 1500, ease: 'linear', loop: true,
    });
    return () => { flow.revert(); };
  }, [drawing, u]);

  return (
    <g ref={rootRef}>
      {/* The half above the axis; the half below is its mirror image. */}
      <g id={halfId}>
        {drawing.lines.map(line => <FieldLine key={line.level} line={line} u={u} head={head} />)}
      </g>
      <use href={`#${halfId}`} transform="scale(1 -1)" />
      <FieldLine line={drawing.axis} u={u} head={head} />
      {[-0.8, -0.42, 0.42, 0.8].map(share => {
        const z = share * ext.z;
        const b = axisField(kind, z);
        return <Head key={share} mark={{ z, rho: 0, angle: 0, b, shade: shadeOf(b, strongest(kind)) }} size={head} />;
      })}

      {kind === 'coil' ? (
        <g className="field-winding">
          {/* The ring itself, seen almost edge-on. */}
          <ellipse rx={0.16} ry={model.radius} fill="none" stroke="rgba(255,255,255,0.28)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          {Array.from({ length: turns }, (_, i) => {
            // The turns lie side by side; the model takes them as one loop.
            const x = (i - (turns - 1) / 2) * 10 * u;
            return (
              <g key={i} data-turn={i + 1}>
                <WireEnd x={x} y={-model.radius} toward u={u} />
                <WireEnd x={x} y={model.radius} toward={false} u={u} />
              </g>
            );
          })}
        </g>
      ) : (
        <g className="field-winding">
          {/* A hundred turns, each a dot: a dash of no length with a round end.
              In a small drawing the dots run together into a band, which is
              the sheet of current the model takes the winding for. */}
          {[-1, 1].map(side => (
            <line
              key={side} x1={-model.halfLength} x2={model.halfLength + 1e-3} y1={side * model.radius} y2={side * model.radius}
              stroke="rgba(255,255,255,0.7)" strokeWidth={3 * u} strokeLinecap="round" strokeDasharray={`0 ${(2 * model.halfLength) / 99}`}
            />
          ))}
          {/* Which way the current runs, marked on the first turn itself. */}
          <WireEnd x={-model.halfLength} y={-model.radius} toward u={u} />
          <WireEnd x={-model.halfLength} y={model.radius} toward={false} u={u} />
          {/* One tick per centimetre of the probe's travel. */}
          {Array.from({ length: 21 }, (_, i) => i - 10).map(z => (
            <line key={z} x1={z} x2={z} y1={-(z % 5 === 0 ? 4 : 2.5) * u} y2={(z % 5 === 0 ? 4 : 2.5) * u} stroke="rgba(255,255,255,0.3)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      )}

      {/* True to scale, so a bar says how big everything is. */}
      <g className="field-scale" transform={`translate(${ext.z - 12 * u - bar} ${ext.rho - 12 * u})`}>
        <path d={`M0 ${-4 * u}V0H${bar}V${-4 * u}`} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <text x={bar / 2} y={-6 * u} textAnchor="middle" fontSize={11 * u} fill="rgba(255,255,255,0.6)">{bar} ซม.</text>
      </g>
    </g>
  );
});

/**
 * An arrow along the axis from the probe: `length` cm long, `y` cm above the
 * axis, pointing back along the axis when `length` is negative. Its head
 * shrinks with it, so a short arrow is still the right length.
 */
function FieldArrow({ length, y, color, u, name }: { length: number; y: number; color: string; u: number; name: string }) {
  const size = Math.abs(length);
  if (!(size > 0)) return null;
  const { shaft, head } = arrowParts(size, 8 * u);
  return (
    <g data-arrow={name} data-length={length.toFixed(3)} transform={length < 0 ? 'scale(-1 1)' : undefined}>
      {shaft > 0 && (
        <line x1={0} x2={shaft} y1={y} y2={y} stroke={color} strokeWidth="2.25" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      )}
      <path d={`M${shaft} ${y - 0.5 * head}L${size} ${y}L${shaft} ${y + 0.5 * head}Z`} fill={color} />
    </g>
  );
}

function FieldView2D({ kind, turns, zCm, bTheory, bMeasured, bPeak }: FieldViewProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<SVGGElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const placed = useRef(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // The drawing fills its box, whatever shape that is. The lab room keeps two
  // layouts mounted and hides one: nothing is drawn while this one has no size.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize(was => (w && h ? (was && was.w === w && was.h === h ? was : { w, h }) : null));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const drawn = size !== null;
  // The probe glides to where it was sent, and a ring spreads from it when it
  // gets there.
  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;
    if (!placed.current || prefersReducedMotion()) {
      placed.current = true;
      utils.set(probe, { translateX: zCm });
      return;
    }
    const glide = animate(probe, {
      translateX: zCm, duration: 650, ease: 'outCubic',
      onComplete: () => { if (ringRef.current) animate(ringRef.current, { scale: [1, 3.4], opacity: [0.8, 0], duration: 700, ease: 'outQuad' }); },
    });
    return () => { glide.pause(); };
  }, [zCm, drawn]);

  const model = modelFor(kind);
  const view = VIEW[kind];
  const ext = size ? visibleExtent(size.w, size.h, view.prefer, view.need, model.frame) : null;
  const u = size && ext ? (2 * ext.z) / size.w : 0; // cm to the pixel
  const what = kind === 'coil' ? `ขดลวดเดี่ยว ${turns} รอบ` : 'โซลีนอยด์';

  return (
    <div ref={boxRef} className="h-full w-full overflow-hidden">
      {size && ext && (
        <svg
          width={size.w} height={size.h} viewBox={`${-ext.z} ${-ext.rho} ${2 * ext.z} ${2 * ext.rho}`}
          className="block" role="img"
          aria-label={`แบบจำลองสนามแม่เหล็กของ${what} ภาพตัดผ่านแกน เส้นสนามพุ่งไปทางขวาตามแนวแกนแล้ววนกลับด้านนอกขดลวด`}
        >
          <SectionField kind={kind} turns={turns} ext={ext} u={u} />
          <g ref={probeRef} className="field-probe" data-z={zCm}>
            <FieldArrow name="theory" length={arrowLength(bTheory, bPeak, view.arrow)} y={-8 * u} color={GREEN} u={u} />
            <FieldArrow name="measured" length={arrowLength(bMeasured, bPeak, view.arrow)} y={8 * u} color={CYAN} u={u} />
            <circle ref={ringRef} r={4.5 * u} fill="none" stroke={CYAN} strokeWidth="1.25" vectorEffect="non-scaling-stroke" opacity="0" />
            <circle r={4.5 * u} fill={CYAN} stroke="#030712" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </g>
        </svg>
      )}
    </div>
  );
}

// ── The panel ─────────────────────────────────────────────────────────────────

const MODES: Mode[] = ['2d', '3d'];
const THUMB = 36; // px, the width of one side of the switch

export function FieldViz(props: FieldViewProps) {
  const mode = useSyncExternalStore(watchMode, currentMode, serverMode);
  const viewRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const shown = useRef<Mode | null>(null);

  // The switch's thumb slides across, and the view that comes in settles into
  // place.
  useLayoutEffect(() => {
    const first = shown.current === null;
    shown.current = mode;
    const x = mode === '3d' ? THUMB : 0;
    if (!thumbRef.current || !viewRef.current) return;
    if (first || prefersReducedMotion()) {
      utils.set(thumbRef.current, { translateX: x });
      return;
    }
    const slide = animate(thumbRef.current, { translateX: x, duration: 300, ease: 'outCubic' });
    const settle = animate(viewRef.current, { opacity: [0, 1], scale: [0.985, 1], duration: 360, ease: 'outCubic' });
    return () => { slide.pause(); settle.pause(); };
  }, [mode]);

  return (
    <div className="relative h-full w-full">
      <div ref={viewRef} className="absolute inset-0" data-view={mode}>
        {mode === '3d' ? <FieldView3D {...props} /> : <FieldView2D {...props} />}
      </div>

      <div role="group" aria-label="มุมมองแบบจำลอง" className="absolute right-2 top-2 flex rounded-lg border border-white/10 bg-gray-950/80 p-0.5 backdrop-blur-sm">
        <span ref={thumbRef} aria-hidden="true" className="absolute left-0.5 top-0.5 h-7 w-9 rounded-md bg-[#c8ff00]" />
        {MODES.map(m => (
          <button
            key={m} type="button" aria-pressed={mode === m} onClick={() => chooseMode(m)}
            className={`relative h-7 w-9 rounded-md text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${mode === m ? 'text-gray-950' : 'text-gray-400 hover:text-white'}`}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      <p className="pointer-events-none absolute bottom-1.5 left-2.5 text-[11px] leading-tight text-gray-500">
        เส้นยิ่งสว่าง สนามยิ่งแรง{mode === '3d' && ' · ลากเพื่อหมุน'}
      </p>
    </div>
  );
}
