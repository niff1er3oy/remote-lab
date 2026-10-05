import { render, screen } from '@testing-library/react';
import SlideIn from '@/app/components/SlideIn';
import { REDUCED_MOTION } from '@/lib/motion';
import type { AnimeMock } from '../helpers/client/anime';
import { installMatchMedia } from '../helpers/client/matchMedia';

jest.mock('animejs', () => jest.requireActual<typeof import('../helpers/client/anime')>('../helpers/client/anime').animeMock());

const anime = jest.requireMock<AnimeMock>('animejs');

type Slide = { opacity: number[]; translateY: number[] };
const slide = () => (anime.animate.mock.calls[0] as unknown as [HTMLElement, Slide]);

beforeEach(() => {
  jest.clearAllMocks();
  installMatchMedia();
});

describe('SlideIn', () => {
  it('renders its children in a div that keeps the props it was given', () => {
    render(<SlideIn role="status" className="panel" data-kind="result">saved</SlideIn>);

    const panel = screen.getByRole('status');
    expect(panel).toHaveTextContent('saved');
    expect(panel).toHaveClass('panel');
    expect(panel).toHaveAttribute('data-kind', 'result');
    expect(panel).not.toHaveAttribute('from');
  });

  it('slides the panel into its resting place and ends fully visible', () => {
    render(<SlideIn role="status">saved</SlideIn>);

    expect(anime.animate).toHaveBeenCalledTimes(1);
    const [target, params] = slide();
    expect(target).toBe(screen.getByRole('status'));
    expect(params.opacity).toEqual([0, 1]);
    expect(params.translateY[0]).toBeLessThan(0);
    expect(params.translateY[1]).toBe(0);
  });

  it('starts from the offset it is given', () => {
    render(<SlideIn from={20}>saved</SlideIn>);
    expect(slide()[1].translateY).toEqual([20, 0]);
  });

  it('stays still when motion is reduced', () => {
    installMatchMedia({ [REDUCED_MOTION]: true });
    render(<SlideIn role="status">saved</SlideIn>);

    expect(anime.animate).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('saved');
  });

  it('stops the animation when the panel is removed mid-slide', () => {
    const { unmount } = render(<SlideIn>saved</SlideIn>);
    const entering = anime.animate.mock.results[0].value as { pause: jest.Mock };
    expect(entering.pause).not.toHaveBeenCalled();

    unmount();

    expect(entering.pause).toHaveBeenCalledTimes(1);
  });
});
