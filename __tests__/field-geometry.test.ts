import {
  aboutAxis, arrowLength, arrowParts, axisField, brightness, cameraDistance, copiesRound, edgeFade, isMarked, linesFor, midPlaneMarks,
  modelFor, samples, shadedRuns, shadeOf, SHADES, startAngle, strongest, VIEW, visibleExtent, type FieldKind, type Sample,
} from '@/lib/field-geometry';
import { COIL_MODEL, SOLENOID_MODEL } from '@/lib/field-model';
import { calcBSolenoid, SOLENOID } from '@/lib/physics';

// What the lab room's two views of the field take from the model. The model's
// own physics is checked in field-model.test.ts; this is the reading of it.

const KINDS: FieldKind[] = ['coil', 'solenoid'];
const at = (z: number, rho: number, b = 1): Sample => ({ z, rho, b });

describe('linesFor — the lines of a drawing', () => {
  it.each([[1, 4], [2, 8], [3, 12]])('the coil with %i turn(s) has %i lines and the axis', (turns, lines) => {
    const drawn = linesFor('coil', turns);
    expect(drawn[0].level).toBe(0);
    expect(drawn).toHaveLength(lines + 1);
  });

  it('adding turns keeps the lines already drawn and puts new ones between them', () => {
    const one = linesFor('coil', 1).map(l => l.level);
    const two = linesFor('coil', 2).map(l => l.level);
    const three = linesFor('coil', 3).map(l => l.level);
    for (const level of one) {
      expect(two).toContain(level);
      expect(three).toContain(level);
    }
  });

  it('draws the one-turn coil for a number of turns it does not know', () => {
    expect(linesFor('coil', 0)).toEqual(linesFor('coil', 1));
    expect(linesFor('coil', 7)).toEqual(linesFor('coil', 1));
  });

  it('the solenoid has one drawing: every line of its model', () => {
    expect(linesFor('solenoid', 0)).toBe(SOLENOID_MODEL.lines);
    expect(linesFor('solenoid', 3)).toHaveLength(7);
  });

  it('gives each kind its own model', () => {
    expect(modelFor('coil')).toBe(COIL_MODEL);
    expect(modelFor('solenoid')).toBe(SOLENOID_MODEL);
  });
});

describe('samples — a line as points', () => {
  it('reads the flattened triples in order', () => {
    expect(samples({ level: 1, rho0: 1, closed: false, points: [-1, 2, 0.5, 0, 1, 1, 1, 2, 0.5] }))
      .toEqual([at(-1, 2, 0.5), at(0, 1, 1), at(1, 2, 0.5)]);
  });

  it('leaves out a triple that is not complete', () => {
    expect(samples({ level: 1, rho0: 1, closed: false, points: [0, 1, 1, 5, 6] })).toEqual([at(0, 1, 1)]);
  });
});

describe('brightness — how strongly a field is drawn', () => {
  it('is nothing for no field and full for the field at the centre', () => {
    expect(brightness(0)).toBe(0);
    expect(brightness(1)).toBe(1);
  });

  it('only ever rises with the field', () => {
    const values = [0, 0.005, 0.02, 0.1, 0.3, 0.6, 0.9, 1].map(b => brightness(b));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });

  it('is no brighter than full, however strong the field next to the wire', () => {
    expect(brightness(2.257)).toBe(1);
    expect(brightness(Infinity)).toBe(1);
  });

  it.each([NaN, -0.5, -Infinity])('is nothing for %p', (b) => {
    expect(brightness(b)).toBe(0);
  });

  it('is measured against the strongest field in the drawing, so nothing stronger than the centre is lost', () => {
    // Next to the coil's wire the field is over twice the centre's.
    expect(brightness(2.257, 2.257)).toBe(1);
    expect(brightness(1, 2.257)).toBeLessThan(1);
    expect(brightness(2, 2.257)).toBeGreaterThan(brightness(1.5, 2.257));
    expect(brightness(1, 2.257)).toBeCloseTo((1 / 2.257) ** 0.6, 12);
  });

  it.each([0, -1, NaN])('is nothing when the strongest field is given as %p', (top) => {
    expect(brightness(0.5, top)).toBe(0);
  });

  it('knows the strongest field of each model: next to the wire for the coil, hardly above the centre\'s for the solenoid', () => {
    for (const kind of KINDS) {
      const all = modelFor(kind).lines.flatMap(line => samples(line).map(p => p.b));
      expect(strongest(kind)).toBe(Math.max(...all));
    }
    expect(strongest('coil')).toBeGreaterThan(2);
    expect(strongest('solenoid')).toBeGreaterThan(1);
    expect(strongest('solenoid')).toBeLessThan(1.1);
  });

  it.each(KINDS)('uses the whole range of shades in the %s, the brightest only for its strongest field', (kind) => {
    const top = strongest(kind);
    const shades = new Set(modelFor(kind).lines.flatMap(line => samples(line).map(p => shadeOf(p.b, top))));
    expect(shades.has(0)).toBe(true);
    expect(shades.has(SHADES - 1)).toBe(true);
    expect(shadeOf(top, top)).toBe(SHADES - 1);
  });

  it('falls in one of the shades, the dimmest for the weakest field and the brightest for the strongest', () => {
    expect(shadeOf(0)).toBe(0);
    expect(shadeOf(1)).toBe(SHADES - 1);
    expect(shadeOf(5)).toBe(SHADES - 1);
    for (const b of [0.01, 0.2, 0.5, 0.99]) {
      expect(Number.isInteger(shadeOf(b))).toBe(true);
      expect(shadeOf(b)).toBeGreaterThanOrEqual(0);
      expect(shadeOf(b)).toBeLessThan(SHADES);
    }
  });
});

describe('shadedRuns — a line cut into stretches of one shade', () => {
  const line = [at(0, 1, 1), at(1, 1, 1), at(2, 1, 0.05), at(3, 1, 0.05), at(4, 1, 0.05)];

  it('starts each stretch on the point the one before ended on', () => {
    const runs = shadedRuns(line, false);
    expect(runs.length).toBeGreaterThan(1);
    for (let i = 1; i < runs.length; i++) expect(runs[i].pts[0]).toBe(runs[i - 1].pts[runs[i - 1].pts.length - 1]);
    expect(runs[0].pts[0]).toBe(line[0]);
    expect(runs[runs.length - 1].pts.slice(-1)[0]).toBe(line[4]);
  });

  it('keeps neighbouring segments of one shade in one stretch', () => {
    const shades = shadedRuns(line, false).map(r => r.shade);
    for (let i = 1; i < shades.length; i++) expect(shades[i]).not.toBe(shades[i - 1]);
  });

  it('says how far along the line each stretch begins', () => {
    const runs = shadedRuns(line, false);
    expect(runs[0].start).toBe(0);
    let along = 0;
    for (const run of runs) {
      expect(run.start).toBeCloseTo(along, 12);
      for (let i = 1; i < run.pts.length; i++) along += Math.hypot(run.pts[i].z - run.pts[i - 1].z, run.pts[i].rho - run.pts[i - 1].rho);
    }
    expect(along).toBeCloseTo(4, 12);
  });

  it('shades against the strongest field it is given', () => {
    const strong = [at(0, 1, 2), at(1, 1, 2), at(2, 1, 2)];
    expect(shadedRuns(strong, false)[0].shade).toBe(SHADES - 1);
    expect(shadedRuns(strong, false, 8)[0].shade).toBeLessThan(SHADES - 1);
  });

  it('takes a closed line back to where it started', () => {
    const square = [at(0, 1), at(1, 1), at(1, 2), at(0, 2)];
    const runs = shadedRuns(square, true);
    expect(runs).toHaveLength(1);
    expect(runs[0].pts).toEqual([...square, square[0]]);
  });

  it.each(KINDS)('covers every segment of every line of the %s', (kind) => {
    for (const line of modelFor(kind).lines) {
      const pts = samples(line);
      const segments = shadedRuns(pts, line.closed).reduce((n, run) => n + run.pts.length - 1, 0);
      expect(segments).toBe(line.closed ? pts.length : pts.length - 1);
    }
  });
});

describe('midPlaneMarks — where the arrowheads go', () => {
  it('marks an open line where it crosses the mid-plane, pointing the way the line runs', () => {
    const [mark, ...rest] = midPlaneMarks([at(-1, 2, 0.4), at(1, 2, 0.6)], false);
    expect(rest).toHaveLength(0);
    expect(mark).toMatchObject({ z: 0, rho: 2 });
    expect(mark.angle).toBeCloseTo(0, 12);
    expect(mark.b).toBeCloseTo(0.5, 12);
  });

  it('marks a point that lies on the mid-plane itself', () => {
    const [mark] = midPlaneMarks([at(-1, 1), at(0, 1, 0.8), at(1, 1)], false);
    expect(mark).toMatchObject({ z: 0, rho: 1, b: 0.8 });
    expect(mark.angle).toBeCloseTo(0, 12);
  });

  it('marks a closed line twice: going one way inside, and back the other way outside', () => {
    // Once round the wire at rho = 2, starting on the mid-plane inside it.
    const loop = [at(0, 1), at(1, 2), at(0, 3), at(-1, 2)];
    const marks = midPlaneMarks(loop, true);
    expect(marks.map(m => m.rho)).toEqual([1, 3]);
    expect(Math.cos(marks[0].angle)).toBeCloseTo(1, 12);
    expect(Math.cos(marks[1].angle)).toBeCloseTo(-1, 12);
  });

  it('puts none on the axis, which runs along the mid-plane\'s normal', () => {
    expect(midPlaneMarks(samples(COIL_MODEL.lines[0]), false)).toEqual([]);
    expect(midPlaneMarks(samples(SOLENOID_MODEL.lines[0]), false)).toEqual([]);
  });

  it.each(KINDS)('on the %s every line runs toward +z inside the winding, and a closed one comes back toward -z outside it', (kind) => {
    const model = modelFor(kind);
    for (const line of model.lines.slice(1)) {
      const marks = midPlaneMarks(samples(line), line.closed);
      expect(marks).toHaveLength(line.closed ? 2 : 1);
      expect(marks[0].rho).toBeCloseTo(line.rho0, 3);
      expect(marks[0].rho).toBeLessThan(model.radius);
      expect(Math.cos(marks[0].angle)).toBeGreaterThan(0.99);
      if (line.closed) {
        expect(marks[1].rho).toBeGreaterThan(model.radius);
        expect(Math.cos(marks[1].angle)).toBeLessThan(-0.99);
      }
    }
  });

  it('puts arrowheads on the one-turn coil\'s lines only, and on every other line of the solenoid', () => {
    const marked = (kind: FieldKind, turns: number) => linesFor(kind, turns).filter(l => isMarked(kind, l.level)).map(l => l.level);
    expect(marked('coil', 1)).toEqual([6, 12, 18, 24]);
    expect(marked('coil', 3)).toEqual([6, 12, 18, 24]);
    expect(marked('solenoid', 0)).toEqual([2, 4, 6]);
    expect(isMarked('coil', 0)).toBe(false);
  });
});

describe('axisField — the field along the axis', () => {
  it.each(KINDS)('is the centre\'s own field at the centre of the %s, and the same either side', (kind) => {
    expect(axisField(kind, 0)).toBeCloseTo(1, 3);
    for (const z of [0.7, 2.3, 5]) expect(axisField(kind, -z)).toBeCloseTo(axisField(kind, z), 6);
  });

  it('follows the handout\'s formula for the solenoid', () => {
    const { N, I, L, R } = SOLENOID;
    for (const cm of [1, 3, 4, 6.5, 10]) {
      const theory = calcBSolenoid(N, I, L, R, cm / 100) / calcBSolenoid(N, I, L, R, 0);
      expect(axisField('solenoid', cm)).toBeCloseTo(theory, 2);
    }
  });

  it('follows B0 x R^3 / (R^2 + z^2)^(3/2) for the coil', () => {
    const R = COIL_MODEL.radius;
    for (const z of [0.5, 1.3, 2.6, 5]) expect(axisField('coil', z)).toBeCloseTo((1 + (z * z) / (R * R)) ** -1.5, 2);
  });

  it('holds the last value past the ends of the traced region', () => {
    expect(axisField('coil', 99)).toBe(axisField('coil', COIL_MODEL.frame.z));
    expect(axisField('coil', -99)).toBe(axisField('coil', -COIL_MODEL.frame.z));
  });
});

describe('the 3D view\'s copies of a line', () => {
  it('draws the axis once', () => {
    expect(copiesRound(0, 7.7)).toBe(1);
  });

  it('repeats a line in proportion to how far from the axis it starts', () => {
    expect(copiesRound(1, 6)).toBe(6);
    expect(copiesRound(2, 6)).toBe(12);
    expect(copiesRound(0.5, 6)).toBe(3);
  });

  it('draws every line at least once', () => {
    expect(copiesRound(0.01, 4.2)).toBe(1);
  });

  // Each line stands for an equal step of field along the mid-plane, that is,
  // for a ring of flux in proportion to its rho0; a copy carries rho0 / copies.
  const share = (kind: FieldKind, turns: number) => linesFor(kind, turns).slice(1).map(l => l.rho0 / copiesRound(l.rho0, VIEW[kind].perCm));
  const unevenness = (shares: number[]) => Math.max(...shares) / Math.min(...shares);

  it('shares the solenoid\'s field among its 3D lines evenly: one, two, three copies and so on outward', () => {
    expect(unevenness(share('solenoid', 0))).toBeLessThan(1.02);
    expect(linesFor('solenoid', 0).slice(1).map(l => copiesRound(l.rho0, VIEW.solenoid.perCm))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it.each([[1, 1.1], [2, 1.35], [3, 1.15]])('shares the %i-turn coil\'s field among its 3D lines to within a factor of %f', (turns, factor) => {
    expect(unevenness(share('coil', turns))).toBeLessThan(factor);
  });

  it('gives the coil about two and three times the 3D lines for two and three turns', () => {
    const lines = (turns: number) => linesFor('coil', turns).slice(1).reduce((n, l) => n + copiesRound(l.rho0, VIEW.coil.perCm), 0);
    expect(lines(2) / lines(1)).toBeGreaterThan(1.7);
    expect(lines(2) / lines(1)).toBeLessThan(2.2);
    expect(lines(3) / lines(1)).toBeGreaterThan(2.5);
    expect(lines(3) / lines(1)).toBeLessThan(3.2);
  });

  it.each(KINDS)('gives the %s more copies the further out a line starts, never fewer', (kind) => {
    const copies = modelFor(kind).lines.slice(1).map(l => copiesRound(l.rho0, VIEW[kind].perCm));
    for (let i = 1; i < copies.length; i++) expect(copies[i]).toBeGreaterThanOrEqual(copies[i - 1]);
    expect(copies[copies.length - 1]).toBeGreaterThan(copies[0]);
  });

  it('starts each line\'s copies at a different angle, inside one turn', () => {
    const angles = [0, 1, 2, 3, 4, 5].map(startAngle);
    expect(new Set(angles.map(a => a.toFixed(6))).size).toBe(6);
    for (const angle of angles) {
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(2 * Math.PI);
    }
  });

  it('turns a point about the axis, keeping its distance from it', () => {
    expect(aboutAxis({ z: 3, rho: 2 }, 0)).toEqual([3, 2, 0]);
    const [x, y, z] = aboutAxis({ z: 3, rho: 2 }, Math.PI / 2);
    expect(x).toBe(3);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(2, 12);
    const [, y2, z2] = aboutAxis({ z: 3, rho: 2 }, 1.234);
    expect(Math.hypot(y2, z2)).toBeCloseTo(2, 12);
  });
});

describe('arrowLength — the probe\'s arrows', () => {
  it('is the full length for the field at the centre, and in proportion below it', () => {
    expect(arrowLength(0.695, 0.695, 2.6)).toBeCloseTo(2.6, 12);
    expect(arrowLength(0.3475, 0.695, 2.6)).toBeCloseTo(1.3, 12);
  });

  it('stops at 1.3 times the full length for a reading far above theory', () => {
    expect(arrowLength(5, 0.695, 2.6)).toBeCloseTo(3.38, 12);
  });

  it('is negative for a field the other way along the axis, and stops at 1.3 times that way too', () => {
    expect(arrowLength(-0.3475, 0.695, 2.6)).toBeCloseTo(-1.3, 12);
    expect(arrowLength(-5, 0.695, 2.6)).toBeCloseTo(-3.38, 12);
  });

  it.each([[0, 1], [NaN, 1], [Infinity, 1], [0.5, 0], [0.5, NaN]])('draws nothing for a reading of %p against %p', (b, peak) => {
    expect(arrowLength(b, peak, 2.6)).toBe(0);
  });

  it('splits a long arrow into a shaft and a head of full size', () => {
    expect(arrowParts(2.6, 0.5)).toEqual({ shaft: 2.1, head: 0.5 });
  });

  it('keeps a short arrow its true length: the head shrinks to it, and there is no shaft', () => {
    // The solenoid's field 8 cm from its middle is a few percent of the centre's.
    const parts = arrowParts(0.13, 0.4875);
    expect(parts).toEqual({ shaft: 0, head: 0.13 });
    expect(parts.shaft + parts.head).toBe(0.13);
  });

  it.each([0.001, 0.2, 0.4875, 0.6, 3.38])('an arrow of %f cm is that long, whatever the size of its head', (size) => {
    const { shaft, head } = arrowParts(size, 0.4875);
    expect(shaft + head).toBeCloseTo(size, 12);
    expect(head).toBeLessThanOrEqual(0.4875);
    expect(shaft).toBeGreaterThanOrEqual(0);
  });

  it('is nothing for no length', () => {
    expect(arrowParts(0, 0.5)).toEqual({ shaft: 0, head: 0 });
    expect(arrowParts(-1, 0.5)).toEqual({ shaft: 0, head: 0 });
  });
});

describe('edgeFade — lines that leave the traced region', () => {
  const frame = { z: 14, rho: 8 };

  it('leaves a line alone well inside the region', () => {
    expect(edgeFade({ z: 0, rho: 2 }, frame, 1.6)).toBe(1);
    expect(edgeFade({ z: -12, rho: 6 }, frame, 1.6)).toBe(1);
  });

  it('fades it to nothing at the edge, along the axis or away from it', () => {
    expect(edgeFade({ z: 14, rho: 1 }, frame, 1.6)).toBe(0);
    expect(edgeFade({ z: -14, rho: 1 }, frame, 1.6)).toBe(0);
    expect(edgeFade({ z: 3, rho: 8 }, frame, 1.6)).toBe(0);
    expect(edgeFade({ z: 99, rho: 99 }, frame, 1.6)).toBe(0);
  });

  it('fades evenly over the last stretch, by whichever edge is nearer', () => {
    expect(edgeFade({ z: 13.2, rho: 1 }, frame, 1.6)).toBeCloseTo(0.5, 12);
    expect(edgeFade({ z: 13.2, rho: 7.6 }, frame, 1.6)).toBeCloseTo(0.25, 12);
  });

  it.each(KINDS)('reaches nothing at both ends of every line of the %s that leaves the region, and never touches one that closes', (kind) => {
    const { frame: traced, lines } = modelFor(kind);
    for (const line of lines.filter(l => !l.closed)) {
      const pts = samples(line);
      expect(edgeFade(pts[0], traced, 0.2 * traced.rho)).toBeLessThan(0.02);
      expect(edgeFade(pts[pts.length - 1], traced, 0.2 * traced.rho)).toBeLessThan(0.02);
    }
    for (const line of lines.filter(l => l.closed)) {
      // These stay inside, though some come near the edge; they are drawn whole.
      for (const p of samples(line)) expect(Math.abs(p.z) <= traced.z && p.rho <= traced.rho).toBe(true);
    }
  });
});

describe('visibleExtent — the part of the section a box shows', () => {
  const fits = (kind: FieldKind, width: number, height: number) => {
    const { prefer, need } = VIEW[kind];
    return visibleExtent(width, height, prefer, need, modelFor(kind).frame);
  };

  it('shows the region it prefers in a box of that shape', () => {
    const { prefer } = VIEW.coil;
    const shown = fits('coil', 460, 240);
    expect(shown.z).toBeCloseTo(prefer.z, 9);
    expect(shown.rho).toBeCloseTo(prefer.rho, 9);
  });

  it.each([
    ['coil', 575, 300], ['coil', 595, 210], ['coil', 874, 245], ['coil', 350, 280],
    ['solenoid', 580, 270], ['solenoid', 595, 135], ['solenoid', 350, 130], ['solenoid', 874, 245],
  ] as Array<[FieldKind, number, number]>)('the %s in a %i x %i box: the same scale both ways, the winding and the probe\'s travel in view, nothing past the traced region', (kind, width, height) => {
    const shown = fits(kind, width, height);
    const { need } = VIEW[kind];
    const { frame } = modelFor(kind);
    expect(shown.z / shown.rho).toBeCloseTo(width / height, 9);
    expect(shown.z).toBeGreaterThanOrEqual(need.z - 1e-9);
    expect(shown.rho).toBeGreaterThanOrEqual(need.rho - 1e-9);
    expect(shown.z).toBeLessThanOrEqual(frame.z + 1e-9);
    expect(shown.rho).toBeLessThanOrEqual(frame.rho + 1e-9);
  });

  it('keeps the whole of the probe\'s travel in view even in a box too narrow for the traced region', () => {
    const shown = fits('solenoid', 200, 400);
    expect(shown.z).toBeCloseTo(VIEW.solenoid.need.z, 9);
    expect(shown.rho).toBeGreaterThan(SOLENOID_MODEL.frame.rho);
  });

  it('needs to show the winding of each instrument, and all 21 positions of the solenoid\'s probe', () => {
    expect(VIEW.coil.need.rho).toBeGreaterThan(COIL_MODEL.radius);
    expect(VIEW.solenoid.need.rho).toBeGreaterThan(SOLENOID_MODEL.radius);
    expect(VIEW.solenoid.need.z).toBeGreaterThan(10);
  });
});

describe('cameraDistance — how far back the 3D camera sits', () => {
  type Point = [number, number, number];
  const TAN_V = 0.3;
  const TAN_H = 1.2;

  // Where a point lands in the picture from a camera `distance` away along a
  // bearing: across and up as shares of half the picture (1 is its edge).
  function seen([x, y, z]: Point, azimuth: number, elevation: number, distance: number) {
    const camera: Point = [distance * Math.sin(azimuth) * Math.cos(elevation), distance * Math.sin(elevation), distance * Math.cos(azimuth) * Math.cos(elevation)];
    const forward = camera.map(c => -c / distance);
    const right: Point = [Math.cos(azimuth), 0, -Math.sin(azimuth)];
    const upward: Point = [
      right[1] * forward[2] - right[2] * forward[1],
      right[2] * forward[0] - right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ];
    const from: Point = [x - camera[0], y - camera[1], z - camera[2]];
    const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const depth = dot(from, forward);
    return { depth, across: dot(from, right) / (depth * TAN_H), up: dot(from, upward) / (depth * TAN_V) };
  }

  it('needs no distance for the point it is looking at', () => {
    expect(cameraDistance([[0, 0, 0]], { azimuth: 0.6, elevation: 0.3 }, TAN_V, TAN_H)).toBe(0);
  });

  it('from straight in front, stands back by a point\'s offset over the tangent of half the angle of view', () => {
    const front = { azimuth: 0, elevation: 0 };
    expect(cameraDistance([[6, 0, 0]], front, TAN_V, TAN_H)).toBeCloseTo(6 / TAN_H, 12);
    expect(cameraDistance([[0, 3, 0]], front, TAN_V, TAN_H)).toBeCloseTo(3 / TAN_V, 12);
    expect(cameraDistance([[-6, 0, 0], [0, -3, 0]], front, TAN_V, TAN_H)).toBeCloseTo(10, 12);
  });

  it('stands further back for a point that is toward the camera, by that much and more', () => {
    const front = { azimuth: 0, elevation: 0 };
    expect(cameraDistance([[0, 3, 4]], front, TAN_V, TAN_H)).toBeCloseTo(3 / TAN_V + 4, 12);
    expect(cameraDistance([[0, 3, -4]], front, TAN_V, TAN_H)).toBeCloseTo(3 / TAN_V - 4, 12);
  });

  it('backs off beyond the near end of the axis when the model is turned end-on', () => {
    const endOn = { azimuth: Math.PI / 2, elevation: 0.24 };
    const distance = cameraDistance([[-10.5, 0, 0], [10.5, 0, 0]], endOn, TAN_V, TAN_H);
    expect(distance).toBeGreaterThan(10.5);
    expect(seen([10.5, 0, 0], endOn.azimuth, endOn.elevation, distance).depth).toBeGreaterThan(0);
  });

  it('puts every point in the picture, with at least one on its edge, whichever way the camera is turned', () => {
    // The solenoid as the 3D view frames it: the probe's travel and a ring round each end.
    const points: Point[] = [[-10.5, 0, 0], [10.5, 0, 0]];
    for (const end of [-4, 4]) for (let i = 0; i < 16; i++) points.push(aboutAxis({ z: end, rho: 3.2 }, (2 * Math.PI * i) / 16));

    for (const azimuth of [-2.5, -1.2, -0.3, 0, 0.18, 0.4, 0.62, 1.1, Math.PI / 2, 2.2, 3.1]) {
      for (const elevation of [-1.3, -0.5, 0, 0.24, 0.8, 1.3]) {
        const distance = cameraDistance(points, { azimuth, elevation }, TAN_V, TAN_H);
        const where = points.map(p => seen(p, azimuth, elevation, distance));
        for (const { depth, across, up } of where) {
          expect(depth).toBeGreaterThan(0);
          expect(Math.abs(across)).toBeLessThanOrEqual(1 + 1e-9);
          expect(Math.abs(up)).toBeLessThanOrEqual(1 + 1e-9);
        }
        // No further back than it has to be.
        expect(Math.max(...where.map(w => Math.max(Math.abs(w.across), Math.abs(w.up))))).toBeCloseTo(1, 9);
      }
    }
  });
});
