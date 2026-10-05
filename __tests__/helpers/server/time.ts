// Fixes the clock (Date.now, new Date) at a given moment. Only the clock is
// faked: reading a request body and awaiting promises rely on the real
// microtask and immediate queues, so those stay untouched.
export function freezeTime(at: string | number): void {
  jest.useFakeTimers({
    now: typeof at === 'number' ? at : Date.parse(at),
    doNotFake: [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask',
      'requestAnimationFrame', 'cancelAnimationFrame',
      'requestIdleCallback', 'cancelIdleCallback',
      'setImmediate', 'clearImmediate',
      'setInterval', 'clearInterval',
      'setTimeout', 'clearTimeout',
    ],
  });
}

export function moveTimeTo(at: string | number): void {
  jest.setSystemTime(typeof at === 'number' ? at : Date.parse(at));
}

export function restoreTime(): void {
  jest.useRealTimers();
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
