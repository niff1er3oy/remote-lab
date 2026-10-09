import { COIL_FIELD, FIELD_VIEW, SOLENOID_FIELD, type FieldLine } from '@/lib/field-lines';

// The data is generated, so these tests check what any correct drawing of the
// two fields must satisfy rather than the coordinates themselves.

type Point = [number, number];

const FIELDS = [
  { name: 'single coil', field: COIL_FIELD },
  { name: 'solenoid', field: SOLENOID_FIELD },
];

// Paths are around the centre of the drawing: x runs from -w/2 to w/2, and the
// upper half has y from -h/2 to 0.
const HALF_W = FIELD_VIEW.w / 2;
const HALF_H = FIELD_VIEW.h / 2;

function points(line: FieldLine): Point[] {
  const numbers = (line.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const out: Point[] = [];
  for (let i = 0; i < numbers.length; i += 2) out.push([numbers[i], numbers[i + 1]]);
  return out;
}

const isClosed = (line: FieldLine) => line.d.endsWith('Z');
const inFrame = ([x, y]: Point) => Math.abs(x) <= HALF_W && y >= -HALF_H && y <= 0;
const key = ([x, y]: Point) => `${x.toFixed(1)},${y.toFixed(1)}`;

function segments(line: FieldLine): [Point, Point][] {
  const pts = points(line);
  const out: [Point, Point][] = [];
  for (let i = 1; i < pts.length; i++) out.push([pts[i - 1], pts[i]]);
  if (isClosed(line)) out.push([pts[pts.length - 1], pts[0]]);
  return out;
}

function cross([ax, ay]: Point, [bx, by]: Point, [cx, cy]: Point) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function intersect([a, b]: [Point, Point], [c, d]: [Point, Point]) {
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}

describe('field-line data', () => {
  it('describes a drawing 520 by 240', () => {
    expect(FIELD_VIEW).toEqual({ w: 520, h: 240 });
  });

  describe.each(FIELDS)('$name', ({ field }) => {
    const lines = field.lines;

    it('has lines, each a well-formed path of at least a few points', () => {
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.d).toMatch(/^M-?\d+(\.\d+)? -?\d+(\.\d+)?(L-?\d+(\.\d+)? -?\d+(\.\d+)?)+Z?$/);
        expect(points(line).length).toBeGreaterThan(8);
      }
    });

    it('fits its winding inside the drawing', () => {
      expect(field.radius).toBeGreaterThan(0);
      expect(field.radius).toBeLessThan(HALF_H);
    });

    it('keeps every line in the upper half, where the component mirrors it', () => {
      for (const line of lines) {
        for (const [, y] of points(line)) expect(y).toBeLessThan(0);
      }
    });

    it('keeps closed loops entirely inside the view box', () => {
      const closed = lines.filter(isClosed);
      expect(closed.length).toBeGreaterThan(0);
      for (const line of closed) expect(points(line).every(inFrame)).toBe(true);
    });

    it('runs every open line off the edge of the view box at both ends, and only there', () => {
      const open = lines.filter(line => !isClosed(line));
      expect(open.length).toBeGreaterThan(0);
      for (const line of open) {
        const inside = points(line).map(inFrame);
        expect(inside[0]).toBe(false);
        expect(inside[inside.length - 1]).toBe(false);
        // Outside, then inside, then outside: it never leaves and comes back.
        const changes = inside.filter((value, i) => i > 0 && value !== inside[i - 1]).length;
        expect(changes).toBe(2);
      }
    });

    it('does not let an open line stray further than a tenth of the drawing past its edge', () => {
      for (const line of lines) {
        for (const [x, y] of points(line)) {
          expect(Math.abs(x)).toBeLessThanOrEqual(HALF_W * 1.1);
          expect(y).toBeGreaterThanOrEqual(-HALF_H * 1.1);
        }
      }
    });

    it('is the same on both sides of the mid-plane', () => {
      for (const line of lines) {
        const pts = points(line);
        const present = new Set(pts.map(key));
        for (const [x, y] of pts) expect(present.has(key([-x, y]))).toBe(true);
      }
    });

    it('closes a line exactly when it comes back through the mid-plane inside the drawing', () => {
      for (const line of lines) expect(isClosed(line)).toBe(line.outer !== null);
    });

    it('passes each line through the mid-plane at its stated inner and outer distances', () => {
      for (const line of lines) {
        const onMidPlane = points(line).filter(([x]) => x === 0).map(([, y]) => -y);
        expect(onMidPlane).toContain(line.inner);
        if (line.outer !== null) expect(onMidPlane).toContain(line.outer);
        expect(onMidPlane).toHaveLength(line.outer === null ? 1 : 2);
      }
    });

    it('threads every line through the winding and brings the closed ones back outside it', () => {
      for (const line of lines) {
        expect(line.inner).toBeGreaterThan(0);
        expect(line.inner).toBeLessThan(field.radius);
        if (line.outer !== null) {
          expect(line.outer).toBeGreaterThan(field.radius);
          expect(line.outer).toBeLessThan(HALF_H);
        }
      }
    });

    it('lists the lines from the axis outward, no two through the same point', () => {
      const inner = lines.map(line => line.inner);
      for (let i = 1; i < inner.length; i++) expect(inner[i]).toBeGreaterThan(inner[i - 1]);
    });

    it('nests the lines: one that starts nearer the wire also returns nearer the wire', () => {
      const outer = lines.map(line => line.outer ?? Infinity);
      for (let i = 1; i < outer.length; i++) expect(outer[i]).toBeLessThanOrEqual(outer[i - 1]);
    });

    it('never lets two field lines cross', () => {
      for (let a = 0; a < lines.length; a++) {
        for (let b = a + 1; b < lines.length; b++) {
          const crossing = segments(lines[a]).some(s => segments(lines[b]).some(t => intersect(s, t)));
          expect({ lines: [lines[a].inner, lines[b].inner], crossing }).toEqual({ lines: [lines[a].inner, lines[b].inner], crossing: false });
        }
      }
    });

    it('never lets a field line cross itself', () => {
      for (const line of lines) {
        const segs = segments(line);
        const crossing = segs.some((s, i) => segs.some((t, j) => j > i + 1 && intersect(s, t)));
        expect({ line: line.inner, crossing }).toEqual({ line: line.inner, crossing: false });
      }
    });
  });

  describe('scale', () => {
    // The rig's own dimensions (Lab 8 handout): both windings have a radius of
    // 1.3 cm and the solenoid is 8 cm long.
    it('draws the coil at its real radius of 1.3 cm', () => {
      expect(COIL_FIELD.radius / COIL_FIELD.pxPerCm).toBeCloseTo(1.3, 5);
    });

    it('draws the solenoid at its real radius of 1.3 cm and length of 8 cm', () => {
      expect(SOLENOID_FIELD.radius / SOLENOID_FIELD.pxPerCm).toBeCloseTo(1.3, 5);
      expect((2 * SOLENOID_FIELD.halfLength) / SOLENOID_FIELD.pxPerCm).toBeCloseTo(8, 5);
    });

    it('fits the whole length of the solenoid inside the drawing', () => {
      expect(SOLENOID_FIELD.halfLength).toBeLessThan(HALF_W);
    });
  });

  describe('shape of the solenoid field', () => {
    it('runs parallel to the axis through the middle half of the winding', () => {
      for (const line of SOLENOID_FIELD.lines) {
        const middle = points(line).filter(([x, y]) => Math.abs(x) <= SOLENOID_FIELD.halfLength / 2 && -y < SOLENOID_FIELD.radius);
        expect(middle.length).toBeGreaterThan(2);
        for (const [, y] of middle) expect(Math.abs(-y - line.inner)).toBeLessThanOrEqual(0.5);
      }
    });

    it('stays inside the winding until near its ends, then spreads out', () => {
      for (const line of SOLENOID_FIELD.lines) {
        // Follow the line from the centre of the solenoid toward one end and
        // note where it first passes through the winding.
        const pts = points(line);
        const fromCentre = pts.slice(pts.findIndex(([x, y]) => x === 0 && -y === line.inner));
        const leaves = fromCentre.find(([, y]) => -y > SOLENOID_FIELD.radius);
        expect(leaves).toBeDefined();
        expect(Math.abs((leaves as Point)[0])).toBeGreaterThan(SOLENOID_FIELD.halfLength * 0.75);
      }
    });
  });

  describe('shape of the coil field', () => {
    it('is closest to the axis in the plane of the coil and spreads out on either side', () => {
      for (const line of COIL_FIELD.lines.filter(l => l.outer === null)) {
        for (const [, y] of points(line)) expect(-y).toBeGreaterThanOrEqual(line.inner);
      }
    });

    it('wraps its closed loops around the wire', () => {
      for (const line of COIL_FIELD.lines.filter(isClosed)) {
        const xs = points(line).map(([x]) => x);
        expect(Math.min(...xs)).toBeLessThan(0);
        expect(Math.max(...xs)).toBeGreaterThan(0);
        expect(line.inner).toBeLessThan(COIL_FIELD.radius);
        expect(line.outer).toBeGreaterThan(COIL_FIELD.radius);
      }
    });
  });
});
