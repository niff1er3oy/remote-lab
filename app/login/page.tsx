'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, stagger, scrambleText } from 'animejs';
import Image from 'next/image';
import Link from 'next/link';
import { establishSession, establishGoogleSession, authErrorMessage } from '@/lib/auth-client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const navRef    = useRef<HTMLElement>(null);
  const cardRef   = useRef<HTMLDivElement>(null);
  const titleRef  = useRef<HTMLHeadingElement>(null);
  const subRef    = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (navRef.current)
      animate(navRef.current,  { opacity: [0, 1], translateY: [-16, 0], duration: 500, ease: 'outCubic' });
    if (subRef.current)
      animate(subRef.current,  { opacity: [0, 1], translateY: [12, 0],  duration: 500, delay: 120, ease: 'outCubic' });
    if (titleRef.current) {
      animate(titleRef.current, { opacity: [0, 1], translateY: [16, 0], duration: 550, ease: 'outCubic' });
      animate(titleRef.current, { innerHTML: scrambleText({ chars: 'braille', from: 'left', override: '' }) });
    }
    if (cardRef.current) {
      animate(cardRef.current, { opacity: [0, 1], translateY: [24, 0], scale: [0.97, 1], duration: 600, delay: 180, ease: 'outCubic' });
      const items = cardRef.current.querySelectorAll('.fi');
      animate(items, { opacity: [0, 1], translateY: [14, 0], duration: 420, delay: stagger(65, { start: 320 }), ease: 'outCubic' });
    }
  }, []);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!email || !password) { setError('กรุณากรอกข้อมูลให้ครบ'); return; }
    setError('');
    setLoading(true);
    try {
      await establishSession(email, password);
      window.location.href = '/dashboard';
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError('');
    setGoogleLoading(true);
    try {
      await establishGoogleSession();
      window.location.href = '/dashboard';
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#030712] flex flex-col">
      {/* Background grid */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(200,255,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.03) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }} />

      {/* Navbar */}
      <nav ref={navRef} className="relative z-10 h-14 px-6 flex items-center justify-between border-b border-white/[0.06]" style={{ opacity: 0 }}>
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.svg" width={28} height={28} alt="PaNa LabS" className="rounded-lg" />
          <span className="text-sm font-semibold">PaNa<span className="text-[#c8ff00]">LabS</span></span>
        </Link>
        <Link href="/signup" className="text-sm text-gray-400 hover:text-white transition-colors">
          ยังไม่มีบัญชี? <span className="text-[#c8ff00]">สมัครเลย</span>
        </Link>
      </nav>

      {/* Form */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 ref={titleRef} className="text-2xl font-bold tracking-tight text-white" style={{ opacity: 0 }}>เข้าสู่ระบบ</h1>
            <p ref={subRef} className="mt-1.5 text-sm text-gray-500" style={{ opacity: 0 }}>เข้าถึงห้องปฏิบัติการของคุณ</p>
          </div>

          {/* Card */}
          <div ref={cardRef} className="rounded-2xl border border-white/10 bg-gray-900/50 backdrop-blur-sm p-7" style={{ opacity: 0 }}>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Email */}
              <div className="fi" style={{ opacity: 0 }}>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">อีเมล</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@university.ac.th"
                  autoComplete="email"
                  className="w-full rounded-xl bg-gray-950/80 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-gray-600
                    focus:outline-none focus:border-[#c8ff00]/50 focus:ring-1 focus:ring-[#c8ff00]/20 transition-colors"
                />
              </div>

              {/* Password */}
              <div className="fi" style={{ opacity: 0 }}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-400">รหัสผ่าน</label>
                  <Link href="#" className="text-xs text-gray-500 hover:text-[#c8ff00] transition-colors">
                    ลืมรหัสผ่าน?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full rounded-xl bg-gray-950/80 border border-white/10 px-3.5 py-2.5 pr-10 text-sm text-white placeholder-gray-600
                      focus:outline-none focus:border-[#c8ff00]/50 focus:ring-1 focus:ring-[#c8ff00]/20 transition-colors"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                    {showPw ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {/* Remember */}
              <label className="fi flex items-center gap-2.5 cursor-pointer select-none" style={{ opacity: 0 }}>
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors
                  ${remember ? 'bg-[#c8ff00] border-[#c8ff00]' : 'border-white/20 bg-gray-950/60'}`}
                  onClick={() => setRemember(v => !v)}>
                  {remember && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#030712" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-400">จดจำฉันไว้</span>
              </label>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-2.5 text-sm text-red-400 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/>
                  </svg>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button type="submit" disabled={loading}
                className="fi w-full rounded-xl bg-[#c8ff00] py-2.5 text-sm font-semibold text-gray-950
                  hover:bg-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2"
                style={{ opacity: 0, boxShadow: '0 0 24px rgba(200,255,0,0.25)' }}
                onMouseEnter={e => animate(e.currentTarget, { scale: [1, 1.02], duration: 160, ease: 'outBack' })}
                onMouseLeave={e => animate(e.currentTarget, { scale: [1.02, 1], duration: 160, ease: 'outCubic' })}>
                {loading ? (
                  <>
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                    กำลังตรวจสอบ…
                  </>
                ) : 'เข้าสู่ระบบ'}
              </button>
            </form>

            {/* Divider */}
            <div className="fi flex items-center gap-3 my-5" style={{ opacity: 0 }}>
              <div className="flex-1 h-px bg-white/[0.08]" />
              <span className="text-xs text-gray-600">หรือ</span>
              <div className="flex-1 h-px bg-white/[0.08]" />
            </div>

            {/* Social */}
            <div className="fi" style={{ opacity: 0 }}>
              <SocialButton icon={<GoogleIcon />} label="เข้าสู่ระบบด้วย Google" onClick={handleGoogleLogin} loading={googleLoading} />
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-gray-600">
            ยังไม่มีบัญชี?{' '}
            <Link href="/signup" className="text-[#c8ff00] hover:text-white transition-colors font-medium">
              สมัครใช้งานฟรี
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function SocialButton({ icon, label, onClick, loading }: { icon: React.ReactNode; label: string; onClick: () => void; loading: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-gray-950/60 py-2.5 text-sm text-gray-300 hover:border-white/20 hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
      {loading ? (
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
      ) : icon}
      {label}
    </button>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
