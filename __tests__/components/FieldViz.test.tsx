import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { FieldViz, resetFieldViewMode, type FieldViewProps } from '@/app/lab/FieldViz';
import FieldView3D from '@/app/lab/FieldView3D';
import { VIEW } from '@/lib/field-geometry';
import type { AnimeMock } from '../helpers/client/anime';
import { installMatchMedia } from '../helpers/client/matchMedia';

jest.mock('animejs', () => jest.requireActual<typeof import('../helpers/client/anime')>('../helpers/client/anime').animeMock());
// The panel fetches its 3D view on demand; here a stand-in is handed over at
// once. The real one is tested on its own below.
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function View3D({ kind, turns }: FieldViewProps) {
    return <div data-testid="view-3d" data-kind={kind} data-turns={turns} />;
  },
}));

const anime = jest.requireMock<AnimeMock>('animejs');
const REDUCED = '(prefers-reduced-motion: reduce)';
const STORED = 'lab-field-view';

const COIL: FieldViewProps = { kind: 'coil', turns: 1, zCm: 0, bTheory: 0.242, bMeasured: 0.121, bPeak: 0.242 };
const SOLENOID: FieldViewProps = { kind: 'solenoid', turns: 0, zCm: 3, bTheory: 0.545, bMeasured: 0.5, bPeak: 0.695 };

// jsdom lays nothing out: every box is given this size instead.
function boxesAre(width: number, height: number) {
  jest.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(width);
  jest.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(height);
}

const section = (root: HTMLElement) => root.querySelector('svg[role="img"]');
const count = (root: HTMLElement, selector: string) => root.querySelectorAll(selector).length;
const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
// The calls that animate (or place) a given property, with what they were given.
const animations = (prop: string) => anime.animate.mock.calls
  .map(call => call as unknown as [unknown, Record<string, unknown>])
  .filter(([, params]) => prop in params);
const placements = (prop: string) => anime.utils.set.mock.calls
  .map(call => call as unknown as [unknown, Record<string, unknown>])
  .filter(([, params]) => prop in params);

beforeEach(() => {
  installMatchMedia();
  window.localStorage.clear();
  resetFieldViewMode();
  boxesAre(580, 270);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('FieldViz — the section through the axis (2D)', () => {
  it('opens on the section, and says what it shows', () => {
    const { container } = render(<FieldViz {...COIL} />);
    expect(pressed('2D')).toBe('true');
    expect(pressed('3D')).toBe('false');
    expect(section(container)).toHaveAccessibleName(expect.stringContaining('ขดลวดเดี่ยว 1 รอบ'));
    expect(screen.queryByTestId('view-3d')).not.toBeInTheDocument();
  });

  it.each([[1, 4], [2, 8], [3, 12]])('draws the coil with %i turn(s) as %i lines above the axis, mirrored below it, and the axis', (turns, lines) => {
    const { container } = render(<FieldViz {...COIL} turns={turns} />);
    const mirror = container.querySelector('use');
    const half = container.querySelector(`[id="${mirror?.getAttribute('href')?.slice(1)}"]`);
    expect(half?.querySelectorAll('.field-line')).toHaveLength(lines);
    expect(mirror).toHaveAttribute('transform', 'scale(1 -1)');
    expect(count(container, '.field-line')).toBe(lines + 1);
    expect(container.querySelector('.field-line[data-level="0"]')).toBeInTheDocument();
  });

  it('draws the solenoid as 6 lines above the axis and the axis', () => {
    const { container } = render(<FieldViz {...SOLENOID} />);
    expect(count(container, '.field-line')).toBe(7);
    expect(section(container)).toHaveAccessibleName(expect.stringContaining('โซลีนอยด์'));
  });

  it('adds lines with the turns, but no arrowheads: those stay on the one-turn coil\'s lines', () => {
    const heads = [1, 2, 3].map(turns => {
      const { container, unmount } = render(<FieldViz {...COIL} turns={turns} />);
      const n = count(container, '.field-head');
      unmount();
      return n;
    });
    // 4 lines, 2 of them closing with a second arrowhead outside the winding, and 4 on the axis.
    expect(heads).toEqual([10, 10, 10]);
  });

  it('draws every stretch of a line twice: the line, and the dashes that run along it', () => {
    const { container } = render(<FieldViz {...COIL} />);
    for (const line of container.querySelectorAll('.field-line')) {
      const dashes = line.querySelectorAll('path.field-flow');
      const solid = line.querySelectorAll('path:not(.field-flow):not(.field-head)');
      expect(dashes.length).toBeGreaterThan(0);
      expect(solid).toHaveLength(dashes.length);
      solid.forEach((path, i) => expect(path.getAttribute('d')).toBe(dashes[i].getAttribute('d')));
    }
  });

  it('draws a stronger field brighter: a line fades as it leaves the winding, and stays bright while it keeps to the wire', () => {
    const { container } = render(<FieldViz {...COIL} />);
    const opacities = (level: number) => [...container.querySelectorAll(`.field-line[data-level="${level}"] path:not(.field-flow):not(.field-head)`)]
      .map(p => Number(p.getAttribute('stroke-opacity')));
    // Level 6 passes through the loop and leaves the drawing far from it.
    expect(Math.min(...opacities(6))).toBeLessThan(Math.max(...opacities(6)));
    // Level 24 goes once round the wire, where the field is strongest.
    expect(Math.min(...opacities(24))).toBeGreaterThan(Math.min(...opacities(6)));
  });

  it('shows one wire end per turn, coming toward the viewer above the axis and going away below it', () => {
    const { container } = render(<FieldViz {...COIL} turns={3} />);
    const turns = container.querySelectorAll('.field-winding [data-turn]');
    expect(turns).toHaveLength(3);
    for (const turn of turns) {
      const [above, below] = turn.children;
      // A dot for current toward the viewer, a cross for current going away.
      expect(above.querySelectorAll('circle')).toHaveLength(2);
      expect(below.querySelector('path')).toBeInTheDocument();
      expect(above.getAttribute('transform')).toContain(' -1.3)');
      expect(below.getAttribute('transform')).toContain(' 1.3)');
    }
  });

  it('shows the solenoid\'s winding along both sides and a tick for each of the probe\'s 21 positions', () => {
    const { container } = render(<FieldViz {...SOLENOID} />);
    const winding = container.querySelector('.field-winding') as Element;
    const rows = [...winding.querySelectorAll('line[stroke-dasharray]')];
    expect(rows.map(r => Number(r.getAttribute('y1')))).toEqual([-2.1, 2.1]);
    for (const row of rows) expect(Number(row.getAttribute('x1'))).toBe(-4);
    const ticks = [...winding.querySelectorAll('line:not([stroke-dasharray])')].map(t => Number(t.getAttribute('x1')));
    expect(ticks).toEqual(Array.from({ length: 21 }, (_, i) => i - 10));
  });

  it('is to scale, with a bar that says so', () => {
    const { container, unmount } = render(<FieldViz {...COIL} />);
    expect(container.querySelector('.field-scale')).toHaveTextContent('1 ซม.');
    unmount();
    expect(render(<FieldViz {...SOLENOID} />).container.querySelector('.field-scale')).toHaveTextContent('5 ซม.');
  });

  it('draws nothing while its box has no size, as in the layout the lab room keeps hidden', () => {
    boxesAre(0, 0);
    const { container } = render(<FieldViz {...COIL} />);
    expect(section(container)).not.toBeInTheDocument();
    expect(animations('strokeDashoffset')).toHaveLength(0);
  });
});

describe('FieldViz — the probe and its two arrows', () => {
  const arrow = (root: HTMLElement, name: string) => root.querySelector(`[data-arrow="${name}"]`);
  const length = (root: HTMLElement, name: string) => Number(arrow(root, name)?.getAttribute('data-length'));

  it('puts the probe where it is along the axis', () => {
    const { container } = render(<FieldViz {...SOLENOID} zCm={-7} />);
    const probe = container.querySelector('.field-probe');
    expect(probe).toHaveAttribute('data-z', '-7');
    expect(placements('translateX')).toContainEqual([probe, { translateX: -7 }]);
  });

  it('glides the probe to a new position', () => {
    const { container, rerender } = render(<FieldViz {...SOLENOID} zCm={0} />);
    anime.animate.mockClear();
    rerender(<FieldViz {...SOLENOID} zCm={4} />);
    const glides = animations('translateX').filter(([target]) => target === container.querySelector('.field-probe'));
    expect(glides).toHaveLength(1);
    expect(glides[0][1]).toMatchObject({ translateX: 4 });
  });

  it('draws the theory arrow at full length for the field at the centre, and the measured one in proportion', () => {
    const { container } = render(<FieldViz {...COIL} />);
    expect(length(container, 'theory')).toBeCloseTo(VIEW.coil.arrow, 3);
    expect(length(container, 'measured')).toBeCloseTo(VIEW.coil.arrow / 2, 3);
  });

  it('shortens the theory arrow as the probe leaves the middle of the solenoid', () => {
    const { container } = render(<FieldViz {...SOLENOID} />);
    expect(length(container, 'theory')).toBeCloseTo((0.545 / 0.695) * VIEW.solenoid.arrow, 3);
  });

  it('follows the sensor as its reading changes', () => {
    const { container, rerender } = render(<FieldViz {...COIL} bMeasured={0.1} />);
    const before = length(container, 'measured');
    rerender(<FieldViz {...COIL} bMeasured={0.2} />);
    expect(length(container, 'measured')).toBeCloseTo(before * 2, 2);
  });

  it.each([0, NaN])('draws no measured arrow for a reading of %p', (bMeasured) => {
    const { container } = render(<FieldViz {...COIL} bMeasured={bMeasured} />);
    expect(arrow(container, 'measured')).not.toBeInTheDocument();
    expect(arrow(container, 'theory')).toBeInTheDocument();
  });

  it('points the arrow back along the axis for a field the other way', () => {
    const { container } = render(<FieldViz {...COIL} bMeasured={-0.121} />);
    expect(length(container, 'measured')).toBeCloseTo(-VIEW.coil.arrow / 2, 3);
    expect(arrow(container, 'measured')).toHaveAttribute('transform', 'scale(-1 1)');
    expect(arrow(container, 'theory')).not.toHaveAttribute('transform');
  });

  it('draws a weak field as a short arrow of the right length, not a fixed-size head', () => {
    // 10 cm from the middle of the solenoid: 0.018 mT against 0.695 mT at the centre.
    const { container } = render(<FieldViz {...SOLENOID} zCm={10} bTheory={0.0177} bMeasured={0.0177} />);
    const theory = arrow(container, 'theory') as Element;
    const drawn = (theory.querySelector('path') as Element).getAttribute('d') as string;
    // The head is the whole arrow: it starts at the probe and ends at the arrow's length.
    const xs = [...drawn.matchAll(/[ML](-?[\d.e-]+) /g)].map(m => Number(m[1]));
    expect(theory.querySelector('line')).not.toBeInTheDocument();
    expect(Math.min(...xs)).toBeCloseTo(0, 9);
    expect(Math.max(...xs)).toBeCloseTo((0.0177 / 0.695) * VIEW.solenoid.arrow, 3);
  });

  it('does not let a reading far above theory run off the drawing', () => {
    const { container } = render(<FieldViz {...COIL} bMeasured={9} />);
    expect(length(container, 'measured')).toBeCloseTo(VIEW.coil.arrow * 1.3, 3);
  });
});

describe('FieldViz — motion', () => {
  it('runs the dashes along the lines, in the direction of the field', () => {
    const { container } = render(<FieldViz {...COIL} />);
    const [flow] = animations('strokeDashoffset');
    expect(flow[0]).toEqual(container.querySelectorAll('.field-flow'));
    // A falling offset moves the dashes forward along the path, which is drawn
    // in the direction of the field.
    expect(String(flow[1].strokeDashoffset)).toMatch(/^-=/);
    expect(flow[1]).toMatchObject({ loop: true, ease: 'linear' });
  });

  it('keeps everything still for someone who asked for reduced motion', () => {
    installMatchMedia({ [REDUCED]: true });
    const { rerender } = render(<FieldViz {...SOLENOID} zCm={0} />);
    rerender(<FieldViz {...SOLENOID} zCm={5} />);
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    expect(anime.animate).not.toHaveBeenCalled();
  });

  it('still moves the probe at once under reduced motion', () => {
    installMatchMedia({ [REDUCED]: true });
    const { container, rerender } = render(<FieldViz {...SOLENOID} zCm={0} />);
    rerender(<FieldViz {...SOLENOID} zCm={5} />);
    expect(placements('translateX')).toContainEqual([container.querySelector('.field-probe'), { translateX: 5 }]);
  });
});

describe('FieldViz — switching between 2D and 3D', () => {
  it('shows the 3D view of the same instrument when 3D is chosen, and the section again on 2D', () => {
    const { container } = render(<FieldViz {...COIL} turns={2} />);
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    expect(screen.getByTestId('view-3d')).toHaveAttribute('data-kind', 'coil');
    expect(screen.getByTestId('view-3d')).toHaveAttribute('data-turns', '2');
    expect(section(container)).not.toBeInTheDocument();
    expect(pressed('3D')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '2D' }));
    expect(section(container)).toBeInTheDocument();
    expect(screen.queryByTestId('view-3d')).not.toBeInTheDocument();
  });

  it('names the two buttons as one control', () => {
    render(<FieldViz {...COIL} />);
    const group = screen.getByRole('group', { name: 'มุมมองแบบจำลอง' });
    expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['2D', '3D']);
  });

  it('says how to turn the model only where it can be turned', () => {
    render(<FieldViz {...COIL} />);
    expect(screen.getByText(/เส้นยิ่งสว่าง สนามยิ่งแรง/)).not.toHaveTextContent('ลากเพื่อหมุน');
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    expect(screen.getByText(/เส้นยิ่งสว่าง สนามยิ่งแรง/)).toHaveTextContent('ลากเพื่อหมุน');
  });

  it('slides the switch and brings the new view in', () => {
    render(<FieldViz {...COIL} />);
    anime.animate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    expect(animations('translateX').some(([, params]) => params.translateX === 36)).toBe(true);
    expect(animations('opacity')).toHaveLength(1);
  });

  it('switches every copy of the panel together: the lab room keeps two layouts mounted', () => {
    const { container } = render(<><FieldViz {...COIL} /><FieldViz {...COIL} /></>);
    fireEvent.click(screen.getAllByRole('button', { name: '3D' })[0]);
    expect(screen.getAllByTestId('view-3d')).toHaveLength(2);
    expect(section(container)).not.toBeInTheDocument();
  });

  it('remembers the choice for the next visit', () => {
    const first = render(<FieldViz {...COIL} />);
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    expect(window.localStorage.getItem(STORED)).toBe('3d');
    first.unmount();

    // A new visit: nothing is kept in memory, only what was stored.
    resetFieldViewMode();
    render(<FieldViz {...COIL} />);
    expect(screen.getByTestId('view-3d')).toBeInTheDocument();
    expect(pressed('3D')).toBe('true');
  });

  it('opens on the section when what was stored is not a view', () => {
    window.localStorage.setItem(STORED, 'hologram');
    const { container } = render(<FieldViz {...COIL} />);
    expect(section(container)).toBeInTheDocument();
  });

  it('still works when the browser will not store anything', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const { container } = render(<FieldViz {...COIL} />);
    expect(section(container)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    expect(screen.getByTestId('view-3d')).toBeInTheDocument();
  });
});

describe('FieldView3D — on a machine without WebGL', () => {
  // jsdom has no WebGL, which is the case being tested; three.js and jsdom
  // both say so on the console.
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('says it cannot show 3D and points back to 2D, instead of an empty box', async () => {
    render(<FieldView3D {...COIL} />);
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('เครื่องนี้แสดงมุมมอง 3D ไม่ได้');
    expect(screen.getByRole('status')).toHaveTextContent('2D');
  });

  it('does not try to start WebGL while its box has no size', async () => {
    boxesAre(0, 0);
    const { container } = render(<FieldView3D {...SOLENOID} />);
    await act(async () => {});
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelector('canvas')).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(expect.stringContaining('โซลีนอยด์'));
  });
});
