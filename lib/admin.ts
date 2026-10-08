import { getSessionUser, type SessionUser } from '@/lib/session';

// Who may use the admin page and its API. Admins are named by email in the
// ADMIN_EMAILS environment variable (comma separated), so adding or removing
// one is a change of configuration, not of data. Every sign-in is a Google
// account, whose email Google has verified.
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(user: SessionUser | null): boolean {
  const email = user?.email?.trim().toLowerCase();
  return !!email && adminEmails().includes(email);
}

/** The signed-in user when they are an admin, otherwise null. */
export async function getAdminUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return isAdmin(user) ? user : null;
}
