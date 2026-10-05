import { act } from '@testing-library/react';

export type Reply = { status?: number; body?: unknown };
export type Call = { method: string; url: string; body: unknown };
export type Handler = (call: Call) => Reply | Promise<Reply>;

// Replaces fetch with `handler` and records every request. jsdom has no
// Response, so the reply is the small part of one that the app reads.
export function mockFetch(handler: Handler) {
  const calls: Call[] = [];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      url: String(input),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const { status = 200, body = {} } = await handler(call);
    // A real reply is parsed afresh on every read, so the app never gets the
    // same object twice; handing back the handler's own object would hide
    // re-renders that happen in the browser.
    const wire = JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(wire) } as Response;
  });
  return {
    calls,
    requests: () => calls.map(c => `${c.method} ${c.url}`),
    clear: () => { calls.length = 0; },
  };
}

// Lets pending promises and anything due within `ms` of fake time run.
export async function advance(ms = 0) {
  await act(async () => { await jest.advanceTimersByTimeAsync(ms); });
}
