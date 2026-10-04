import { animate, onScroll, stagger, utils } from 'animejs';

// Shared anime.js helpers for pages that bring content in as it is reached.
// Browser-only: call these from effects and event handlers.

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;

export const all = (root: HTMLElement, selector: string) => root.querySelectorAll(selector);

// Hides `hidden`, then calls `play` the first time `target` scrolls into view.
// Nothing is hidden — the content just stays put — when the visitor asked for
// reduced motion, or when `target` is already on screen (or above it) at load.
export function revealOnScroll(target: HTMLElement, hidden: NodeList, play: () => void) {
  if (prefersReducedMotion()) return () => {};
  if (target.getBoundingClientRect().top < window.innerHeight) return () => {};
  utils.set(hidden, { opacity: 0 });
  let played = false;
  const observer = onScroll({
    target,
    enter: 'bottom-=80 top',
    onEnter: () => {
      if (played) return;
      played = true;
      play();
    },
  });
  return () => { observer.revert(); };
}

export const riseIn = (els: NodeList, start = 0) =>
  animate(els, { opacity: [0, 1], translateY: [24, 0], duration: 600, delay: stagger(90, { start }), ease: 'outCubic' });

// The give a tile has under the pointer: it dips to `dip`, then springs back.
// A `dip` above 1 makes it swell instead, for something that just succeeded.
export function press(el: HTMLElement | SVGElement, dip = 0.86) {
  if (prefersReducedMotion()) return;
  animate(el, {
    scale: [{ to: dip, duration: 100, ease: 'outQuad' }, { to: 1, duration: 480, ease: 'outElastic(1, .6)' }],
  });
}
