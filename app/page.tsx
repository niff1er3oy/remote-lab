'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, createDrawable, scrambleText, stagger, utils } from 'animejs';
import Image from 'next/image';
import Link from 'next/link';
import BookingCalendar from './components/BookingCalendar';
import FieldDiagram from './components/FieldDiagram';
import { all, prefersReducedMotion, revealOnScroll, riseIn } from '@/lib/motion';
import { calcBSolenoid, SOLENOID } from '@/lib/physics';

export default function Home() {
  return (
    <>
      {/* Main content — landscape only */}
      <div className="flex portrait:hidden flex-col min-h-full">
        <Navbar />
        <main className="flex-1">
          <Hero />
          <BookingCalendar />
          <Experiment />
          <HowItWorks />
        </main>
        <Footer />
      </div>
    </>
  );
}

const ROLE_LABELS: Record<string, string> = {
  student: 'นักศึกษา', researcher: 'นักวิจัย', instructor: 'อาจารย์', other: 'ผู้ใช้ทั่วไป',
};

const NAV_LINKS = [
  { href: '#booking', label: 'จองเวลา' },
  { href: '#experiment', label: 'การทดลอง' },
  { href: '#how-it-works', label: 'ขั้นตอน' },
];

const HANDOUT_URL = `/doc/lab8/${encodeURIComponent('การทดลองที่ 08.pdf')}`;

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c8ff00]';

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; role: string; is_admin?: boolean } | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setUser(d.user); })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setUserMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" width={32} height={32} alt="PaNa LabS" className="rounded-lg" />
            <span className="text-lg font-semibold tracking-tight">
              PaNa<span className="text-[#c8ff00]">LabS</span>
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            {NAV_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} className={`hover:text-white transition-colors ${FOCUS_RING}`}>{label}</Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(v => !v)}
                  className="flex items-center gap-2.5 rounded-full border border-white/10 bg-gray-900/60 pl-1 pr-3 py-1 hover:border-[#c8ff00]/30 transition-colors"
                >
                  <div className="h-6 w-6 rounded-full bg-[#c8ff00]/20 border border-[#c8ff00]/40 flex items-center justify-center text-[11px] font-bold text-[#c8ff00]">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-white max-w-[120px] truncate">{user.name}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`text-gray-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}>
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>

                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 z-20 w-52 rounded-xl border border-white/10 bg-gray-900 shadow-2xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-white/[0.06]">
                        <p className="text-xs font-semibold text-white truncate">{user.name}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{ROLE_LABELS[user.role] ?? user.role}</p>
                      </div>
                      <Link href="/dashboard" onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                          <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                        </svg>
                        แดชบอร์ด
                      </Link>
                      {user.is_admin && (
                        <Link href="/admin" onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6l8-3z"/>
                          </svg>
                          ผู้ดูแลระบบ
                        </Link>
                      )}
                      <div className="border-t border-white/[0.06]" />
                      <button onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                        </svg>
                        ออกจากระบบ
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className={`rounded-full bg-[#c8ff00] px-4 py-2 text-sm font-medium text-gray-950 hover:bg-white transition-colors ${FOCUS_RING}`}
                style={{ boxShadow: '0 0 20px rgba(200,255,0,0.35)' }}
              >
                เข้าสู่ระบบ
              </Link>
            )}
          </div>

          <button
            className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <XIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-gray-950/95 backdrop-blur-md">
          <div className="mx-auto max-w-7xl px-6 py-4 flex flex-col gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="py-3 text-sm text-gray-400 hover:text-white transition-colors border-b border-white/5"
                onClick={() => setMobileOpen(false)}
              >
                {label}
              </Link>
            ))}
            <div className="pt-4 flex flex-col gap-3">
              {user ? (
                <>
                  <Link href="/dashboard" onClick={() => setMobileOpen(false)}
                    className="text-center py-2.5 text-sm text-white transition-colors">
                    แดชบอร์ด
                  </Link>
                  {user.is_admin && (
                    <Link href="/admin" onClick={() => setMobileOpen(false)}
                      className="text-center py-2.5 text-sm text-white transition-colors">
                      ผู้ดูแลระบบ
                    </Link>
                  )}
                  <button onClick={() => { handleLogout(); setMobileOpen(false); }}
                    className="text-center py-2.5 text-sm text-red-400 hover:text-red-300 transition-colors">
                    ออกจากระบบ
                  </button>
                </>
              ) : (
                <Link href="/login" onClick={() => setMobileOpen(false)}
                  className="text-center rounded-full bg-[#c8ff00] px-4 py-2.5 text-sm font-medium text-gray-950 hover:bg-white transition-colors"
                  style={{ boxShadow: '0 0 20px rgba(200,255,0,0.35)' }}>
                  เข้าสู่ระบบ
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const lines = root.querySelectorAll<HTMLElement>('.hero-line');
    const rest = root.querySelectorAll<HTMLElement>('.hero-rise');

    if (prefersReducedMotion()) {
      [...lines, ...rest].forEach(el => { el.style.opacity = '1'; });
      return;
    }

    animate(lines, { opacity: [0, 1], translateY: [40, 0], duration: 700, delay: stagger(180, { start: 150 }), ease: 'outCubic' });
    animate(lines, { innerHTML: scrambleText({ chars: 'braille', from: 'left', override: '' }), delay: stagger(180, { start: 150 }) });
    animate(rest, { opacity: [0, 1], translateY: [20, 0], duration: 700, delay: stagger(120, { start: 500 }), ease: 'outCubic' });
  }, []);

  return (
    <section
      ref={rootRef}
      className="relative overflow-hidden flex flex-col lg:min-h-[calc(100vh-4rem)]"
      style={{
        background:
          'radial-gradient(ellipse at 58% -15%, #1d40f5 0%, #0c18c2 32%, #07108a 62%, #040b5c 100%)',
      }}
    >
      {/* Grid line overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(200,255,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.06) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at 30% 50%, black 30%, transparent 75%)',
          animation: 'gridScroll 8s linear infinite',
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(4,9,46,0.6) 100%)',
        }}
      />

      <div className="relative z-10 flex-1 mx-auto w-full max-w-7xl px-6 sm:px-10 lg:px-16 py-10 grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div>
          <p
            className="hero-rise mb-6 inline-block rounded-full border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-4 py-1.5 text-xs font-semibold text-[#c8ff00] backdrop-blur-sm"
            style={{ opacity: 0 }}
          >
            การทดลองที่ 8 สนามแม่เหล็กและกฎของไบโอต-ซาวัต
          </p>

          {/* Sized from both viewport width and height so the whole hero,
              buttons included, fits an 11–12" screen without scrolling. */}
          <h1 className="font-black leading-none tracking-tighter select-none whitespace-nowrap">
            <span
              className="hero-line block text-[clamp(2.75rem,min(6.2vw,13vh),6rem)] text-[#c8ff00]"
              style={{ opacity: 0, textShadow: '0 0 40px rgba(200,255,0,0.3), 0 0 100px rgba(200,255,0,0.1)' }}
            >
              ห้องทดลอง
            </span>
            <span
              className="hero-line block text-[clamp(2.4rem,min(5.4vw,11.3vh),5.2rem)]"
              style={{ opacity: 0, WebkitTextStroke: '2px #c8ff00', color: 'transparent', textShadow: '0 0 24px rgba(200,255,0,0.25)' }}
            >
              ควบคุมได้
            </span>
            <span
              className="hero-line block text-[clamp(2.1rem,min(4.6vw,9.6vh),4.4rem)]"
              style={{ opacity: 0, WebkitTextStroke: '1.5px #c8ff0066', color: 'transparent', textShadow: '0 0 24px rgba(200,255,0,0.25)' }}
            >
              จากทุกที่
            </span>
          </h1>

          <p className="hero-rise mt-6 max-w-md text-sm sm:text-base text-white/70 leading-7" style={{ opacity: 0 }}>
            สั่งงานขดลวดและโซลีนอยด์ของจริงผ่านเบราว์เซอร์ ดูผ่านกล้องสด
            แล้ววัดสนามแม่เหล็กมาเทียบกับทฤษฎี ภายในช่วงเวลาที่คุณจองไว้
          </p>

          <div className="hero-rise mt-7 flex flex-wrap gap-4" style={{ opacity: 0 }}>
            <Link
              href="#booking"
              className={`rounded-full bg-[#c8ff00] px-7 py-3 text-sm font-bold text-gray-950 hover:bg-white transition-colors ${FOCUS_RING}`}
              style={{ boxShadow: '0 0 28px rgba(200,255,0,0.45), 0 4px 16px rgba(0,0,0,0.3)' }}
            >
              จองเวลาทดลอง
            </Link>
            <Link
              href="#how-it-works"
              className={`rounded-full border-2 border-[#c8ff00]/50 px-7 py-3 text-sm font-bold text-[#c8ff00]/80 hover:border-[#c8ff00] hover:text-[#c8ff00] transition-colors ${FOCUS_RING}`}
            >
              ดูขั้นตอน
            </Link>
          </div>
        </div>

        <div className="hero-rise" style={{ opacity: 0 }}>
          <FieldProbe />
        </div>
      </div>
    </section>
  );
}

// ── Field probe ───────────────────────────────────────────────────────────────
// The hero's live element: the theoretical on-axis field of the rig's own
// solenoid, with a probe the visitor can move — a preview of what the lab
// session measures. Same formula and numbers as the lab room.

const Z_MIN = -10; // cm, the stretch of the axis the lab itself measures
const Z_MAX = 10;
const B_AXIS_MAX = 1.5; // mT
const VIEW = { w: 580, h: 286, x0: 46, x1: 556, yTop: 18, yBase: 178, axisY: 226 };

const bAt = (zCm: number) => calcBSolenoid(SOLENOID.N, SOLENOID.I, SOLENOID.L, SOLENOID.R, zCm / 100);
const xOf = (zCm: number) => VIEW.x0 + ((zCm - Z_MIN) / (Z_MAX - Z_MIN)) * (VIEW.x1 - VIEW.x0);
const yOf = (b: number) => VIEW.yBase - (b / B_AXIS_MAX) * (VIEW.yBase - VIEW.yTop);

const CURVE_PATH = Array.from({ length: (Z_MAX - Z_MIN) * 4 + 1 }, (_, i) => {
  const z = Z_MIN + i / 4;
  return `${i === 0 ? 'M' : 'L'}${xOf(z).toFixed(1)} ${yOf(bAt(z)).toFixed(1)}`;
}).join(' ');
const AREA_PATH = `${CURVE_PATH} L${VIEW.x1} ${VIEW.yBase} L${VIEW.x0} ${VIEW.yBase} Z`;
const HALF_LENGTH_CM = (SOLENOID.L * 100) / 2;
const WINDINGS = Array.from({ length: 25 }, (_, i) => xOf(-HALF_LENGTH_CM + (i * 2 * HALF_LENGTH_CM) / 24));
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;

function FieldProbe() {
  // `z` is where the probe is headed, in whole cm like the real one, and what the
  // readout shows. `pos` is where the marker is drawn while it glides there.
  const [z, setZ] = useState(0);
  const [pos, setPos] = useState(0);
  // How far the intro has traced the curve; null once the whole curve is shown.
  const [traced, setTraced] = useState<number | null>(null);
  const [hinting, setHinting] = useState(false);
  const probe = useRef({ z: 0 });
  const motion = useRef<ReturnType<typeof animate> | null>(null);
  const ringRef = useRef<SVGCircleElement>(null);

  // On load the probe runs the length of the axis once, tracing the curve the
  // way a lab session does, then settles at the centre. Any interaction takes over.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const p = probe.current;
    const place = () => { setPos(p.z); setZ(Math.round(p.z)); };
    motion.current = animate(p, {
      z: [Z_MIN, Z_MAX],
      duration: 1800,
      delay: 700,
      ease: 'inOutSine',
      onUpdate: () => { place(); setTraced(p.z); },
      onComplete: () => {
        setTraced(null);
        motion.current = animate(p, {
          z: 0,
          duration: 800,
          ease: 'inOutQuad',
          onUpdate: place,
          onComplete: () => setHinting(true),
        });
      },
    });
    return () => { motion.current?.pause(); };
  }, []);

  // A few pulses on the probe once the intro ends, to show it can be moved.
  useEffect(() => {
    if (!hinting || !ringRef.current) return;
    const pulse = animate(ringRef.current, {
      r: [5.5, 20],
      opacity: [0.8, 0],
      duration: 1400,
      ease: 'outCubic',
      loop: 2,
      loopDelay: 300,
      onComplete: () => setHinting(false),
    });
    return () => { pulse.pause(); };
  }, [hinting]);

  function goTo(target: number) {
    motion.current?.pause();
    setTraced(null);
    setHinting(false);
    setZ(target);
    if (prefersReducedMotion()) {
      probe.current.z = target;
      setPos(target);
      return;
    }
    const p = probe.current;
    motion.current = animate(p, { z: target, duration: 160, ease: 'outQuad', onUpdate: () => setPos(p.z) });
  }

  function moveProbe(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * VIEW.w;
    const zCm = Z_MIN + ((vx - VIEW.x0) / (VIEW.x1 - VIEW.x0)) * (Z_MAX - Z_MIN);
    goTo(Math.round(Math.min(Z_MAX, Math.max(Z_MIN, zCm))));
  }

  const b = bAt(z);
  const px = xOf(pos);
  const py = yOf(bAt(pos));

  return (
    <div className="rounded-2xl border border-white/10 bg-gray-950/70 backdrop-blur-sm p-5 sm:p-6">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">ลองเลื่อนหัววัดตามแนวแกน</h2>
          <p className="mt-0.5 text-xs text-gray-400">โซลีนอยด์ {SOLENOID.N} รอบ ยาว {SOLENOID.L * 1000} มม. กระแส {SOLENOID.I} A</p>
        </div>
        {/* Only the digits are monospaced; Thai set in the mono fallback spaces out badly. */}
        <dl className="shrink-0 flex items-end gap-5 text-right">
          <div>
            <dt className="text-[11px] text-gray-500">Z</dt>
            <dd className="text-base text-cyan-400">
              <span className="font-mono tabular-nums">{signed(z)}</span> <span className="text-sm">ซม.</span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-gray-500">B ตามทฤษฎี</dt>
            <dd className="text-2xl leading-none text-[#c8ff00]" style={{ textShadow: '0 0 18px rgba(200,255,0,0.4)' }}>
              <span className="font-mono font-bold tabular-nums">{b.toFixed(3)}</span> <span className="text-sm text-gray-400">mT</span>
            </dd>
          </div>
        </dl>
      </div>

      <svg
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        className="mt-3 block w-full cursor-ew-resize select-none"
        style={{ touchAction: 'pan-y' }}
        role="img"
        aria-label="กราฟสนามแม่เหล็กตามแนวแกนของโซลีนอยด์ สูงสุดที่กึ่งกลางและลดลงเมื่อพ้นปลายขดลวด"
        onPointerDown={moveProbe}
        onPointerMove={e => { if (e.pointerType === 'mouse' || e.buttons) moveProbe(e); }}
      >
        <defs>
          <linearGradient id="field-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c8ff00" stopOpacity="0.26" />
            <stop offset="1" stopColor="#c8ff00" stopOpacity="0" />
          </linearGradient>
          <clipPath id="field-traced">
            <rect x="0" y="0" width={xOf(traced ?? Z_MAX)} height={VIEW.h} />
          </clipPath>
        </defs>

        {[0.5, 1.0, 1.5].map(v => (
          <g key={v}>
            <line x1={VIEW.x0} x2={VIEW.x1} y1={yOf(v)} y2={yOf(v)} stroke="rgba(255,255,255,0.07)" />
            <text x={VIEW.x0 - 8} y={yOf(v) + 3.5} textAnchor="end" fontSize="12" fill="rgba(255,255,255,0.45)">{v.toFixed(1)}</text>
          </g>
        ))}
        <text x={VIEW.x0 - 8} y={VIEW.yBase + 3.5} textAnchor="end" fontSize="12" fill="rgba(255,255,255,0.45)">0</text>
        <line x1={VIEW.x0} x2={VIEW.x1} y1={VIEW.yBase} y2={VIEW.yBase} stroke="rgba(255,255,255,0.22)" />

        {/* Where the winding ends: the field has already dropped to about half there. */}
        {[-HALF_LENGTH_CM, HALF_LENGTH_CM].map(end => (
          <line key={end} x1={xOf(end)} x2={xOf(end)} y1={VIEW.yTop} y2={VIEW.axisY + 14} stroke="rgba(255,255,255,0.14)" strokeDasharray="3 4" />
        ))}

        <g clipPath={traced === null ? undefined : 'url(#field-traced)'}>
          <path d={AREA_PATH} fill="url(#field-area)" />
          <path d={CURVE_PATH} fill="none" stroke="#c8ff00" strokeWidth="2" strokeLinejoin="round" />
        </g>

        {/* The solenoid itself, drawn to the same Z scale as the plot above it. */}
        <line x1={VIEW.x0} x2={VIEW.x1} y1={VIEW.axisY} y2={VIEW.axisY} stroke="rgba(255,255,255,0.2)" strokeDasharray="2 5" />
        <rect x={xOf(-HALF_LENGTH_CM)} y={VIEW.axisY - 14} width={xOf(HALF_LENGTH_CM) - xOf(-HALF_LENGTH_CM)} height="28" rx="4" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.3)" />
        {WINDINGS.map(x => (
          <line key={x} x1={x} x2={x} y1={VIEW.axisY - 14} y2={VIEW.axisY + 14} stroke="rgba(255,255,255,0.24)" />
        ))}

        <line x1={px} x2={px} y1={py} y2={VIEW.axisY} stroke="rgba(34,211,238,0.55)" strokeDasharray="3 3" />
        {hinting && (
          <circle ref={ringRef} cx={px} cy={VIEW.axisY} r="5.5" fill="none" stroke="#22d3ee" strokeWidth="1.5" />
        )}
        <circle cx={px} cy={VIEW.axisY} r="5.5" fill="#22d3ee" stroke="#030712" strokeWidth="1.5" />
        <circle cx={px} cy={py} r="5" fill="#c8ff00" stroke="#030712" strokeWidth="1.5" />

        {[Z_MIN, -HALF_LENGTH_CM, 0, HALF_LENGTH_CM, Z_MAX].map(v => (
          <text key={v} x={xOf(v)} y={VIEW.axisY + 32} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.45)">{signed(v)}</text>
        ))}
        <text x={(VIEW.x0 + VIEW.x1) / 2} y={VIEW.h - 6} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.45)">ตำแหน่งหัววัด Z (ซม.)</text>
        <text x={VIEW.x0} y={11} fontSize="12" fill="rgba(255,255,255,0.45)">B (mT)</text>
      </svg>

      <input
        type="range"
        min={Z_MIN}
        max={Z_MAX}
        step={1}
        value={z}
        onChange={e => goTo(Number(e.target.value))}
        aria-label="ตำแหน่งหัววัดตามแนวแกน Z"
        aria-valuetext={`Z ${signed(z)} เซนติเมตร สนามแม่เหล็ก ${b.toFixed(3)} มิลลิเทสลา`}
        className="mt-2 block w-full accent-[#c8ff00]"
      />
      <p className="mt-2 text-xs leading-5 text-gray-400">
        เส้นนี้คือค่าจากสูตร ในห้องแลปหัววัดจริงจะเลื่อนทีละจุด ห่างกัน 1 ซม. และคุณจะได้ค่าที่วัดมาเทียบกัน
      </p>
    </div>
  );
}

// ── Experiment ────────────────────────────────────────────────────────────────

const PARTS = [
  {
    kind: 'coil' as const,
    part: 'ตอนที่ 1',
    title: 'ขดลวดเดี่ยว',
    body: 'วัดสนามแม่เหล็กที่จุดกึ่งกลางของขดลวด 1, 2 และ 3 รอบ แล้วดูว่าสนามเพิ่มตามจำนวนรอบอย่างที่ทฤษฎีบอกหรือไม่',
    formula: 'B₀ = μ₀ n I / 2R',
    facts: [
      ['จำนวนรอบ', '1, 2 และ 3 รอบ'],
      ['กระแส', '5 A'],
      ['ตำแหน่งที่วัด', 'กึ่งกลางขดลวด'],
    ],
  },
  {
    kind: 'solenoid' as const,
    part: 'ตอนที่ 2',
    title: 'โซลีนอยด์',
    body: 'เลื่อนหัววัดไปตามแนวแกนของโซลีนอยด์ทีละจุด เก็บค่าตลอดความยาวและเลยปลายออกไป แล้วเทียบกับสูตรของโซลีนอยด์ความยาวจำกัด',
    formula: 'B_z = (μ₀ N I / 2L) (cos α₁ + cos α₂)',
    facts: [
      ['จำนวนรอบ', '100 รอบ'],
      ['ความยาว', '80 มม.'],
      ['กระแส', '1 A'],
      ['ตำแหน่งที่วัด', '21 จุด ตลอด ±10 ซม.'],
    ],
  },
];

// Icons are drawn on a 24-unit grid and stroked by ToolIcon.
const ROOM_TOOLS = [
  {
    name: 'กล้องสดสองมุม',
    what: 'เห็นชุดทดลองจริงตลอดเวลาที่ทำการทดลอง',
    icon: <><rect x="3" y="6.5" width="12" height="11" rx="2" /><path d="M15 10.5l6-3v9l-6-3z" /></>,
  },
  {
    name: 'ค่าที่วัดคู่กับทฤษฎี',
    what: 'อ่านค่า B จากหัววัด เทียบกับค่าจากสูตร พร้อมส่วนต่าง ΔB',
    icon: <><path d="M2.5 18h2c3 0 2.5-9 5.5-9h4c3 0 2.5 9 5.5 9h2" /><path d="M7 11.5h.01M12 5.5h.01M17.5 14.5h.01" strokeWidth="2.8" /></>,
  },
  {
    name: 'ตารางบันทึกตามแกน Z',
    what: 'เลือกตำแหน่ง แขนกลพาหัววัดไป แล้วเก็บค่าลงตารางให้',
    icon: <><rect x="3" y="4.5" width="18" height="15" rx="2" /><path d="M3 9.5h18M3 14.5h18M9.5 4.5v15" /></>,
  },
  {
    name: 'ดาวน์โหลดเป็น CSV',
    what: 'นำข้อมูลที่บันทึกไปเขียนรายงานต่อได้',
    icon: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14" />,
  },
  {
    name: 'ผู้ช่วยสอน AI',
    what: 'ถามหลักการและวิธีคำนวณได้ระหว่างทดลอง',
    icon: <><path d="M4 6.5a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2h-6.5L7 20v-3.5H6a2 2 0 01-2-2z" /><path d="M9 10.5h6M12 7.5v6" /></>,
  },
  {
    name: 'ใบแลปและใบบันทึกผล',
    what: 'เปิดเอกสาร PDF ของการทดลองได้จากในห้องแลป',
    icon: <><path d="M7 3.5h7l4 4V20.5H7z" /><path d="M14 3.5v4h4M10 12.5h5M10 16h5" /></>,
  },
];

function ToolIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gray-900 text-cyan-400">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </span>
  );
}

// What each part measures, shown once its drawing is complete: one point at the
// coil's centre, a sweep along the solenoid's axis.
function showMeasurement(article: HTMLElement) {
  const ring = all(article, '[data-kind="coil"] .field-ring');
  if (ring.length) animate(ring, { r: [4.5, 20], opacity: [0.9, 0], duration: 1300, loop: 1, ease: 'outCubic' });
  const probe = all(article, '[data-kind="solenoid"] .field-probe');
  if (probe.length) {
    animate(probe, {
      translateX: [{ to: -130, duration: 800 }, { to: 130, duration: 1600 }, { to: 0, duration: 800 }],
      ease: 'inOutSine',
    });
  }
}

function Experiment() {
  const headRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);

  // Each block comes in when it is reached, not all at once with the section.
  useEffect(() => {
    const head = headRef.current;
    const parts = partsRef.current;
    const tools = toolsRef.current;
    if (!head || !parts || !tools) return;

    const stops = [
      revealOnScroll(head, all(head, '.rise'), () => riseIn(all(head, '.rise'))),
      revealOnScroll(parts, all(parts, '.rise, .formula, .fact, .field-line, .field-mark'), () => {
        parts.querySelectorAll<HTMLElement>('article').forEach((article, i) => {
          const start = i * 180;
          riseIn(all(article, '.rise'), start);
          // The field lines draw themselves, then the winding, arrows and probe appear.
          const lines = createDrawable(all(article, '.field-line'));
          utils.set(all(article, '.field-line'), { opacity: 1 });
          animate(lines, { draw: ['0 0', '0 1'], duration: 1300, delay: stagger(80, { start: start + 250 }), ease: 'inOutQuad' });
          animate(all(article, '.field-mark'), {
            opacity: [0, 1], duration: 500, delay: start + 1200, onComplete: () => showMeasurement(article),
          });
          // The formula resolves out of digits, then its parameters line up under it.
          animate(all(article, '.formula'), { opacity: [0, 1], duration: 300, delay: start + 300 });
          animate(all(article, '.formula'), { innerHTML: scrambleText({ chars: 'numbers', from: 'left' }), delay: start + 300 });
          animate(all(article, '.fact'), {
            opacity: [0, 1], translateX: [-16, 0], duration: 450, delay: stagger(60, { start: start + 500 }), ease: 'outCubic',
          });
        });
      }),
      revealOnScroll(tools, all(tools, '.rise'), () => {
        animate(all(tools, '.rise'), { opacity: [0, 1], translateY: [20, 0], duration: 550, delay: stagger(70), ease: 'outCubic' });
      }),
    ];
    return () => { stops.forEach(stop => stop()); };
  }, []);

  return (
    <section id="experiment" className="relative scroll-mt-16 py-24 sm:py-28 border-t border-white/5">
      {/* The hero's blue, fading out as the page goes on */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-96"
        style={{ background: 'radial-gradient(ellipse 55% 100% at 50% 0%, rgba(29,64,245,0.16), transparent 100%)' }}
      />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div ref={headRef} className="mx-auto max-w-2xl text-center mb-14">
          <h2 className="rise text-3xl font-bold tracking-tight text-white sm:text-4xl">การทดลองที่ 8 มีสองตอน</h2>
          <p className="rise mt-4 text-gray-400">
            ทั้งสองตอนใช้ชุดทดลองจริงชุดเดียวกัน คุณเลือกอุปกรณ์จากในห้องแลป แล้วระบบจะสลับให้
          </p>
        </div>

        <div ref={partsRef} className="grid gap-12 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-white/10">
          {PARTS.map((p, i) => (
            <article key={p.part} className={i === 0 ? 'lg:pr-12' : 'lg:pl-12'}>
              <div className="rise max-w-2xl lg:max-w-none">
                <FieldDiagram kind={p.kind} />
              </div>
              <p className="rise mt-7 text-sm font-semibold text-[#c8ff00]">{p.part}</p>
              <h3 className="rise mt-1 text-2xl font-bold text-white">{p.title}</h3>
              <p className="rise mt-3 max-w-prose leading-7 text-gray-400">{p.body}</p>
              <p className="formula mt-5 inline-block rounded-lg border border-white/10 bg-gray-900/50 px-3.5 py-2 font-mono text-sm text-[#c8ff00]">
                {p.formula}
              </p>
              <dl className="mt-5 divide-y divide-white/5 border-t border-white/5 text-sm">
                {p.facts.map(([k, v]) => (
                  <div key={k} className="fact flex items-baseline justify-between gap-6 py-2.5">
                    <dt className="text-gray-500">{k}</dt>
                    <dd className="text-right text-white">{v}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>

        <div ref={toolsRef} className="mt-20">
          <h3 className="rise text-lg font-semibold text-white">ในห้องแลปมีอะไรให้ใช้</h3>
          <ul className="mt-5 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
            {ROOM_TOOLS.map(tool => (
              <li key={tool.name} className="rise flex gap-4 border-t border-white/10 py-5">
                <ToolIcon>{tool.icon}</ToolIcon>
                <div>
                  <p className="font-semibold text-white">{tool.name}</p>
                  <p className="mt-1 text-sm leading-6 text-gray-400">{tool.what}</p>
                </div>
              </li>
            ))}
          </ul>
          <a
            href={HANDOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`rise mt-6 inline-block text-sm text-cyan-400 underline underline-offset-4 hover:text-white transition-colors ${FOCUS_RING}`}
          >
            อ่านคู่มือการทดลองที่ 08 (PDF)
          </a>
        </div>
      </div>
    </section>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────

const STEPS = [
  {
    title: 'จองช่วงเวลา',
    description: 'เข้าสู่ระบบด้วยบัญชี Google แล้วเลือกช่วงเวลา 2 ชั่วโมงที่ยังว่าง จองล่วงหน้าได้ 7 วัน',
  },
  {
    title: 'เข้าห้องแลปเมื่อถึงเวลา',
    description: 'ระบบแจ้งเตือนเมื่อถึงเวลาที่จอง และปุ่มเข้าห้องแลปจะขึ้นในแดชบอร์ด ใช้เบราว์เซอร์อย่างเดียว ไม่ต้องติดตั้งอะไร',
  },
  {
    title: 'ทดลองและเก็บผล',
    description: 'เลือกอุปกรณ์ ดูกล้อง อ่านค่า บันทึกลงตาราง แล้วดาวน์โหลดข้อมูลก่อนหมดเวลา',
  },
];

// Step art: a small sketch of what each step looks like on screen. Decorative —
// the title and text of the step carry the meaning.

// A week of slots like the booking table: a couple taken, one picked.
const ART_SLOTS = Array.from({ length: 28 }, (_, i) => (i === 15 ? 'picked' : i === 9 || i === 19 ? 'taken' : 'free'));
const ART_SLOT_CLASS = {
  free: 'bg-white/[0.07]',
  taken: 'bg-[#c8ff00]/25',
  picked: 'bg-cyan-500/50 ring-1 ring-cyan-400',
};

// The solenoid curve again, with points scattered slightly off it the way
// measured values sit against theory.
const ART_PLOT = { w: 240, h: 88 };
const artX = (zCm: number) => 8 + ((zCm - Z_MIN) / (Z_MAX - Z_MIN)) * (ART_PLOT.w - 16);
const artY = (b: number) => ART_PLOT.h - 10 - (b / B_AXIS_MAX) * (ART_PLOT.h - 24);
const ART_CURVE = Array.from({ length: (Z_MAX - Z_MIN) * 4 + 1 }, (_, i) => {
  const z = Z_MIN + i / 4;
  return `${i === 0 ? 'M' : 'L'}${artX(z).toFixed(1)} ${artY(bAt(z)).toFixed(1)}`;
}).join(' ');
const ART_POINTS = [0.03, -0.04, 0.02, -0.03, 0.04, -0.02, 0.03, -0.04, 0.02].map((off, i) => {
  const z = -12 + i * 3;
  return { x: artX(z).toFixed(1), y: artY(bAt(z) * (1 + off) + off * 0.3).toFixed(1) };
});

function CameraTile() {
  return (
    <div className="pop relative flex h-14 flex-1 items-center justify-center rounded-lg border border-white/10 bg-gray-950 text-gray-600">
      <span className="absolute left-2 top-2 h-1.5 w-1.5 rounded-full bg-[#c8ff00]" />
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6.5" width="12" height="11" rx="2" /><path d="M15 10.5l6-3v9l-6-3z" />
      </svg>
    </div>
  );
}

function StepArt({ step }: { step: number }) {
  return (
    <div
      aria-hidden="true"
      className="step-art mt-6 flex h-36 items-center justify-center rounded-2xl border border-white/10 bg-gray-900/50 px-6"
    >
      {step === 0 && (
        <div className="grid w-full max-w-[17rem] grid-cols-7 gap-1.5">
          {ART_SLOTS.map((slot, i) => (
            <span key={i} className={`pop h-4 rounded-[5px] ${ART_SLOT_CLASS[slot]}`} />
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="w-full max-w-[17rem]">
          <div className="pop flex items-center gap-2.5 rounded-lg border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-3 py-2 text-xs font-semibold text-[#c8ff00]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 16v-5a6 6 0 0112 0v5l1.5 2h-15zM10 21h4" />
            </svg>
            ถึงเวลาที่จองแล้ว
          </div>
          <div className="mt-2 flex gap-2">
            <CameraTile />
            <CameraTile />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="relative w-full max-w-[17rem]">
          <svg viewBox={`0 0 ${ART_PLOT.w} ${ART_PLOT.h}`} className="block w-full">
            <line x1="8" x2={ART_PLOT.w - 8} y1={ART_PLOT.h - 10} y2={ART_PLOT.h - 10} stroke="rgba(255,255,255,0.2)" />
            <path className="art-curve" d={ART_CURVE} fill="none" stroke="#c8ff00" strokeWidth="1.75" strokeLinejoin="round" />
            {ART_POINTS.map(p => (
              <circle
                key={p.x}
                className="pop"
                cx={p.x}
                cy={p.y}
                r="3"
                fill="#22d3ee"
                stroke="#030712"
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              />
            ))}
          </svg>
          <span className="pop absolute right-0 top-0 flex items-center gap-1 rounded-md border border-white/10 bg-gray-950 px-2 py-1 font-mono text-[10px] text-cyan-400">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14" />
            </svg>
            CSV
          </span>
        </div>
      )}
    </div>
  );
}

function HowItWorks() {
  const headRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLOListElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const head = headRef.current;
    const steps = stepsRef.current;
    const band = bandRef.current;
    if (!head || !steps || !band) return;

    const stops = [
      revealOnScroll(head, all(head, '.rise'), () => riseIn(all(head, '.rise'))),
      // The steps come in one after another, each connector growing toward the next.
      revealOnScroll(steps, all(steps, '.step-badge, .step-text, .step-link, .step-art, .pop'), () => {
        const gap = 280;
        animate(all(steps, '.step-badge'), { opacity: [0, 1], scale: [0.5, 1], duration: 450, delay: stagger(gap), ease: 'outBack' });
        animate(all(steps, '.step-link'), { opacity: [0, 1], scaleX: [0, 1], duration: 500, delay: stagger(gap, { start: 200 }), ease: 'outCubic' });
        steps.querySelectorAll<HTMLElement>('li').forEach((step, i) => {
          const start = i * gap;
          animate(all(step, '.step-art, .step-text'), {
            opacity: [0, 1], translateY: [16, 0], duration: 500, delay: stagger(70, { start: start + 120 }), ease: 'outCubic',
          });
          // Then the sketch fills in piece by piece.
          animate(all(step, '.pop'), { opacity: [0, 1], scale: [0.6, 1], duration: 350, delay: stagger(22, { start: start + 400 }), ease: 'outBack' });
        });
        animate(createDrawable(all(steps, '.art-curve')), { draw: ['0 0', '0 1'], duration: 900, delay: 2 * gap + 250, ease: 'inOutQuad' });
      }),
      revealOnScroll(band, all(band, '.rise'), () => riseIn(all(band, '.rise'))),
    ];
    return () => { stops.forEach(stop => stop()); };
  }, []);

  return (
    <section id="how-it-works" className="scroll-mt-16 py-24 sm:py-28 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div ref={headRef} className="mx-auto max-w-2xl text-center mb-14">
          <h2 className="rise text-3xl font-bold tracking-tight text-white sm:text-4xl">สามขั้นตอนจนได้ผลการทดลอง</h2>
        </div>

        <ol ref={stepsRef} className="grid gap-12 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative">
              {/* Connector to the next step */}
              {i < STEPS.length - 1 && (
                <div className="step-link absolute left-16 right-[-3rem] top-6 hidden h-px origin-left bg-linear-to-r from-[#c8ff00]/40 to-transparent lg:block" />
              )}
              <span className="step-badge flex h-12 w-12 items-center justify-center rounded-full border border-[#c8ff00]/40 bg-gray-900 font-mono text-lg font-bold text-[#c8ff00]">
                {i + 1}
              </span>
              <StepArt step={i} />
              <h3 className="step-text mt-6 text-xl font-semibold text-white">{s.title}</h3>
              <p className="step-text mt-2 leading-7 text-gray-400">{s.description}</p>
            </li>
          ))}
        </ol>

        <div ref={bandRef} className="mt-16">
          {/* The closing band picks the hero's blue back up */}
          <div
            className="rise relative overflow-hidden rounded-2xl border border-white/10"
            style={{ background: 'radial-gradient(ellipse at 85% -40%, #1d40f5 0%, #0c18c2 34%, #07108a 64%, #040b5c 100%)' }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(200,255,0,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.07) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
                maskImage: 'radial-gradient(ellipse at 80% 50%, black 10%, transparent 70%)',
              }}
            />
            <div className="relative flex flex-col items-start justify-between gap-5 px-6 py-7 sm:flex-row sm:items-center sm:px-9">
              <div>
                <p className="text-xl font-semibold text-white">เลือกช่วงเวลาที่ว่าง แล้วเริ่มได้เลย</p>
                <p className="mt-1 text-sm text-white/70">ใช้ได้บนจอแนวนอน เช่น โน้ตบุ๊ก หรือแท็บเล็ตที่วางแนวนอน</p>
              </div>
              <Link
                href="#booking"
                className={`shrink-0 rounded-full bg-[#c8ff00] px-7 py-3 text-sm font-bold text-gray-950 hover:bg-white transition-colors ${FOCUS_RING}`}
                style={{ boxShadow: '0 0 28px rgba(200,255,0,0.45), 0 4px 16px rgba(0,0,0,0.3)' }}
              >
                จองเวลาทดลอง
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 py-10">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" width={28} height={28} alt="PaNa LabS" className="rounded-lg" />
            <span className="text-sm font-semibold">
              PaNa<span className="text-[#c8ff00]">LabS</span>
            </span>
          </div>
          <p className="text-sm text-gray-600">
            © {new Date().getFullYear()} PaNa LabS. สงวนลิขสิทธิ์ทุกประการ
          </p>
          <a
            href={HANDOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-sm text-gray-500 hover:text-white transition-colors ${FOCUS_RING}`}
          >
            คู่มือการทดลอง (PDF)
          </a>
        </div>
      </div>
    </footer>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
