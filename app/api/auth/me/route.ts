import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { isAdmin } from '@/lib/admin';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  return NextResponse.json({ ok: true, user: { name: user.name, email: user.email, role: user.role, is_admin: isAdmin(user) } });
}
