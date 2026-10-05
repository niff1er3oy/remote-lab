import { getSessionUser, type SessionUser } from '@/lib/session';

// For test files that replace the session module with
//   jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));

export const STUDENT: SessionUser = {
  uid: 'student-1',
  email: 'student@example.com',
  name: 'Student One',
  role: 'student',
};

export function signInAs(user: SessionUser = STUDENT): void {
  jest.mocked(getSessionUser).mockResolvedValue(user);
}

export function signOut(): void {
  jest.mocked(getSessionUser).mockResolvedValue(null);
}
