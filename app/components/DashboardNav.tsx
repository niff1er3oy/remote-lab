'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type User = { name: string; email: string; role: string };

const ROLE_LABELS: Record<string, string> = {
  student: 'นักศึกษา', researcher: 'นักวิจัย', instructor: 'อาจารย์', other: 'ผู้ใช้ทั่วไป',
};

export default function DashboardNav({ user }: { user: User }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <nav className="relative z-10 h-16 px-6 flex items-center justify-between border-b border-white/10 bg-gray-950/80 backdrop-blur-md sticky top-0">
      <Link href="/" className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-[#c8ff00] flex items-center justify-center"
          style={{ boxShadow: '0 0 16px rgba(200,255,0,0.5)' }}>
          <FlaskIcon />
        </div>
        <span className="text-lg font-semibold tracking-tight">Remote<span className="text-[#c8ff00]">Lab</span></span>
      </Link>

      <div className="flex items-center gap-3">
        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="flex items-center gap-2.5 rounded-full border border-white/10 bg-gray-900/60 pl-1 pr-3 py-1 hover:border-[#c8ff00]/30 transition-colors"
          >
            <div className="h-6 w-6 rounded-full bg-[#c8ff00]/20 border border-[#c8ff00]/40 flex items-center justify-center text-[11px] font-bold text-[#c8ff00]">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-white max-w-[120px] truncate">{user.name}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={`text-gray-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 w-52 rounded-xl border border-white/10 bg-gray-900 shadow-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/[0.06]">
                  <p className="text-xs font-semibold text-white truncate">{user.name}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{ROLE_LABELS[user.role] ?? user.role}</p>
                </div>
                <Link href="/dashboard" onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors">
                  <GridIcon /> แดชบอร์ด
                </Link>
                <div className="border-t border-white/[0.06]" />
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors">
                  <LogoutIcon /> ออกจากระบบ
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function FlaskIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#030712" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6M9 3v7l-5 9h16l-5-9V3" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
    </svg>
  );
}
