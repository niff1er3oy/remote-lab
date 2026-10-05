// A stand-in for anime.js that starts nothing, so no test waits on a frame.
// Use it as: jest.mock('animejs', () => jest.requireActual('<path>/anime').animeMock())
export function animeMock() {
  return {
    animate: jest.fn(() => ({ pause: jest.fn(), revert: jest.fn() })),
    stagger: jest.fn(() => 0),
    scrambleText: jest.fn(() => ''),
    morphTo: jest.fn((target: unknown) => ({ morphTo: target })),
    onScroll: jest.fn(() => ({ revert: jest.fn() })),
    utils: { set: jest.fn() },
  };
}

export type AnimeMock = ReturnType<typeof animeMock>;
