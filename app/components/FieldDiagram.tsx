import { COIL_FIELD, FIELD_VIEW, SOLENOID_FIELD } from '@/lib/field-lines';

// To-scale drawings of the two fields the lab measures, seen in the plane
// through the axis. The lines come from lib/field-lines.ts; this file adds the
// windings, the direction arrows and the probe.
//
// The class names field-line, field-mark, field-probe and field-ring are hooks
// for the landing page's reveal animation. Without it the drawing is complete
// as rendered.

const GREEN = '#c8ff00';
const CYAN = '#22d3ee';
const CX = FIELD_VIEW.w / 2;
const CY = FIELD_VIEW.h / 2;
const TURNS = 75;

const DIAGRAMS = {
  coil: {
    field: COIL_FIELD,
    label: 'เส้นสนามแม่เหล็กของขดลวดเดี่ยว พุ่งผ่านกลางขดลวดแล้ววนกลับรอบเส้นลวด',
    probe: 'วัดที่กึ่งกลางขดลวด',
    barCm: 1,
    axisArrows: [-150, -75, 75, 150],
  },
  solenoid: {
    field: SOLENOID_FIELD,
    label: 'เส้นสนามแม่เหล็กของโซลีนอยด์ ขนานและหนาแน่นภายในขด แล้วบานออกที่ปลายทั้งสองข้าง',
    probe: 'หัววัดเลื่อนไปตามแนวแกน',
    barCm: 5,
    axisArrows: [-215, -85, 85, 215],
  },
};

function Arrow({ x, y, dir = 1 }: { x: number; y: number; dir?: 1 | -1 }) {
  return (
    <path
      className="field-mark"
      d="M-4.5 -3.4L4 0L-4.5 3.4Z"
      transform={`translate(${x} ${y}) scale(${dir} 1)`}
      fill={GREEN}
    />
  );
}

// A wire seen end-on: a dot when the current comes toward the viewer, a cross
// when it goes away.
function WireEnd({ y, toward }: { y: number; toward: boolean }) {
  return (
    <g className="field-mark" transform={`translate(0 ${y})`}>
      <circle r="6" fill="#030712" stroke="rgba(255,255,255,0.8)" strokeWidth="1.25" />
      {toward
        ? <circle r="1.7" fill="white" />
        : <path d="M-2.8 -2.8L2.8 2.8M2.8 -2.8L-2.8 2.8" stroke="white" strokeWidth="1.25" />}
    </g>
  );
}

export default function FieldDiagram({ kind }: { kind: 'coil' | 'solenoid' }) {
  const { field, label, probe, barCm, axisArrows } = DIAGRAMS[kind];

  return (
    <figure className="@container" data-kind={kind}>
      <div
        className="overflow-hidden rounded-2xl border border-white/10 bg-gray-900/50"
        style={{ backgroundImage: 'radial-gradient(ellipse at center, rgba(29,64,245,0.32) 0%, rgba(7,16,138,0.14) 48%, transparent 80%)' }}
      >
        <svg viewBox={`0 0 ${FIELD_VIEW.w} ${FIELD_VIEW.h}`} className="block w-full" role="img" aria-label={label}>
          <g transform={`translate(${CX} ${CY})`}>
            {/* The axis is a field line too. */}
            <path className="field-line" d={`M${-CX} 0L${CX} 0`} fill="none" stroke={GREEN} strokeOpacity="0.6" strokeWidth="1.25" />
            {[1, -1].map(side => (
              <g key={side} transform={`scale(1 ${side})`}>
                {field.lines.map(line => (
                  <path
                    key={line.inner}
                    className="field-line"
                    d={line.d}
                    fill="none"
                    stroke={GREEN}
                    strokeOpacity="0.6"
                    strokeWidth="1.25"
                    strokeLinejoin="round"
                  />
                ))}
                {/* Outside the winding the field comes back the other way. */}
                {field.lines.map(line => line.outer !== null && (
                  <Arrow key={line.inner} x={0} y={-line.outer} dir={-1} />
                ))}
              </g>
            ))}
            {axisArrows.map(x => <Arrow key={x} x={x} y={0} />)}

            {kind === 'coil' ? (
              <>
                {/* The ring itself, seen almost edge-on. */}
                <ellipse className="field-mark" rx="9" ry={field.radius} fill="none" stroke="rgba(255,255,255,0.3)" strokeDasharray="3 4" />
                <WireEnd y={-field.radius} toward />
                <WireEnd y={field.radius} toward={false} />
              </>
            ) : (
              <g className="field-mark" fill="rgba(255,255,255,0.65)">
                {[-1, 1].map(side =>
                  Array.from({ length: TURNS }, (_, i) => (
                    <circle
                      key={`${side}:${i}`}
                      cx={(-SOLENOID_FIELD.halfLength + (i * 2 * SOLENOID_FIELD.halfLength) / (TURNS - 1)).toFixed(1)}
                      cy={side * SOLENOID_FIELD.radius}
                      r="1.5"
                    />
                  )),
                )}
              </g>
            )}

            <circle className="field-ring" r="4.5" fill="none" stroke={CYAN} strokeWidth="1.25" opacity="0" />
            <circle className="field-probe field-mark" r="4.5" fill={CYAN} stroke="#030712" strokeWidth="1.5" />
          </g>
        </svg>
      </div>

      <figcaption className="mt-2.5 flex items-center justify-between gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-400" />
          {probe}
        </span>
        {/* The bar is sized against the drawing above, so it stays true to scale. */}
        <span className="flex shrink-0 items-center gap-2">
          <span
            className="h-1.5 border-x border-b border-white/40"
            style={{ width: `${((barCm * field.pxPerCm) / FIELD_VIEW.w) * 100}cqw` }}
          />
          {barCm} ซม.
        </span>
      </figcaption>
    </figure>
  );
}
