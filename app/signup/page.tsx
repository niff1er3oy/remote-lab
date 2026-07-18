'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, stagger, scrambleText } from 'animejs';
import Image from 'next/image';
import Link from 'next/link';
import { establishSession } from '@/lib/auth-client';

const ROLES = [
  { value: 'student',     label: 'นักศึกษา' },
  { value: 'researcher',  label: 'นักวิจัย' },
  { value: 'instructor',  label: 'อาจารย์ / ผู้สอน' },
  { value: 'other',       label: 'อื่นๆ' },
];

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);

  const navRef   = useRef<HTMLElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subRef   = useRef<HTMLParagraphElement>(null);
  const cardRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (navRef.current)
      animate(navRef.current,  { opacity: [0, 1], translateY: [-16, 0], duration: 500, ease: 'outCubic' });
    if (badgeRef.current)
      animate(badgeRef.current, { opacity: [0, 1], scale: [0.9, 1], duration: 450, delay: 80, ease: 'outBack' });
    if (titleRef.current) {
      animate(titleRef.current, { opacity: [0, 1], translateY: [16, 0], duration: 550, delay: 150, ease: 'outCubic' });
      animate(titleRef.current, { innerHTML: scrambleText({ chars: 'braille', from: 'left', override: '' }), delay: 150 });
    }
    if (subRef.current)
      animate(subRef.current,  { opacity: [0, 1], translateY: [10, 0], duration: 450, delay: 240, ease: 'outCubic' });
    if (cardRef.current) {
      animate(cardRef.current, { opacity: [0, 1], translateY: [28, 0], scale: [0.97, 1], duration: 600, delay: 200, ease: 'outCubic' });
      const items = cardRef.current.querySelectorAll('.fi');
      animate(items, { opacity: [0, 1], translateY: [14, 0], duration: 420, delay: stagger(60, { start: 350 }), ease: 'outCubic' });
    }
  }, []);

  const strength = passwordStrength(password);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('กรุณากรอกชื่อ-นามสกุล'); return; }
    if (!email.includes('@')) { setError('รูปแบบอีเมลไม่ถูกต้อง'); return; }
    if (!role) { setError('กรุณาเลือกประเภทบัญชี'); return; }
    if (password.length < 8) { setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; }
    if (password !== confirmPw) { setError('รหัสผ่านไม่ตรงกัน'); return; }
    if (!agree) { setError('กรุณายอมรับเงื่อนไขการใช้งาน'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? 'เกิดข้อผิดพลาด');
        return;
      }
      await establishSession(email, password);
      window.location.href = '/dashboard';
    } catch {
      setError('ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#030712] flex flex-col">
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
        <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
          มีบัญชีอยู่แล้ว? <span className="text-[#c8ff00]">เข้าสู่ระบบ</span>
        </Link>
      </nav>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-7">
            <div ref={badgeRef} className="inline-flex items-center gap-2 rounded-full border border-[#c8ff00]/25 bg-[#c8ff00]/8 px-3.5 py-1 text-xs font-semibold text-[#c8ff00] mb-4" style={{ opacity: 0 }}>
              <span className="h-1.5 w-1.5 rounded-full bg-[#c8ff00] inline-block animate-pulse" />
              ทดลองใช้ฟรี 30 วัน
            </div>
            <h1 ref={titleRef} className="text-2xl font-bold text-white" style={{ opacity: 0 }}>สร้างบัญชีใหม่</h1>
            <p ref={subRef} className="mt-1.5 text-sm text-gray-500" style={{ opacity: 0 }}>เริ่มต้นทดลองวิทยาศาสตร์จากทุกที่</p>
          </div>

          {/* Card */}
          <div ref={cardRef} className="rounded-2xl border border-white/10 bg-gray-900/50 backdrop-blur-sm p-7" style={{ opacity: 0 }}>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Name */}
              <div className="fi" style={{ opacity: 0 }}>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">ชื่อ-นามสกุล</label>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="ชื่อ นามสกุล" autoComplete="name"
                  className={inputCls}
                />
              </div>

              {/* Email */}
              <div className="fi" style={{ opacity: 0 }}>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">อีเมล</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@university.ac.th" autoComplete="email"
                  className={inputCls}
                />
              </div>

              {/* Role */}
              <div className="fi" style={{ opacity: 0 }}>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">ประเภทบัญชี</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map(r => (
                    <button key={r.value} type="button" onClick={() => setRole(r.value)}
                      className={`rounded-xl border py-2 text-sm transition-colors text-left px-3 ${
                        role === r.value
                          ? 'border-[#c8ff00]/50 bg-[#c8ff00]/10 text-[#c8ff00]'
                          : 'border-white/10 bg-gray-950/60 text-gray-400 hover:border-white/20 hover:text-gray-300'
                      }`}>
                      {role === r.value && <span className="mr-1.5 text-[#c8ff00]">✓</span>}
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Password */}
              <div className="fi" style={{ opacity: 0 }}>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">รหัสผ่าน</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="อย่างน้อย 8 ตัวอักษร" autoComplete="new-password"
                    className={inputCls + ' pr-10'}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                    {showPw ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {/* Strength bar */}
                {password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map(n => (
                        <div key={n} className={`h-1 flex-1 rounded-full transition-colors ${
                          n <= strength.score
                            ? strength.score <= 1 ? 'bg-red-500'
                            : strength.score <= 2 ? 'bg-yellow-500'
                            : strength.score <= 3 ? 'bg-blue-400'
                            : 'bg-[#c8ff00]'
                            : 'bg-white/10'
                        }`} />
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-600">{strength.label}</p>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div className="fi" style={{ opacity: 0 }}>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">ยืนยันรหัสผ่าน</label>
                <input
                  type={showPw ? 'text' : 'password'} value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="••••••••" autoComplete="new-password"
                  className={inputCls + (confirmPw && confirmPw !== password ? ' border-red-500/50 focus:border-red-500/70' : '')}
                />
                {confirmPw && confirmPw !== password && (
                  <p className="mt-1 text-[10px] text-red-400">รหัสผ่านไม่ตรงกัน</p>
                )}
              </div>

              {/* Terms */}
              <label className="fi flex items-start gap-2.5 cursor-pointer select-none" style={{ opacity: 0 }}>
                <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors
                  ${agree ? 'bg-[#c8ff00] border-[#c8ff00]' : 'border-white/20 bg-gray-950/60'}`}
                  onClick={() => setAgree(v => !v)}>
                  {agree && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#030712" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-400 leading-5">
                  ฉันยอมรับ{' '}
                  <Link href="/terms" className="text-[#c8ff00] hover:text-white transition-colors">เงื่อนไขการใช้งาน</Link>
                  {' '}และ{' '}
                  <Link href="/privacy" className="text-[#c8ff00] hover:text-white transition-colors">นโยบายความเป็นส่วนตัว</Link>
                </span>
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
                    กำลังสร้างบัญชี…
                  </>
                ) : 'สร้างบัญชีฟรี'}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-gray-600">
            มีบัญชีอยู่แล้ว?{' '}
            <Link href="/login" className="text-[#c8ff00] hover:text-white transition-colors font-medium">
              เข้าสู่ระบบ
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls = `w-full rounded-xl bg-gray-950/80 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-gray-600
  focus:outline-none focus:border-[#c8ff00]/50 focus:ring-1 focus:ring-[#c8ff00]/20 transition-colors`;

function passwordStrength(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: '' };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['', 'อ่อนมาก', 'อ่อน', 'ปานกลาง', 'แข็งแกร่ง'];
  return { score, label: labels[score] };
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
