'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate } from 'animejs';
import { prefersReducedMotion } from '@/lib/motion';

type Reach = 'online' | 'offline' | 'unset';
type Status = {
  checked_at: string;
  rig: { busy: boolean; circuit: string | null; position: number | null; supply: boolean | null; last: { command: string; ok: boolean; at: number; error?: string } | null };
  cameras: Array<{ key: string; state: Reach }>;
  sensor: Reach;
};

const POLL_MS = 10_000;
const CAMERA_NAME: Record<string, string> = {
  cam1: 'กล้องหลัก',
  cam2: 'กล้องเสริม (โซลีนอยด์)',
  cam3: 'กล้องเสริม (ขดลวด)',
};
const REACH: Record<Reach, { label: string; dot: string; text: string }> = {
  online: { label: 'ออนไลน์', dot: 'bg-[#c8ff00]', text: 'text-[#c8ff00]' },
  offline: { label: 'ไม่ตอบสนอง', dot: 'bg-red-500', text: 'text-red-300' },
  unset: { label: 'ยังไม่ได้ตั้งค่า', dot: 'bg-gray-600', text: 'text-gray-500' },
};
const CIRCUITS = [
  { script: 'coil_1.py', label: 'ขดลวด 1 รอบ', turns: 1 },
  { script: 'coil_2.py', label: 'ขดลวด 2 รอบ', turns: 2 },
  { script: 'coil_3.py', label: 'ขดลวด 3 รอบ', turns: 3 },
  { script: 'sole.py', label: 'โซลีนอยด์', turns: 0 },
];
const clock = (at: number | string) => new Date(at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' });

// The state of the equipment in the lab room, asked again every ten seconds.
export default function EquipmentStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const sweepRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stopped = false;
    const read = async () => {
      try {
        const res = await fetch('/api/admin/status');
        const data = await res.json();
        if (stopped) return;
        if (res.ok && data.ok) { setStatus(data); setFailed(false); } else setFailed(true);
      } catch {
        if (!stopped) setFailed(true);
      }
    };
    const first = setTimeout(read, 0);
    const timer = setInterval(read, POLL_MS);
    return () => { stopped = true; clearTimeout(first); clearInterval(timer); };
  }, []);

  // A bar that fills until the next check, so the page is seen to be watching.
  const checkedAt = status?.checked_at;
  useLayoutEffect(() => {
    if (!sweepRef.current || !checkedAt || prefersReducedMotion()) return;
    const sweep = animate(sweepRef.current, { scaleX: [0, 1], duration: POLL_MS, ease: 'linear' });
    return () => { sweep.pause(); };
  }, [checkedAt]);

  return (
    <section data-rise className="overflow-hidden rounded-xl border border-white/10 bg-gray-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <h2 className="text-sm font-semibold">สถานะอุปกรณ์ในแลป</h2>
        <p className="font-mono text-xs text-gray-500">
          {failed ? <span role="alert" className="font-sans text-red-300">อ่านสถานะไม่ได้ กำลังลองใหม่</span>
            : status ? `ตรวจล่าสุด ${clock(status.checked_at)}` : 'กำลังตรวจ'}
        </p>
      </div>
      <div className="mx-4 mt-2 h-px bg-white/5">
        <div ref={sweepRef} className="h-px origin-left bg-[#c8ff00]/60" style={{ transform: 'scaleX(0)' }} />
      </div>

      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <RigTile rig={status?.rig ?? null} />
        <div className="grid grid-cols-2 gap-3">
          {(status?.cameras ?? [{ key: 'cam1' }, { key: 'cam2' }, { key: 'cam3' }]).map((c) => (
            <ReachTile key={c.key} name={CAMERA_NAME[c.key] ?? c.key} state={'state' in c ? c.state : null} />
          ))}
          <ReachTile name="เซนเซอร์สนามแม่เหล็ก" state={status?.sensor ?? null} />
        </div>
      </div>
    </section>
  );
}

function ReachTile({ name, state }: { name: string; state: Reach | null }) {
  const tileRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const seen = useRef<Reach | null>(null);

  // The tile jumps when its state changes, so a camera dropping out is noticed.
  useLayoutEffect(() => {
    const changed = seen.current !== null && state !== null && seen.current !== state;
    seen.current = state;
    if (changed && tileRef.current && !prefersReducedMotion())
      animate(tileRef.current, { scale: [0.92, 1], duration: 520, ease: 'outElastic(1, .6)' });
  }, [state]);

  useLayoutEffect(() => {
    if (state !== 'online' || !ringRef.current || prefersReducedMotion()) return;
    const pulse = animate(ringRef.current, { scale: [1, 2.8], opacity: [0.55, 0], duration: 1800, ease: 'outQuad', loop: true });
    return () => { pulse.pause(); };
  }, [state]);

  const look = state ? REACH[state] : { label: 'กำลังตรวจ', dot: 'bg-gray-700', text: 'text-gray-500' };
  return (
    <div ref={tileRef} className={`rounded-lg border bg-gray-950/60 px-3 py-2.5 ${state === 'offline' ? 'border-red-500/30' : 'border-white/10'}`}>
      <p className="truncate text-xs text-gray-400" title={name}>{name}</p>
      <p className={`mt-1 flex items-center gap-2 text-sm font-semibold ${look.text}`}>
        <span className="relative flex h-2 w-2 shrink-0">
          {state === 'online' && <span ref={ringRef} className={`absolute inset-0 rounded-full ${look.dot}`} />}
          <span className={`relative h-2 w-2 rounded-full ${look.dot}`} />
        </span>
        {look.label}
      </p>
    </div>
  );
}

function RigTile({ rig }: { rig: Status['rig'] | null }) {
  const artRef = useRef<SVGSVGElement>(null);
  const probeRef = useRef<SVGGElement>(null);
  const circuit = rig?.circuit ?? null;
  const position = rig?.position ?? null;
  const active = CIRCUITS.find((c) => c.script === circuit) ?? null;

  // Current runs round whichever circuit is on.
  useLayoutEffect(() => {
    if (!artRef.current || !circuit || prefersReducedMotion()) return;
    const flow = animate(artRef.current.querySelectorAll('[data-live]'), { strokeDashoffset: [0, -20], duration: 900, ease: 'linear', loop: true });
    return () => { flow.pause(); };
  }, [circuit]);

  // The probe marker glides to where the probe was last sent.
  useLayoutEffect(() => {
    if (!probeRef.current || position === null) return;
    const x = position * 4; // 4 px per cm along the track
    if (prefersReducedMotion()) { probeRef.current.style.transform = `translateX(${x}px)`; return; }
    const glide = animate(probeRef.current, { translateX: x, duration: 700, ease: 'outCubic' });
    return () => { glide.pause(); };
  }, [position]);

  const headline = !rig ? 'กำลังตรวจ'
    : rig.busy ? 'กำลังทำตามคำสั่ง'
      : active ? `${active.label} เปิดอยู่`
        : rig.last ? 'ไม่มีวงจรที่เปิดอยู่' : 'ยังไม่มีคำสั่งตั้งแต่เซิร์ฟเวอร์เริ่มทำงาน';

  return (
    <div className="rounded-lg border border-white/10 bg-gray-950/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-400">ชุดทดลอง</p>
        {rig?.busy && (
          <svg className="animate-spin motion-reduce:animate-none text-[#c8ff00]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
        )}
      </div>
      <p className={`mt-1 text-sm font-semibold ${active || rig?.busy ? 'text-[#c8ff00]' : 'text-gray-300'}`}>{headline}</p>
      <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
        <span className={`h-1.5 w-1.5 rounded-full ${rig?.supply ? 'bg-[#c8ff00]' : rig?.supply === false ? 'bg-gray-500' : 'bg-gray-700'}`} />
        แหล่งจ่ายไฟ{' '}
        <span className={rig?.supply ? 'text-[#c8ff00]' : 'text-gray-300'}>
          {rig?.supply === true ? 'เปิดอยู่' : rig?.supply === false ? 'ปิดอยู่' : 'ยังไม่ทราบสถานะ'}
        </span>
      </p>

      <svg ref={artRef} viewBox="0 0 320 96" className="mt-2 block w-full max-w-md" role="img"
        aria-label={active ? `${active.label} เปิดอยู่${position !== null ? ` หัววัดอยู่ที่ ${position} เซนติเมตร` : ''}` : 'ไม่มีวงจรที่เปิดอยู่'}>
        {CIRCUITS.filter((c) => c.turns > 0).map((c, i) => {
          const on = c.script === circuit;
          const cx = 34 + i * 62;
          return (
            <g key={c.script}>
              {Array.from({ length: c.turns }, (_, t) => (
                <ellipse key={t} cx={cx + (t - (c.turns - 1) / 2) * 7} cy={30} rx={9} ry={20} fill="none"
                  stroke={on ? '#c8ff00' : 'rgba(255,255,255,0.18)'} strokeWidth={on ? 2 : 1.5}
                  strokeDasharray={on ? '6 4' : undefined} data-live={on ? '' : undefined}
                  style={on ? { filter: 'drop-shadow(0 0 4px rgba(200,255,0,0.45))' } : undefined} />
              ))}
              <text x={cx} y={66} textAnchor="middle" fontSize="9" fill={on ? '#c8ff00' : '#6b7280'}>{c.turns} รอบ</text>
            </g>
          );
        })}
        {(() => {
          const on = circuit === 'sole.py';
          return (
            <g>
              {Array.from({ length: 9 }, (_, t) => (
                <ellipse key={t} cx={226 + t * 9} cy={30} rx={4} ry={14} fill="none"
                  stroke={on ? '#c8ff00' : 'rgba(255,255,255,0.18)'} strokeWidth={on ? 1.8 : 1.2}
                  strokeDasharray={on ? '6 4' : undefined} data-live={on ? '' : undefined}
                  style={on ? { filter: 'drop-shadow(0 0 4px rgba(200,255,0,0.45))' } : undefined} />
              ))}
              <text x={262} y={66} textAnchor="middle" fontSize="9" fill={on ? '#c8ff00' : '#6b7280'}>โซลีนอยด์</text>
            </g>
          );
        })()}
        {/* Probe track: 30 cm drawn 120 px wide, centred under the solenoid. */}
        <line x1={202} y1={82} x2={322} y2={82} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        <line x1={262} y1={78} x2={262} y2={86} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        {position !== null && (
          <g ref={probeRef}>
            <circle cx={262} cy={82} r={4} fill="#22d3ee" />
            <text x={262} y={95} textAnchor="middle" fontSize="8" fill="#22d3ee">{position > 0 ? `+${position}` : position} cm</text>
          </g>
        )}
      </svg>

      <p className="mt-1 text-xs text-gray-500">
        {rig?.last
          ? <>คำสั่งล่าสุด <span className="font-mono text-gray-300">{rig.last.command}</span>{' '}
            <span className={rig.last.ok ? 'text-[#c8ff00]' : 'text-red-300'}>{rig.last.ok ? 'สำเร็จ' : 'ไม่สำเร็จ'}</span> เมื่อ {clock(rig.last.at)}</>
          : 'ยังไม่มีคำสั่ง'}
      </p>
      {rig?.last && !rig.last.ok && rig.last.error && (
        <pre role="alert" className="mt-1.5 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1.5 font-mono text-xs text-red-200">{rig.last.error}</pre>
      )}
      <p className="mt-0.5 text-xs text-gray-600">อ้างอิงจากคำสั่งที่เว็บส่งไป ไม่ใช่ค่าที่อ่านจากตัวอุปกรณ์</p>
    </div>
  );
}
