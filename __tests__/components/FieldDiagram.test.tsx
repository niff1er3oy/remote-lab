import { render, screen } from '@testing-library/react';
import FieldDiagram from '@/app/components/FieldDiagram';
import { COIL_FIELD, FIELD_VIEW, SOLENOID_FIELD } from '@/lib/field-lines';

// Only the drawing as a whole has a role and a name. Its parts are reached by
// the class names the component documents as hooks, and by SVG element type.
function draw(kind: 'coil' | 'solenoid') {
  const { container } = render(<FieldDiagram kind={kind} />);
  const svg = screen.getByRole('img');
  const all = (selector: string) => [...container.querySelectorAll<SVGElement>(selector)];
  return {
    container,
    svg,
    all,
    lines: all('path.field-line'),
    arrows: all('path.field-mark'),
    probe: container.querySelector('.field-probe') as SVGElement,
  };
}

const pointsRight = (arrow: SVGElement) => / scale\(1 1\)$/.test(arrow.getAttribute('transform') ?? '');
const pointsLeft = (arrow: SVGElement) => / scale\(-1 1\)$/.test(arrow.getAttribute('transform') ?? '');
const position = (arrow: SVGElement) => {
  const [, x, y] = /translate\((\S+) (\S+)\)/.exec(arrow.getAttribute('transform') ?? '') ?? [];
  return { x: Number(x), y: Number(y) };
};

describe('FieldDiagram', () => {
  describe.each([
    { kind: 'coil' as const, field: COIL_FIELD, name: /ขดลวดเดี่ยว/, probe: 'วัดที่กึ่งกลางขดลวด', bar: 1 },
    { kind: 'solenoid' as const, field: SOLENOID_FIELD, name: /โซลีนอยด์/, probe: 'หัววัดเลื่อนไปตามแนวแกน', bar: 5 },
  ])('$kind', ({ kind, field, name, probe, bar }) => {
    const closed = field.lines.filter(line => line.outer !== null);

    it('is one image with a description of the field for screen readers', () => {
      draw(kind);
      expect(screen.getByRole('img', { name })).toBeInTheDocument();
      expect(screen.getAllByRole('img')).toHaveLength(1);
    });

    it('uses the view box the field lines were generated for', () => {
      expect(draw(kind).svg).toHaveAttribute('viewBox', `0 0 ${FIELD_VIEW.w} ${FIELD_VIEW.h}`);
    });

    it('says in the caption where the probe measures', () => {
      draw(kind);
      expect(screen.getByText(probe)).toBeInTheDocument();
    });

    it('draws the axis and every field line above and below it', () => {
      const { lines } = draw(kind);

      expect(lines).toHaveLength(1 + 2 * field.lines.length);
      for (const line of field.lines) {
        expect(lines.filter(path => path.getAttribute('d') === line.d)).toHaveLength(2);
      }
    });

    it('draws the lower half as the mirror image of the upper half', () => {
      const { lines } = draw(kind);
      const halves = lines.slice(1).map(path => path.parentElement?.getAttribute('transform'));

      expect(new Set(halves)).toEqual(new Set(['scale(1 1)', 'scale(1 -1)']));
      expect(halves.filter(t => t === 'scale(1 -1)')).toHaveLength(field.lines.length);
    });

    it('draws the axis across the full width, through the centre', () => {
      const { lines } = draw(kind);
      expect(lines[0]).toHaveAttribute('d', `M${-FIELD_VIEW.w / 2} 0L${FIELD_VIEW.w / 2} 0`);
      expect(lines[0].parentElement).toHaveAttribute('transform', `translate(${FIELD_VIEW.w / 2} ${FIELD_VIEW.h / 2})`);
    });

    it('points the field one way along the axis, on both sides of the centre', () => {
      const onAxis = draw(kind).arrows.filter(arrow => position(arrow).y === 0 && pointsRight(arrow));

      expect(onAxis).toHaveLength(4);
      expect(onAxis.filter(arrow => position(arrow).x < 0)).toHaveLength(2);
      expect(onAxis.filter(arrow => position(arrow).x > 0)).toHaveLength(2);
      for (const arrow of onAxis) expect(Math.abs(position(arrow).x)).toBeLessThan(FIELD_VIEW.w / 2);
    });

    it('points the field back the other way where each closed line returns outside the winding', () => {
      const returning = draw(kind).arrows.filter(pointsLeft);

      expect(returning).toHaveLength(2 * closed.length);
      expect(returning.map(arrow => position(arrow)).filter(p => p.x !== 0)).toEqual([]);
      for (const line of closed) {
        expect(returning.filter(arrow => position(arrow).y === -(line.outer as number))).toHaveLength(2);
      }
    });

    it('has no arrow that points neither along the field nor back', () => {
      const { arrows } = draw(kind);
      expect(arrows.filter(arrow => !pointsRight(arrow) && !pointsLeft(arrow))).toEqual([]);
      expect(arrows).toHaveLength(4 + 2 * closed.length);
    });

    it('puts the probe at the centre of the drawing', () => {
      const probeDot = draw(kind).probe;

      expect(probeDot.tagName.toLowerCase()).toBe('circle');
      expect(probeDot).not.toHaveAttribute('cx');
      expect(probeDot).not.toHaveAttribute('cy');
      expect(probeDot.parentElement).toHaveAttribute('transform', `translate(${FIELD_VIEW.w / 2} ${FIELD_VIEW.h / 2})`);
    });

    it('is complete as rendered: nothing but the pulse ring starts out invisible', () => {
      const { all } = draw(kind);
      const invisible = all('svg *').filter(el => el.getAttribute('opacity') === '0' || el.style.opacity === '0' || el.style.visibility === 'hidden');

      expect(invisible.map(el => el.getAttribute('class'))).toEqual(['field-ring']);
    });

    it('draws the field in the primary green and the probe in the secondary cyan', () => {
      const { lines, probe: probeDot } = draw(kind);

      for (const line of lines) expect(line).toHaveAttribute('stroke', '#c8ff00');
      expect(probeDot).toHaveAttribute('fill', '#22d3ee');
    });

    // The bar's length is set in container-query units (cqw), which jsdom
    // discards, so only its label and the container it is sized against can be
    // checked here, not that the bar is true to scale.
    it('labels its scale bar and sizes it against the figure', () => {
      const { container } = draw(kind);

      expect(screen.getByText(`${bar} ซม.`)).toBeInTheDocument();
      expect(container.querySelector('figure')).toHaveClass('@container');
    });
  });

  describe('coil', () => {
    it('shows the wire at the top and bottom of the ring, on the ring', () => {
      const { all } = draw('coil');
      const ends = all('g.field-mark');

      expect(ends.map(g => g.getAttribute('transform'))).toEqual([
        `translate(0 ${-COIL_FIELD.radius})`,
        `translate(0 ${COIL_FIELD.radius})`,
      ]);
      expect(all('ellipse')).toHaveLength(1);
      expect(all('ellipse')[0]).toHaveAttribute('ry', String(COIL_FIELD.radius));
    });

    // Right-hand rule: with the field pointing right along the axis, the
    // current comes toward the viewer at the top of the ring (a dot) and goes
    // away at the bottom (a cross).
    it('marks the current direction that produces the field direction drawn', () => {
      const { all, arrows } = draw('coil');
      const [top, bottom] = all('g.field-mark');

      expect(arrows.filter(arrow => position(arrow).y === 0).every(pointsRight)).toBe(true);
      expect(top.querySelectorAll('circle')).toHaveLength(2);
      expect(top.querySelector('path')).toBeNull();
      expect(bottom.querySelectorAll('circle')).toHaveLength(1);
      expect(bottom.querySelector('path')).not.toBeNull();
    });
  });

  describe('solenoid', () => {
    const turns = () => draw('solenoid').all('g.field-mark circle');

    it('shows the 75 turns of the winding along both sides', () => {
      const dots = turns();
      const above = dots.filter(dot => Number(dot.getAttribute('cy')) === -SOLENOID_FIELD.radius);
      const below = dots.filter(dot => Number(dot.getAttribute('cy')) === SOLENOID_FIELD.radius);

      expect(above).toHaveLength(75);
      expect(below).toHaveLength(75);
      expect(dots).toHaveLength(150);
    });

    it('spreads the turns evenly from one end of the solenoid to the other', () => {
      const xs = turns().slice(0, 75).map(dot => Number(dot.getAttribute('cx')));

      expect(xs[0]).toBe(-SOLENOID_FIELD.halfLength);
      expect(xs[74]).toBe(SOLENOID_FIELD.halfLength);
      const gap = (2 * SOLENOID_FIELD.halfLength) / 74;
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(gap, 0);
    });

    it('has no single-coil ring or wire ends', () => {
      const { all } = draw('solenoid');
      expect(all('ellipse')).toHaveLength(0);
      expect(all('g.field-mark path')).toHaveLength(0);
    });
  });
});
