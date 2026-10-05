// Adds the DOM matchers (toBeInTheDocument, toHaveTextContent, …) to every test.
import '@testing-library/jest-dom';

// No test may reach a real service. Firestore, Firebase Auth and the network
// throw unless the test replaces them: jest.mock('@/lib/firebase-admin', …) in
// the test file, and an assignment or jest.spyOn for globalThis.fetch.
jest.mock('@/lib/firebase-admin', () => {
  const refuse = (name: string) => new Proxy({}, {
    get(_target, key) {
      if (typeof key === 'symbol') return undefined;
      throw new Error(`${name}.${key} was used without a mock: add jest.mock('@/lib/firebase-admin', …) to this test file`);
    },
  });
  return { adminDb: refuse('adminDb'), adminAuth: refuse('adminAuth') };
});

beforeEach(() => {
  globalThis.fetch = jest.fn(() => Promise.reject(new Error('fetch was called without a mock in this test')));
});
