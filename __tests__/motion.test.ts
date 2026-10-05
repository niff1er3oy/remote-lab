import { REDUCED_MOTION, all, prefersReducedMotion, press, revealOnScroll, riseIn } from '@/lib/motion';
import { installMatchMedia } from './helpers/client/matchMedia';

type ScrollOptions = { target: HTMLElement; enter: string; onEnter: () => void };
type Keyframe = { to: number; duration: number; ease: string };

// anime.js is replaced so nothing depends on frame timing. utils.set still
// writes the style it was asked for, so a test can look at the element itself.
jest.mock('animejs', () => ({
  animate: jest.fn(),
  stagger: jest.fn((gap: number, options?: { start?: number }) => ({ gap, start: options?.start })),
  onScroll: jest.fn(() => ({ revert: jest.fn() })),
  utils: {
    set: jest.fn((nodes: NodeListOf<HTMLElement>, styles: Record<string, string | number>) => {
      nodes.forEach(node => {
        for (const [key, value] of Object.entries(styles)) node.style.setProperty(key, String(value));
      });
    }),
  },
}));

const anime = jest.requireMock<{
  animate: jest.Mock;
  stagger: jest.Mock;
  onScroll: jest.Mock;
  utils: { set: jest.Mock };
}>('animejs');

const VIEWPORT = 800;

function section(top: number) {
  document.body.innerHTML = '<section><p class="item">one</p><p class="item">two</p><p class="other">three</p></section>';
  const target = document.querySelector('section') as HTMLElement;
  target.getBoundingClientRect = () => ({ top } as DOMRect);
  return { target, items: target.querySelectorAll<HTMLElement>('.item') };
}

const hiddenCount = (items: NodeListOf<HTMLElement>) => [...items].filter(el => el.style.opacity === '0').length;

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: VIEWPORT });
});

describe('prefersReducedMotion', () => {
  it('reports the visitor\'s reduced-motion setting', () => {
    const media = installMatchMedia({ [REDUCED_MOTION]: true });
    expect(prefersReducedMotion()).toBe(true);
    media.set(REDUCED_MOTION, false);
    expect(prefersReducedMotion()).toBe(false);
    expect(new Set(media.queries)).toEqual(new Set(['(prefers-reduced-motion: reduce)']));
  });
});

describe('all', () => {
  it('finds the matching elements inside the given root only', () => {
    document.body.innerHTML = '<div id="root"><p class="item">in</p><p>skip</p></div><p class="item">outside</p>';
    const found = all(document.getElementById('root') as HTMLElement, '.item');
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveTextContent('in');
  });
});

describe('revealOnScroll', () => {
  it('leaves the content visible and starts nothing when motion is reduced', () => {
    installMatchMedia({ [REDUCED_MOTION]: true });
    const { target, items } = section(VIEWPORT + 500);
    const play = jest.fn();

    const stop = revealOnScroll(target, items, play);

    expect(hiddenCount(items)).toBe(0);
    expect(anime.onScroll).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });

  it('leaves the content visible when the target is already on screen', () => {
    installMatchMedia();
    const { target, items } = section(VIEWPORT - 1);

    const stop = revealOnScroll(target, items, jest.fn());

    expect(hiddenCount(items)).toBe(0);
    expect(anime.onScroll).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });

  it('leaves the content visible when the target is above the screen', () => {
    installMatchMedia();
    const { target, items } = section(-1200);

    revealOnScroll(target, items, jest.fn());

    expect(hiddenCount(items)).toBe(0);
    expect(anime.onScroll).not.toHaveBeenCalled();
  });

  it('hides only the given elements while the target is below the screen', () => {
    installMatchMedia();
    const { target, items } = section(VIEWPORT);
    const play = jest.fn();

    revealOnScroll(target, items, play);

    expect(hiddenCount(items)).toBe(2);
    expect((target.querySelector('.other') as HTMLElement).style.opacity).toBe('');
    expect(target.style.opacity).toBe('');
    expect(play).not.toHaveBeenCalled();
  });

  it('plays once when the target scrolls into view, however often it re-enters', () => {
    installMatchMedia();
    const { target, items } = section(VIEWPORT + 500);
    const play = jest.fn();

    revealOnScroll(target, items, play);

    expect(anime.onScroll).toHaveBeenCalledTimes(1);
    const options = anime.onScroll.mock.calls[0][0] as ScrollOptions;
    expect(options.target).toBe(target);
    options.onEnter();
    options.onEnter();
    options.onEnter();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('stops watching the scroll position when cleaned up', () => {
    installMatchMedia();
    const { target, items } = section(VIEWPORT + 500);

    const stop = revealOnScroll(target, items, jest.fn());
    const observer = anime.onScroll.mock.results[0].value as { revert: jest.Mock };
    expect(observer.revert).not.toHaveBeenCalled();
    stop();

    expect(observer.revert).toHaveBeenCalledTimes(1);
  });
});

describe('riseIn', () => {
  it('animates the elements from hidden and lowered to fully visible and in place', () => {
    const { items } = section(0);

    riseIn(items);

    expect(anime.animate).toHaveBeenCalledTimes(1);
    const [targets, params] = anime.animate.mock.calls[0] as [NodeList, { opacity: number[]; translateY: number[] }];
    expect(targets).toBe(items);
    expect(params.opacity).toEqual([0, 1]);
    expect(params.translateY[0]).toBeGreaterThan(0);
    expect(params.translateY[1]).toBe(0);
  });

  it('staggers the elements, starting immediately unless a delay is given', () => {
    const { items } = section(0);

    riseIn(items);
    riseIn(items, 250);

    const delays = anime.animate.mock.calls.map(call => (call[1] as { delay: { gap: number; start: number } }).delay);
    expect(delays[0].gap).toBeGreaterThan(0);
    expect(delays[0].start).toBe(0);
    expect(delays[1].start).toBe(250);
  });

  it('returns the animation so the caller can control it', () => {
    const animation = { pause: jest.fn() };
    anime.animate.mockReturnValueOnce(animation);
    expect(riseIn(section(0).items)).toBe(animation);
  });
});

describe('press', () => {
  const scaleSteps = () => (anime.animate.mock.calls[0][1] as { scale: Keyframe[] }).scale;

  it('does nothing when motion is reduced', () => {
    installMatchMedia({ [REDUCED_MOTION]: true });
    press(document.createElement('button'));
    expect(anime.animate).not.toHaveBeenCalled();
  });

  it('dips the element and brings it back to full size', () => {
    installMatchMedia();
    const button = document.createElement('button');

    press(button);

    expect(anime.animate.mock.calls[0][0]).toBe(button);
    const steps = scaleSteps();
    expect(steps[0].to).toBeLessThan(1);
    expect(steps[steps.length - 1].to).toBe(1);
  });

  it('swells instead of dipping when given a size above 1, and still settles at full size', () => {
    installMatchMedia();

    press(document.createElement('button'), 1.12);

    const steps = scaleSteps();
    expect(steps[0].to).toBe(1.12);
    expect(steps[steps.length - 1].to).toBe(1);
  });
});
