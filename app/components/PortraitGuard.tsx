'use client';

import { useEffect, useRef } from 'react';
import { animate, morphTo } from 'animejs';

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
      <path ref={targetRef} d={landscape} style={{ visibility: 'hidden', pointerEvents: 'none' }} />
      <path ref={bodyRef} d={portrait} stroke="#c8ff00" strokeWidth="2" fill="rgba(200,255,0,0.07)" />
    </svg>
  );
}

export default function PortraitGuard() {
  return (
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
  );
}
