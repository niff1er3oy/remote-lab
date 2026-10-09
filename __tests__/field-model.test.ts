import { COIL_LEVEL_STRIDE, COIL_MODEL, SOLENOID_MODEL, type FieldModel, type ModelLine } from '@/lib/field-model';
import { SOLENOID, calcBSolenoid } from '@/lib/physics';

// The data is generated (scripts/field-model.mjs), so these tests check what
// any correct drawing of the two fields must satisfy, not the coordinates.

type Triple = [z: number, rho: number, b: number];
type Vec = [number, number];

// Stored values are rounded to 3 decimals.
const ROUND = 0.0005;

function triples(line: ModelLine): Triple[] {
  const out: Triple[] = [];
  for (let i = 0; i < line.points.length; i += 3) out.push([line.points[i], line.points[i + 1], line.points[i + 2]]);
  return out;
}

function segments(line: ModelLine): [Triple, Triple][] {
  const pts = triples(line);
  const out: [Triple, Triple][] = [];
  for (let i = 1; i < pts.length; i++) out.push([pts[i - 1], pts[i]]);
  if (line.closed) out.push([pts[pts.length - 1], pts[0]]);
  return out;
}

const length = ([a, b]: [Triple, Triple]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function cross(a: Triple, b: Triple, c: Triple) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function intersect([a, b]: [Triple, Triple], [c, d]: [Triple, Triple]) {
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}

/** The line's points on the mid-plane, as indices into triples(line). */
const midPlane = (line: ModelLine) => triples(line).flatMap(([z], i) => (z === 0 ? [i] : []));

/** b where the line crosses the mid-plane inside the winding. */
function bAtRho0(line: ModelLine) {
  const hit = triples(line).find(([z, rho]) => z === 0 && rho === line.rho0);
  if (!hit) throw new Error(`level ${line.level} has no point at (0, rho0)`);
  return hit[2];
}

// An independent Biot-Savart field: the wire cut into short straight pieces,
// dB = I dl x r / r^3 summed over them. Nothing here is shared with the
// generator, which uses elliptic integrals and a continuous sheet of current.
// Returns [B_rho, B_z] at (rho, z) in arbitrary units.
function wireField(loops: { a: number; z: number }[], pieces: number) {
  const cos = Array.from({ length: pieces + 1 }, (_, i) => Math.cos((2 * Math.PI * i) / pieces));
  const sin = Array.from({ length: pieces + 1 }, (_, i) => Math.sin((2 * Math.PI * i) / pieces));
  return (rho: number, z: number): Vec => {
    let bRho = 0;
    let bZ = 0;
    for (const loop of loops) {
      const rz = z - loop.z;
      for (let i = 0; i < pieces; i++) {
        // The current runs counterclockwise seen from +z. The field point is
        // at (rho, 0, z), so its x component is B_rho.
        const dx = loop.a * (cos[i + 1] - cos[i]);
        const dy = loop.a * (sin[i + 1] - sin[i]);
        const rx = rho - (loop.a * (cos[i + 1] + cos[i])) / 2;
        const ry = -(loop.a * (sin[i + 1] + sin[i])) / 2;
        const r3 = Math.hypot(rx, ry, rz) ** 3;
        bRho += (dy * rz) / r3;
        bZ += (dx * ry - dy * rx) / r3;
      }
    }
    return [bRho, bZ];
  };
}

const COIL_R = 1.3;
const SOLENOID_R = SOLENOID.R * 100;
const SOLENOID_HALF = (SOLENOID.L * 100) / 2;

const MODELS: {
  name: string;
  model: FieldModel;
  frame: { z: number; rho: number };
  wire: (rho: number, z: number) => Vec;
  /** B on the axis at z cm, as a fraction of its value at the centre, from the closed forms taught in the lab. */
  axis: (z: number) => number;
}[] = [
  {
    name: 'single coil',
    model: COIL_MODEL,
    frame: { z: 6.5, rho: 4.5 },
    wire: wireField([{ a: COIL_R, z: 0 }], 720),
    axis: z => (1 + (z * z) / (COIL_R * COIL_R)) ** -1.5,
  },
  {
    name: 'solenoid',
    model: SOLENOID_MODEL,
    frame: { z: 14, rho: 8 },
    // The rig's real winding: 100 separate turns, evenly spaced along 8 cm.
    wire: wireField(
      Array.from({ length: SOLENOID.N }, (_, i) => ({ a: SOLENOID_R, z: -SOLENOID_HALF + ((i + 0.5) * 2 * SOLENOID_HALF) / SOLENOID.N })),
      240,
    ),
    axis: z => {
      const at = (cm: number) => calcBSolenoid(SOLENOID.N, SOLENOID.I, SOLENOID.L, SOLENOID.R, cm / 100);
      return at(z) / at(0);
    },
  },
];

describe('field model data', () => {
  it('uses the dimensions of the rig', () => {
    expect(COIL_MODEL.radius).toBe(COIL_R);
    expect(COIL_MODEL.halfLength).toBe(0);
    expect(SOLENOID_MODEL.radius).toBeCloseTo(SOLENOID_R, 9);
    expect(SOLENOID_MODEL.halfLength).toBeCloseTo(SOLENOID_HALF, 9);
  });

  it('gives the coil 4, 8 and 12 lines for 1, 2 and 3 turns, and the solenoid 6', () => {
    expect(COIL_LEVEL_STRIDE).toEqual({ 1: 6, 2: 3, 3: 2 });
    const shown = (n: 1 | 2 | 3) => COIL_MODEL.lines.filter(l => l.level > 0 && l.level % COIL_LEVEL_STRIDE[n] === 0);
    expect(shown(1)).toHaveLength(4);
    expect(shown(2)).toHaveLength(8);
    expect(shown(3)).toHaveLength(12);
    // Every line in the file is used by at least one of the three drawings.
    const used = new Set(([1, 2, 3] as const).flatMap(n => shown(n).map(l => l.level)));
    expect(COIL_MODEL.lines.filter(l => l.level > 0).map(l => l.level)).toEqual([...used].sort((a, b) => a - b));
    // More turns add lines between the ones already there; none is dropped.
    for (const line of shown(1)) expect(shown(2)).toContain(line);
    for (const line of shown(1)) expect(shown(3)).toContain(line);
    expect(SOLENOID_MODEL.lines.filter(l => l.level > 0).map(l => l.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  describe.each(MODELS)('$name', ({ model, frame, wire, axis }) => {
    const { lines, radius, halfLength } = model;
    const offAxis = lines.filter(l => l.level > 0);
    /** Distance from the winding, cm: from the wire of the coil, from the cylinder of the solenoid. */
    const fromWinding = (z: number, rho: number) => Math.hypot(Math.max(Math.abs(z) - halfLength, 0), rho - radius);

    it('is traced in the agreed frame', () => {
      expect(model.frame).toEqual(frame);
    });

    it('lists the axis first, then the lines outward by level, all inside the winding', () => {
      expect(lines[0]).toMatchObject({ level: 0, rho0: 0, closed: false });
      for (let i = 1; i < lines.length; i++) {
        expect(Number.isInteger(lines[i].level)).toBe(true);
        expect(lines[i].level).toBeGreaterThan(lines[i - 1].level);
        expect(lines[i].rho0).toBeGreaterThan(lines[i - 1].rho0);
        expect(lines[i].rho0).toBeLessThan(radius);
      }
    });

    it('stores finite triples inside the frame, with b positive', () => {
      for (const line of lines) {
        expect(line.points.length % 3).toBe(0);
        expect(line.points.every(Number.isFinite)).toBe(true);
        for (const [z, rho, b] of triples(line)) {
          expect(Math.abs(z)).toBeLessThanOrEqual(frame.z + ROUND);
          expect(rho).toBeGreaterThanOrEqual(0);
          expect(rho).toBeLessThanOrEqual(frame.rho + ROUND);
          expect(b).toBeGreaterThan(0);
        }
      }
    });

    it('samples every line finely enough to shade it, in about 90 points at most', () => {
      for (const line of lines) {
        expect(triples(line).length).toBeGreaterThan(8);
        expect(triples(line).length).toBeLessThanOrEqual(92);
        for (const segment of segments(line)) {
          expect(length(segment)).toBeGreaterThan(0);
          expect(length(segment)).toBeLessThanOrEqual(0.6);
        }
      }
    });

    it('is the same on both sides of the mid-plane', () => {
      for (const line of lines) {
        const present = new Set(triples(line).map(p => p.join(',')));
        for (const [z, rho, b] of triples(line)) expect(present.has([z === 0 ? 0 : -z, rho, b].join(','))).toBe(true);
      }
    });

    it('runs the axis straight from one end of the frame to the other', () => {
      const pts = triples(lines[0]);
      expect(pts[0][0]).toBe(-frame.z);
      expect(pts[pts.length - 1][0]).toBe(frame.z);
      for (let i = 0; i < pts.length; i++) {
        expect(pts[i][1]).toBe(0);
        if (i > 0) expect(pts[i][0]).toBeGreaterThan(pts[i - 1][0]);
      }
    });

    it('follows the closed form of the lab on the axis', () => {
      const pts = triples(lines[0]);
      expect(pts.find(([z]) => z === 0)?.[2]).toBe(1);
      for (const [z, , b] of pts) expect(Math.abs(b - axis(z))).toBeLessThanOrEqual(ROUND + 1e-9);
    });

    it('crosses the mid-plane at rho0 running toward +z', () => {
      for (const line of offAxis) {
        const pts = triples(line);
        const at = pts.findIndex(([z, rho]) => z === 0 && rho === line.rho0);
        expect(at).toBeGreaterThanOrEqual(0);
        // A closed line starts there; an open one passes through it half way.
        if (line.closed) expect(at).toBe(0);
        expect(pts[at + 1][0]).toBeGreaterThan(0);
        expect(pts[(at - 1 + pts.length) % pts.length][0]).toBeLessThan(0);
      }
    });

    it('brings every closed line back through the mid-plane outside the winding, running toward -z', () => {
      const closed = offAxis.filter(l => l.closed);
      expect(closed.length).toBeGreaterThan(0);
      for (const line of closed) {
        const pts = triples(line);
        const onMidPlane = midPlane(line);
        expect(onMidPlane).toHaveLength(2);
        const back = onMidPlane[1];
        expect(pts[back][1]).toBeGreaterThan(radius);
        expect(pts[back][1]).toBeLessThan(frame.rho);
        expect(pts[back - 1][0]).toBeGreaterThan(0);
        expect(pts[back + 1][0]).toBeLessThan(0);
        // Once round: the last point is not the first again.
        expect(pts[pts.length - 1].slice(0, 2)).not.toEqual(pts[0].slice(0, 2));
      }
    });

    it('runs every open line from one edge of the frame to another', () => {
      const open = offAxis.filter(l => !l.closed);
      expect(open.length).toBeGreaterThan(0);
      const onEdge = ([z, rho]: Triple) => Math.abs(Math.abs(z) - frame.z) <= ROUND || Math.abs(rho - frame.rho) <= ROUND;
      for (const line of open) {
        const pts = triples(line);
        expect(midPlane(line)).toHaveLength(1);
        expect(pts[0][0]).toBeLessThan(0);
        expect(pts[pts.length - 1][0]).toBeGreaterThan(0);
        expect(pts.map(onEdge).flatMap((edge, i) => (edge ? [i] : []))).toEqual([0, pts.length - 1]);
      }
    });

    it('nests the lines: one nearer the wire inside also returns nearer the wire', () => {
      // An open line counts as returning beyond the frame.
      const back = offAxis.map(line => (line.closed ? triples(line)[midPlane(line)[1]][1] : Infinity));
      for (let i = 1; i < back.length; i++) expect(back[i]).toBeLessThanOrEqual(back[i - 1]);
      for (let i = 1; i < back.length; i++) if (Number.isFinite(back[i])) expect(back[i]).toBeLessThan(back[i - 1]);
    });

    it('never lets two field lines cross, or one cross itself', () => {
      const all = lines.map(segments);
      for (let a = 0; a < lines.length; a++) {
        for (let b = a; b < lines.length; b++) {
          const crossing = all[a].some((s, i) => all[b].some((t, j) => (a !== b || j > i + 1) && intersect(s, t)));
          expect({ levels: [lines[a].level, lines[b].level], crossing }).toEqual({ levels: [lines[a].level, lines[b].level], crossing: false });
        }
      }
    });

    // Lines are placed at equal steps of g(rho) = (1 / B0) x integral of B_z
    // along the mid-plane, so between neighbours the integral of b d(rho) is
    // one step per level. (gap) x (mean b of the two) is the trapezium estimate
    // of that integral. Its error is about gap^2 b'' / 12b: largest for the
    // coil's outermost pairs, where b climbs steeply toward the wire, and
    // there it is under 1 %. The rounding of rho0 adds up to 0.001 cm in a gap
    // of 0.05 cm, another 2 %. Hence 3 %.
    it('spaces the lines on the mid-plane in inverse proportion to the field there', () => {
      const perLevel = lines.slice(1).map((line, i) => {
        const inner = lines[i];
        return ((line.rho0 - inner.rho0) * (bAtRho0(line) + bAtRho0(inner))) / 2 / (line.level - inner.level);
      });
      const mean = perLevel.reduce((sum, value) => sum + value, 0) / perLevel.length;
      for (const value of perLevel) expect(Math.abs(value / mean - 1)).toBeLessThan(0.03);
    });

    describe('against Biot-Savart summed over short pieces of the wire', () => {
      const b0 = wire(0, 0)[1];
      // Closer than this the model and the wire are not the same thing: the
      // solenoid's 100 separate turns against a smooth sheet, and the sharp
      // corner a line has where it passes through that sheet.
      const CLEAR = 0.3;
      // A chord shorter than this has its direction blurred by the rounding of
      // its ends: 0.0014 cm sideways in 0.1 cm is 0.8 degrees. Where a line
      // bends tightly its points are closer than that, so a chord may skip
      // some of them.
      const MIN_CHORD = 0.1;

      /** From each point, the chord to the first later point at least MIN_CHORD away. */
      function chords(line: ModelLine): [Triple, Triple][] {
        const pts = triples(line);
        if (line.closed) pts.push(pts[0]);
        const out: [Triple, Triple][] = [];
        for (let i = 0; i < pts.length; i++) {
          const end = pts.slice(i + 1).find(q => length([pts[i], q]) >= MIN_CHORD);
          if (end) out.push([pts[i], end]);
        }
        return out;
      }
      const PER_LINE = 10;

      function sample<T>(items: T[]): T[] {
        if (items.length <= PER_LINE) return items;
        return Array.from({ length: PER_LINE }, (_, i) => items[Math.floor(((i + 0.5) * items.length) / PER_LINE)]);
      }

      it('points along the field with the current counterclockwise seen from +z', () => {
        expect(b0).toBeGreaterThan(0);
        for (const [z] of sample(triples(lines[0]))) {
          const [bRho, bZ] = wire(0, z);
          expect(bZ).toBeGreaterThan(0);
          expect(Math.abs(bRho / bZ)).toBeLessThan(1e-9);
        }
      });

      it('runs every line along that field, within 2 degrees', () => {
        for (const line of offAxis) {
          const usable = chords(line).filter(([p, q]) => fromWinding((p[0] + q[0]) / 2, (p[1] + q[1]) / 2) >= CLEAR);
          expect(usable.length).toBeGreaterThanOrEqual(PER_LINE);
          for (const [p, q] of sample(usable)) {
            // The field half way along a chord is parallel to the chord, to
            // second order in its length.
            const [bRho, bZ] = wire((p[1] + q[1]) / 2, (p[0] + q[0]) / 2);
            const along = Math.atan2(q[1] - p[1], q[0] - p[0]);
            const field = Math.atan2(bRho, bZ);
            const degrees = (Math.abs(Math.atan2(Math.sin(along - field), Math.cos(along - field))) * 180) / Math.PI;
            expect({ level: line.level, at: p, degrees: degrees < 2 ? 'under 2' : degrees }).toEqual({ level: line.level, at: p, degrees: 'under 2' });
          }
        }
      });

      it('stores that field strength as b, within 2 %', () => {
        for (const line of lines) {
          const usable = triples(line).filter(([z, rho]) => fromWinding(z, rho) >= CLEAR);
          expect(usable.length).toBeGreaterThanOrEqual(PER_LINE);
          for (const [z, rho, b] of sample(usable)) {
            const expected = Math.hypot(...wire(rho, z)) / b0;
            // b is stored to 3 decimals, which is all there is of it far from
            // the winding, so the rounding is allowed for on top of the 2 %.
            const off = Math.abs(b - expected) - ROUND;
            expect({ level: line.level, at: [z, rho], off: off <= 0.02 * expected ? 'within 2 %' : off / expected }).toEqual({ level: line.level, at: [z, rho], off: 'within 2 %' });
          }
        }
      });
    });
  });

  describe('shape of the solenoid field', () => {
    it('runs parallel to the axis through the middle half of the winding', () => {
      for (const line of SOLENOID_MODEL.lines) {
        const middle = triples(line).filter(([z, rho]) => Math.abs(z) <= SOLENOID_MODEL.halfLength / 2 && rho < SOLENOID_MODEL.radius);
        expect(middle.length).toBeGreaterThan(2);
        // This solenoid is under twice as long as it is wide, so its lines
        // already bow a little by a quarter of the way out: up to 0.05 cm.
        for (const [, rho] of middle) expect(Math.abs(rho - line.rho0)).toBeLessThanOrEqual(0.05);
      }
    });

    it('is nearly uniform across the middle: within 5 % of the centre field at every rho0', () => {
      for (const line of SOLENOID_MODEL.lines) expect(Math.abs(bAtRho0(line) - 1)).toBeLessThan(0.05);
    });

    it('drops by the full sheet current where a line passes out through the winding', () => {
      // Ampere's law across a sheet of N/L turns per metre: the field along it
      // steps by mu0 (N/L) I, which is B0 / cos(alpha) of the centre field
      // B0 = mu0 (N/L) I cos(alpha), cos(alpha) = (L/2) / sqrt(R^2 + (L/2)^2).
      // Across the sheet the line's own b therefore changes by at most that,
      // and by a good part of it.
      const step = Math.hypot(SOLENOID_R, SOLENOID_HALF) / SOLENOID_HALF;
      const through = SOLENOID_MODEL.lines.filter(l => l.closed);
      expect(through.length).toBeGreaterThan(0);
      for (const line of through) {
        const pts = triples(line);
        const at = pts.findIndex(([z, rho]) => z > 0 && rho === SOLENOID_MODEL.radius);
        expect(at).toBeGreaterThan(0);
        const drop = pts[at - 1][2] - pts[at + 1][2];
        expect(drop).toBeGreaterThan(0.2 * step);
        expect(drop).toBeLessThan(step);
      }
    });
  });

  describe('shape of the coil field', () => {
    it('is closest to the axis in the plane of the coil for the lines that leave the frame', () => {
      for (const line of COIL_MODEL.lines.filter(l => !l.closed)) {
        for (const [, rho] of triples(line)) expect(rho).toBeGreaterThanOrEqual(line.rho0);
      }
    });

    it('grows stronger from the axis toward the wire in the plane of the coil', () => {
      const b = COIL_MODEL.lines.map(bAtRho0);
      for (let i = 1; i < b.length; i++) expect(b[i]).toBeGreaterThan(b[i - 1]);
    });
  });
});
