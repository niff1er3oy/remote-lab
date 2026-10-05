import { render, screen } from '@testing-library/react';
import PortraitGuard from '@/app/components/PortraitGuard';
import type { AnimeMock } from '../helpers/client/anime';

jest.mock('animejs', () => jest.requireActual<typeof import('../helpers/client/anime')>('../helpers/client/anime').animeMock());

const anime = jest.requireMock<AnimeMock>('animejs');

type Morph = { d: { morphTo: SVGPathElement }; loop: boolean; alternate: boolean };

beforeEach(() => {
  jest.clearAllMocks();
});

// Whether the guard is on screen is decided by a CSS orientation query, which
// jsdom does not evaluate; these tests cover what it says and what it animates.
describe('PortraitGuard', () => {
  it('asks the visitor to turn the device to landscape', () => {
    render(<PortraitGuard />);

    expect(screen.getByText('กรุณาหมุนหน้าจอ')).toBeInTheDocument();
    expect(screen.getByText(/Landscape/)).toBeInTheDocument();
    expect(screen.getByText('หมุนอุปกรณ์เพื่อดูเนื้อหา')).toBeInTheDocument();
  });

  it('draws one device outline and keeps the shape it turns into out of sight', () => {
    const { container } = render(<PortraitGuard />);

    const [target, body] = [...container.querySelectorAll('path')];
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(target).toHaveStyle({ visibility: 'hidden' });
    expect(body).not.toHaveStyle({ visibility: 'hidden' });
    expect(body.getAttribute('d')).not.toBe(target.getAttribute('d'));
  });

  it('turns the visible outline into the hidden one and back, over and over', () => {
    const { container } = render(<PortraitGuard />);
    const [target, body] = [...container.querySelectorAll('path')];

    expect(anime.animate).toHaveBeenCalledTimes(1);
    const [animated, params] = anime.animate.mock.calls[0] as unknown as [SVGPathElement, Morph];
    expect(animated).toBe(body);
    expect(params.d.morphTo).toBe(target);
    expect(params.loop).toBe(true);
    expect(params.alternate).toBe(true);
  });
});
