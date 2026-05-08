'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, morphTo, onScroll, scrambleText, stagger } from 'animejs';
import Image from 'next/image';
import Link from 'next/link';
import BookingCalendar from './components/BookingCalendar';

export default function Home() {
  return (
    <>
      {/* Portrait-only overlay */}
      <div className="hidden portrait:flex fixed inset-0 z-[9999] flex-col items-center justify-center gap-6 px-8 text-center bg-gray-950">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#c8ff00]/10 border border-[#c8ff00]/30"
          style={{ boxShadow: '0 0 40px rgba(200,255,0,0.15)' }}
        >
          <RotateIcon />
        </div>
        <div>
          <p className="text-white text-xl font-semibold tracking-tight">
            กรุณาหมุนหน้าจอ
          </p>
          <p className="mt-2 text-gray-500 text-sm leading-6">
            เว็บไซต์นี้ออกแบบสำหรับหน้าจอแนวนอน<br />
            (Landscape) เท่านั้น
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#c8ff00]/60 border border-[#c8ff00]/20 rounded-full px-4 py-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#c8ff00] animate-pulse" />
          หมุนอุปกรณ์เพื่อดูเนื้อหา
        </div>
      </div>

      {/* Main content — landscape only */}
      <div className="flex portrait:hidden flex-col min-h-full">
        <Navbar />
        <main className="flex-1">
          <Hero />
          <BookingCalendar />
          <Features />
          <HowItWorks />
          <Stats />
          <CTA />
        </main>
        <Footer />
      </div>
    </>
  );
}

const ROLE_LABELS: Record<string, string> = {
  student: 'นักศึกษา', researcher: 'นักวิจัย', instructor: 'อาจารย์', other: 'ผู้ใช้ทั่วไป',
};

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
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
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c8ff00]"
              style={{ boxShadow: '0 0 16px rgba(200,255,0,0.5)' }}
            >
              <FlaskIcon />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Remote<span className="text-[#c8ff00]">Lab</span>
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <Link href="#features" className="hover:text-white transition-colors">ฟีเจอร์</Link>
            <Link href="#how-it-works" className="hover:text-white transition-colors">วิธีใช้งาน</Link>
            <Link href="#pricing" className="hover:text-white transition-colors">ราคา</Link>
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
              <>
                <Link
                  href="/login"
                  className="text-sm text-gray-400 hover:text-white transition-colors px-4 py-2"
                >
                  เข้าสู่ระบบ
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-[#c8ff00] px-4 py-2 text-sm font-medium text-gray-950 hover:bg-white transition-colors"
                  style={{ boxShadow: '0 0 20px rgba(200,255,0,0.35)' }}
                >
                  เริ่มต้นฟรี
                </Link>
              </>
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
            {[
              { href: '#features', label: 'ฟีเจอร์' },
              { href: '#how-it-works', label: 'วิธีใช้งาน' },
              { href: '#pricing', label: 'ราคา' },
            ].map(({ href, label }) => (
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
                  <button onClick={() => { handleLogout(); setMobileOpen(false); }}
                    className="text-center py-2.5 text-sm text-red-400 hover:text-red-300 transition-colors">
                    ออกจากระบบ
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setMobileOpen(false)}
                    className="text-center py-2.5 text-sm text-gray-400 hover:text-white transition-colors">
                    เข้าสู่ระบบ
                  </Link>
                  <Link href="/signup" onClick={() => setMobileOpen(false)}
                    className="text-center rounded-full bg-[#c8ff00] px-4 py-2.5 text-sm font-medium text-gray-950 hover:bg-white transition-colors"
                    style={{ boxShadow: '0 0 20px rgba(200,255,0,0.35)' }}>
                    เริ่มต้นฟรี
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const badgeRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (badgeRef.current) animate(badgeRef.current, {
      opacity: [0, 1],
      translateY: [20, 0],
      duration: 700,
      ease: 'outCubic',
    });

    if (headlineRef.current) {
      const lines = headlineRef.current.querySelectorAll('span');
      animate(lines, {
        opacity: [0, 1],
        translateY: [48, 0],
        duration: 700,
        delay: stagger(220, { start: 250 }),
        ease: 'outCubic',
      });
      animate(lines, {
        innerHTML: scrambleText({
          chars: 'braille',
          from: 'left',
          override: '',
          delay: stagger(220, { start: 250 }),
        }),
      });
    }

    if (subRef.current) animate(subRef.current, {
      opacity: [0, 1],
      translateY: [24, 0],
      duration: 700,
      delay: 750,
      ease: 'outCubic',
    });
  }, []);

  return (
    <section
      className="relative min-h-[calc(100vh-4rem)] overflow-hidden flex flex-col"
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

      <div className="relative z-10 flex-1 flex flex-col justify-center px-6 sm:px-10 lg:px-16 py-16 max-w-7xl mx-auto w-full">
        {/* Live status badge */}
        <div
          ref={badgeRef}
          className="mb-8 inline-flex items-center gap-2 self-start rounded-full border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-4 py-1.5 text-xs font-semibold text-[#c8ff00] backdrop-blur-sm"
          style={{ opacity: 0 }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-[#c8ff00] animate-pulse"
            style={{ boxShadow: '0 0 6px #c8ff00' }}
          />
          อุปกรณ์พร้อมใช้งาน 47 ชุด — Live Now
        </div>

        <h1 ref={headlineRef} className="font-black uppercase leading-none tracking-tighter select-none">
          <span
            className="block text-[clamp(3.5rem,11vw,10rem)] text-[#c8ff00]"
            style={{
              opacity: 0,
              textShadow: '0 0 40px rgba(200,255,0,0.3), 0 0 100px rgba(200,255,0,0.1)',
            }}
          >
            ห้องทดลอง
          </span>
          <span
            className="block text-[clamp(3rem,9vw,8.5rem)]"
            style={{ opacity: 0, WebkitTextStroke: '3px #c8ff00', color: 'transparent', textShadow: '0 0 24px rgba(200,255,0,0.25)' }}
          >
            ควบคุมได้
          </span>
          <span
            className="block text-[clamp(2.5rem,7.5vw,7rem)]"
            style={{ opacity: 0, WebkitTextStroke: '2px #c8ff0066', color: 'transparent', textShadow: '0 0 24px rgba(200,255,0,0.25)' }}
          >
            จากทุกที่
          </span>
        </h1>

        <div ref={subRef} style={{ opacity: 0 }}>
          <p className="mt-8 max-w-xs text-sm text-white/60 leading-7">
            แพลตฟอร์มทดลองวิทยาศาสตร์ออนไลน์ที่เชื่อมต่อกับอุปกรณ์แล็บจริง
            ควบคุมการทดลองแบบ real-time ผ่านเบราว์เซอร์ ไม่ต้องจำลอง
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/signup"
              className="rounded-full bg-[#c8ff00] px-7 py-3 text-sm font-black text-gray-950 uppercase tracking-wide hover:bg-white transition-colors"
              style={{ boxShadow: '0 0 28px rgba(200,255,0,0.45), 0 4px 16px rgba(0,0,0,0.3)' }}
            >
              เริ่มต้นฟรี
            </Link>
            <Link
              href="#how-it-works"
              className="rounded-full border-2 border-[#c8ff00]/50 px-7 py-3 text-sm font-bold text-[#c8ff00]/80 uppercase tracking-wide hover:border-[#c8ff00] hover:text-[#c8ff00] transition-colors"
            >
              ดูวิธีใช้งาน
            </Link>
          </div>
        </div>
      </div>

      <div
        className="absolute z-0 right-170 bottom-0 w-[55%] lg:w-[24%] pointer-events-none hidden sm:block"
        aria-hidden
      >
        <Image
          src="/index.png"
          alt="นักวิทยาศาสตร์และแขนหุ่นยนต์"
          width={4600}
          height={4912}
          className="w-full h-auto"
          sizes="(max-width: 1024px) 55vw, 24vw"
          priority
        />
      </div>
    </section>
  );
}


const featureList = [
  {
    icon: <MonitorIcon />,
    title: 'ควบคุมแบบ Real-time',
    description: 'สั่งการอุปกรณ์แล็บจริงได้ทันทีผ่านเว็บเบราว์เซอร์ มีการตอบสนองต่ำกว่า 50ms',
  },
  {
    icon: <CameraIcon />,
    title: 'กล้อง HD หลายมุม',
    description: 'ดูการทดลองแบบ live ผ่านกล้องความละเอียดสูง พร้อมซูมและปรับมุมมองได้',
  },
  {
    icon: <ChartIcon />,
    title: 'วิเคราะห์ข้อมูลอัตโนมัติ',
    description: 'ระบบบันทึกและวิเคราะห์ค่าจาก sensor ทุกตัวแบบ real-time แสดงกราฟทันที',
  },
  {
    icon: <UsersIcon />,
    title: 'ทำงานร่วมกัน',
    description: 'เชิญเพื่อนร่วมทีมเข้า session เดียวกันได้สูงสุด 10 คน พร้อม chat และ annotation',
  },
  {
    icon: <ShieldIcon />,
    title: 'ปลอดภัยสูงสุด',
    description: 'ระบบตรวจจับความผิดปกติอัตโนมัติ มีการหยุดฉุกเฉินหากเกินขีดจำกัดที่กำหนด',
  },
  {
    icon: <ClockIcon />,
    title: 'จองล่วงหน้าได้ 24/7',
    description: 'เลือกช่วงเวลาที่สะดวก จองแล็บล่วงหน้าสูงสุด 30 วัน พร้อมยืนยันทันที',
  },
];

function Features() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const cards = sectionRef.current.querySelectorAll('.feature-card');
    animate(cards, { opacity: 0, translateY: 32, scale: 0.96, duration: 0 });

    const playIn = () => animate(cards, {
      opacity: [0, 1], translateY: [32, 0], scale: [0.96, 1], duration: 650, delay: stagger(90), ease: 'outCubic',
    });
    const observer = onScroll({
      target: sectionRef.current,
      onEnterForward: () => { animate(cards, { opacity: 0, translateY: 32, scale: 0.96, duration: 0 }); playIn(); },
      onEnterBackward: () => { animate(cards, { opacity: 0, translateY: 32, scale: 0.96, duration: 0 }); playIn(); },
    });

    return () => { observer.revert(); };
  }, []);

  return (
    <section ref={sectionRef} id="features" className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-semibold text-[#c8ff00] mb-3 tracking-wider uppercase">
            ฟีเจอร์หลัก
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            ทุกสิ่งที่ต้องการสำหรับการทดลองระยะไกล
          </h2>
          <p className="mt-4 text-gray-400">
            เราออกแบบทุกฟีเจอร์มาเพื่อให้การทดลองจากระยะไกล
            ใกล้เคียงกับการอยู่ในห้องแล็บจริงมากที่สุด
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featureList.map((feature) => (
            <div
              key={feature.title}
              className="feature-card group relative rounded-2xl border border-white/10 bg-gray-900/50 p-6 hover:border-[#c8ff00]/30 hover:bg-gray-900 transition-all overflow-hidden"
            >
              <div className="absolute top-0 left-6 right-6 h-px bg-linear-to-r from-transparent via-[#c8ff00]/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#c8ff00]/10 text-[#c8ff00] group-hover:bg-[#c8ff00]/20 transition-colors">
                {feature.icon}
              </div>
              <h3 className="mb-2 text-base font-semibold text-white">{feature.title}</h3>
              <p className="text-sm leading-6 text-gray-400 group-hover:text-gray-300 transition-colors">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const steps = [
  {
    step: '01',
    title: 'จองเวลา',
    description:
      'เลือกประเภทการทดลองและช่วงเวลาที่ต้องการ ระบบจะยืนยันการจองภายในไม่กี่วินาที',
  },
  {
    step: '02',
    title: 'เชื่อมต่อ',
    description:
      'เปิดเบราว์เซอร์ตามเวลาที่จอง ระบบเชื่อมต่อกับอุปกรณ์แล็บโดยอัตโนมัติ ไม่ต้องติดตั้งอะไร',
  },
  {
    step: '03',
    title: 'ทดลอง',
    description:
      'ควบคุมอุปกรณ์ ดูภาพ live และรับข้อมูล sensor แบบ real-time บันทึกผลและดาวน์โหลดรายงานได้เลย',
  },
];

function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const circles = sectionRef.current.querySelectorAll('.step-circle');
    const texts = sectionRef.current.querySelectorAll('.step-text');
    animate([circles, texts], { opacity: 0, duration: 0 });

    const playIn = () => {
      animate(circles, { opacity: [0, 1], scale: [0.6, 1], duration: 700, delay: stagger(150), ease: 'outBack' });
      animate(texts, { opacity: [0, 1], translateY: [16, 0], duration: 600, delay: stagger(150, { start: 300 }), ease: 'outCubic' });
    };
    const reset = () => animate([circles, texts], { opacity: 0, duration: 0 });
    const observer = onScroll({
      target: sectionRef.current,
      onEnterForward: () => { reset(); playIn(); },
      onEnterBackward: () => { reset(); playIn(); },
    });

    return () => { observer.revert(); };
  }, []);

  return (
    <section ref={sectionRef} id="how-it-works" className="py-24 sm:py-32 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-semibold text-[#c8ff00] mb-3 tracking-wider uppercase">
            วิธีใช้งาน
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            เริ่มทดลองได้ใน 3 ขั้นตอน
          </h2>
        </div>

        <div className="relative">
          <div className="absolute top-12 left-0 right-0 hidden lg:block">
            <div className="mx-auto max-w-3xl">
              <div className="h-px bg-linear-to-r from-transparent via-[#c8ff00]/30 to-transparent" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((item) => (
              <div key={item.step} className="relative text-center group">
                <div className="step-circle mx-auto mb-6 relative inline-flex h-24 w-24 items-center justify-center">
                  <div
                    className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(200,255,0,0.15) 0%, transparent 70%)',
                    }}
                  />
                  <div className="absolute inset-0 rounded-full border border-[#c8ff00]/30 bg-gray-900 group-hover:border-[#c8ff00]/60 transition-colors duration-300" />
                  <span className="relative font-mono text-3xl font-bold text-[#c8ff00]">
                    {item.step}
                  </span>
                </div>
                <div className="step-text">
                  <h3 className="text-xl font-semibold text-white mb-3">{item.title}</h3>
                  <p className="text-gray-400 leading-7">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const statItems = [
  { end: 500, display: '500+', render: (n: number) => `${Math.round(n)}+`, label: 'อุปกรณ์แล็บ' },
  { end: 12000, display: '12,000+', render: (n: number) => `${Math.round(n).toLocaleString()}+`, label: 'นักศึกษาและนักวิจัย' },
  { end: 99.9, display: '99.9%', render: (n: number) => `${n.toFixed(1)}%`, label: 'uptime' },
  { end: 150, display: '150+', render: (n: number) => `${Math.round(n)}+`, label: 'มหาวิทยาลัยทั่วโลก' },
];

function Stats() {
  const sectionRef = useRef<HTMLElement>(null);
  const ddRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (!sectionRef.current) return;

    const playIn = () => {
      statItems.forEach((stat, i) => {
        const el = ddRefs.current[i];
        if (!el) return;
        el.textContent = stat.render(0);
        const obj = { val: 0 };
        animate(obj, {
          val: [0, stat.end],
          duration: 1800,
          delay: i * 120,
          ease: 'outExpo',
          onUpdate: () => { el.textContent = stat.render(obj.val); },
          onComplete: () => { el.textContent = stat.display; },
        });
      });
    };
    const observer = onScroll({
      target: sectionRef.current,
      onEnterForward: () => playIn(),
      onEnterBackward: () => playIn(),
    });

    return () => { observer.revert(); };
  }, []);

  return (
    <section ref={sectionRef} className="py-20 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/5 rounded-2xl overflow-hidden">
          {statItems.map((stat, i) => (
            <div key={stat.label} className="bg-gray-950 px-8 py-10 text-center">
              <dd
                ref={(el) => { ddRefs.current[i] = el; }}
                className="text-4xl font-bold tracking-tight"
                style={{ color: '#c8ff00', textShadow: '0 0 24px rgba(200,255,0,0.35)' }}
              >
                {stat.display}
              </dd>
              <dt className="mt-2 text-sm text-gray-500">{stat.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function CTA() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const inner = sectionRef.current.querySelector('.cta-inner');
    if (!inner) return;
    animate(inner, { opacity: 0, translateY: 32, duration: 0 });

    const playIn = () => animate(inner, { opacity: [0, 1], translateY: [32, 0], duration: 800, ease: 'outCubic' });
    const observer = onScroll({
      target: sectionRef.current,
      onEnterForward: () => { animate(inner, { opacity: 0, translateY: 32, duration: 0 }); playIn(); },
      onEnterBackward: () => { animate(inner, { opacity: 0, translateY: 32, duration: 0 }); playIn(); },
    });

    return () => { observer.revert(); };
  }, []);

  return (
    <section ref={sectionRef} className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div
          className="relative rounded-3xl overflow-hidden border border-[#c8ff00]/20 p-12 text-center"
          style={{
            background:
              'radial-gradient(ellipse at center top, rgba(200,255,0,0.08) 0%, rgba(7,16,138,0.12) 50%, transparent 70%), #0a0f1e',
          }}
        >
          {/* Dot grid */}
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage:
                'radial-gradient(circle, rgba(200,255,0,0.2) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
              maskImage:
                'radial-gradient(ellipse at center, black 30%, transparent 75%)',
            }}
          />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 rounded-full bg-[#c8ff00]/10 blur-3xl pointer-events-none" />

          <div className="cta-inner relative">
            <p className="text-sm font-semibold text-[#c8ff00] mb-4 tracking-wider uppercase">
              เริ่มต้นวันนี้
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              พร้อมเริ่มต้นแล้วหรือยัง?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-gray-400">
              ทดลองใช้งาน Remote Lab ฟรี 30 วัน ไม่ต้องใส่ข้อมูลบัตรเครดิต ยกเลิกได้ทุกเมื่อ
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="w-full sm:w-auto rounded-full bg-[#c8ff00] px-8 py-3.5 text-base font-semibold text-gray-950 hover:bg-white transition-colors"
                style={{ boxShadow: '0 0 32px rgba(200,255,0,0.4), 0 4px 16px rgba(0,0,0,0.3)' }}
              >
                สมัครฟรีตอนนี้
              </Link>
              <Link
                href="/demo"
                className="w-full sm:w-auto rounded-full border border-white/20 px-8 py-3.5 text-base text-white hover:bg-white/5 hover:border-white/30 transition-colors"
              >
                ชมตัวอย่าง Demo
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-gray-600">
              {['ไม่ต้องใส่บัตรเครดิต', 'ยกเลิกได้ทุกเมื่อ', 'ฟรี 30 วัน', 'รองรับ 150+ มหาวิทยาลัย'].map(
                (item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <span className="text-[#c8ff00]">✓</span> {item}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 py-12">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#c8ff00]">
              <FlaskIcon />
            </div>
            <span className="text-sm font-semibold">
              Remote<span className="text-[#c8ff00]">Lab</span>
            </span>
          </div>
          <p className="text-sm text-gray-600">
            © {new Date().getFullYear()} RemoteLab. สงวนลิขสิทธิ์ทุกประการ
          </p>
          <div className="flex gap-6 text-sm text-gray-600">
            <Link href="/privacy" className="hover:text-gray-400 transition-colors">
              นโยบายความเป็นส่วนตัว
            </Link>
            <Link href="/terms" className="hover:text-gray-400 transition-colors">
              เงื่อนไขการใช้งาน
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FlaskIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-950">
      <path d="M9 3h6M9 3v7l-5 9h16l-5-9V3" />
      <path d="M7.5 18h9" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18 9l-5 5-4-4-3 3" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function RotateIcon() {
  const bodyRef   = useRef<SVGPathElement>(null);
  const targetRef = useRef<SVGPathElement>(null);

  const portrait  = 'M 25.5 10 L 38.5 10 Q 42 10 42 13.5 L 42 42.5 Q 42 46 38.5 46 L 25.5 46 Q 22 46 22 42.5 L 22 13.5 Q 22 10 25.5 10 Z';
  const landscape = 'M 17.5 22 L 46.5 22 Q 50 22 50 25.5 L 50 38.5 Q 50 42 46.5 42 L 17.5 42 Q 14 42 14 38.5 L 14 25.5 Q 14 22 17.5 22 Z';

  useEffect(() => {
    if (!bodyRef.current || !targetRef.current) return;
    animate(bodyRef.current, {
      d: morphTo(targetRef.current),
      duration: 850,
      ease: 'inOutCubic',
      loop: true,
      alternate: true,
      loopDelay: 700,
    });
  }, []);

  return (
    <svg width="52" height="52" viewBox="0 0 64 64" fill="none">
      {/* Hidden target shape for morphTo — must exist in DOM */}
      <path ref={targetRef} d={landscape} style={{ visibility: 'hidden', pointerEvents: 'none' }} />
      {/* Phone body — morphs portrait → landscape → portrait */}
      <path ref={bodyRef} d={portrait} stroke="#c8ff00" strokeWidth="2" fill="rgba(200,255,0,0.07)" />
    </svg>
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
