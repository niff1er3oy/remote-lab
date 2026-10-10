'use client';

import { useLayoutEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';
import { prefersReducedMotion } from '@/lib/motion';
import { fixed, signedFixed } from '@/lib/physics';
import {
  clockTime, describeEvent, difference, differencePercent, END_HEADLINE, endReasonOf, summarise, visitCsv,
  type LabEvent, type LabReading,
} from '@/lib/lab-activity';

function durationText(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h} ชม. ${m} นาที`;
  if (m > 0) return `${m} นาที ${s} วินาที`;
  return `${s} วินาที`;
}

function downloadCsv(events: LabEvent[]) {
  const d = new Date(events[0]?.at ?? Date.now());
  const two = (n: number) => String(n).padStart(2, '0');
  // The byte-order mark makes Excel read the Thai text as UTF-8.
  const blob = new Blob(['﻿' + visitCsv(events)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lab8_${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}${two(d.getMinutes())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** How keeping the record in the student's history is going. */
export type SaveState = 'saving' | 'saved' | 'failed';

// Shown in place of the lab room once the visit is over, and again from the
// dashboard's history: what was done, the values that came out of it, and the
// whole record to take away as CSV. `save` is given only on finishing, while
// the record is being kept; a summary opened from history is already kept.
export default function LabSummary({ events, experimentName, onLeave, save, onRetrySave }: {
  events: LabEvent[];
  experimentName: string;
  onLeave: () => void;
  save?: SaveState;
  onRetrySave?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const summary = summarise(events);
  const backgroundTried = events.some((e) => e.kind === 'background' || e.kind === 'zero');
  // A record saved before the visit ended (the page was left) has no ending.
  const headline = END_HEADLINE[endReasonOf(events) ?? 'finished'];
  // The zero changed part-way, by a Set 0 or by coming back into the room: no
  // one figure is true of every value.
  const zeroChanged = summary.rezeroed > 0 || summary.entries > 1;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    const intro = animate(root.querySelectorAll('[data-rise]'), {
      opacity: [0, 1], translateY: [18, 0], duration: 520, delay: stagger(70), ease: 'outCubic',
    });
    const rows = animate(root.querySelectorAll('[data-row]'), {
      opacity: [0, 1], translateX: [-10, 0], duration: 320, delay: stagger(18, { start: 320 }), ease: 'outCubic',
    });
    return () => { intro.pause(); rows.pause(); };
  }, []);

  const stats = [
    { label: 'เวลาที่ใช้', value: durationText(summary.durationSeconds) },
    { label: 'อุปกรณ์ที่ใช้', value: `${summary.instruments.length} ชุด` },
    {
      label: 'คำสั่งอุปกรณ์',
      value: `${summary.commands} ครั้ง`,
      note: summary.failedCommands > 0 ? `ไม่สำเร็จ ${summary.failedCommands} ครั้ง` : undefined,
    },
    { label: 'ค่าที่บันทึก', value: `${summary.readings.length} ค่า` },
    { label: 'คำถามถึงผู้ช่วย', value: `${summary.questions} ข้อ` },
  ];

  return (
    <div ref={rootRef} className="h-screen overflow-y-auto bg-[#030712] text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-8 short:gap-4 short:py-5">
        <header data-rise>
          <p className="text-sm text-gray-400">{headline}</p>
          <h1 className="mt-1 text-2xl font-bold text-[#c8ff00] short:text-xl">สรุปการทดลอง</h1>
          <p className="mt-1 text-sm text-gray-300">{experimentName}</p>
          {summary.startedAt !== null && summary.endedAt !== null && (
            <p className="mt-0.5 font-mono text-sm text-gray-500">
              {new Date(summary.startedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
              {'  '}{clockTime(summary.startedAt)} ถึง {clockTime(summary.endedAt)}
            </p>
          )}
        </header>

        <dl data-rise className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-gray-900/50 px-3 py-2.5">
              <dt className="text-xs text-gray-500">{s.label}</dt>
              <dd className="mt-0.5 font-mono text-base font-semibold text-white">{s.value}</dd>
              {s.note && <dd className="text-xs text-red-400">{s.note}</dd>}
            </div>
          ))}
        </dl>

        <section data-rise className="rounded-xl border border-white/10 bg-gray-900/50">
          <h2 className="border-b border-white/5 px-4 py-2.5 text-sm font-semibold text-gray-200">ค่าที่ได้จากการทดลอง</h2>
          {/* What the measured values are measured from. */}
          {backgroundTried && (
            <p data-background className="border-b border-white/5 px-4 py-2 text-xs text-gray-400">
              {zeroChanged
                ? <>
                  ค่า B วัดจริงแต่ละค่าหักค่าศูนย์ที่ใช้อยู่ขณะวัดออกแล้ว{' '}
                  {summary.entries > 1 && <>รอบนี้เข้าห้อง {summary.entries} ครั้ง และอ่านสนามพื้นหลังใหม่ทุกครั้งที่เข้า{' '}</>}
                  {summary.rezeroed > 0 && <>รอบนี้ตั้งศูนย์ใหม่ด้วย Set 0 {summary.rezeroed} ครั้ง{' '}</>}
                  {summary.zero !== null
                    ? <>ค่าล่าสุด <span className="font-mono text-gray-200">{fixed(summary.zero, 3)} mT</span></>
                    : 'ครั้งล่าสุดอ่านไม่ได้ ค่าที่วัดหลังจากนั้นจึงยังรวมสนามพื้นหลัง'}
                  {' '}(ดูเวลาและค่าของแต่ละครั้งในลำดับเหตุการณ์)
                </>
                : summary.background !== null
                  ? <>ค่า B วัดจริงทุกค่าหักสนามพื้นหลัง <span className="font-mono text-gray-200">{fixed(summary.background, 3)} mT</span> ออกแล้ว (อ่านตอนเข้าห้อง ก่อนเปิดอุปกรณ์)</>
                  : 'ค่า B วัดจริงยังรวมสนามพื้นหลัง เพราะเซนเซอร์ไม่ส่งค่าตอนเข้าห้อง จึงอ่านค่าพื้นหลังไม่ได้'}
            </p>
          )}
          {summary.readings.length === 0 ? (
            <p className="px-4 py-5 text-sm text-gray-500">รอบนี้ยังไม่มีค่าที่บันทึกไว้</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="px-4 py-2 font-medium">อุปกรณ์</th>
                    <th className="px-3 py-2 text-right font-medium">Z (cm)</th>
                    <th className="px-3 py-2 text-right font-medium">I (A)</th>
                    <th className="px-3 py-2 text-right font-medium">B ทฤษฎี (mT)</th>
                    <th className="px-3 py-2 text-right font-medium">B วัดจริง (mT)</th>
                    <th className="px-3 py-2 text-right font-medium">ΔB (mT)</th>
                    <th className="px-4 py-2 text-right font-medium">ΔB (%)</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {summary.readings.map((r) => <ReadingRow key={`${r.instrument}|${r.zCm}`} reading={r} />)}
                </tbody>
              </table>
            </div>
          )}
          {summary.readings.some((r) => r.bMeasured === null) && (
            <p className="border-t border-white/5 px-4 py-2 text-xs text-gray-500">
              ช่องที่เป็น “—” คือช่วงที่เซนเซอร์ไม่ส่งค่า จึงไม่มีค่าวัดจริง
            </p>
          )}
        </section>

        <section data-rise className="rounded-xl border border-white/10 bg-gray-900/50">
          <h2 className="border-b border-white/5 px-4 py-2.5 text-sm font-semibold text-gray-200">
            ลำดับเหตุการณ์ <span className="font-mono font-normal text-gray-500">{events.length}</span>
          </h2>
          <ol className="max-h-72 overflow-y-auto px-4 py-2 text-sm short:max-h-56">
            {events.map((e, i) => (
              <li key={i} data-row className="flex gap-3 py-1">
                <span className="shrink-0 font-mono tabular-nums text-gray-600">{clockTime(e.at)}</span>
                <span className={e.ok === false ? 'text-red-300' : 'text-gray-300'}>{describeEvent(e)}</span>
              </li>
            ))}
          </ol>
        </section>

        <div data-rise className="flex flex-wrap items-center gap-3 pb-4">
          <button
            onClick={() => downloadCsv(events)}
            className="flex items-center gap-2 rounded-full bg-[#c8ff00] px-5 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c8ff00]"
            style={{ boxShadow: '0 0 16px rgba(200,255,0,0.3)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </svg>
            ดาวน์โหลด CSV
          </button>
          <button
            onClick={onLeave}
            className="rounded-full border border-white/10 px-5 py-2 text-sm text-gray-300 transition-colors hover:border-cyan-500/30 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            กลับหน้าหลัก
          </button>
          {save === 'failed' ? (
            <p role="alert" className="flex flex-wrap items-center gap-2 text-xs text-red-300">
              เก็บบันทึกนี้ลงประวัติไม่สำเร็จ ดาวน์โหลด CSV ไว้ก่อนออกจากหน้านี้
              <button
                onClick={onRetrySave}
                className="h-6 rounded-full border border-red-400/40 px-3 font-semibold text-red-200 transition-colors hover:bg-red-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              >
                ลองเก็บอีกครั้ง
              </button>
            </p>
          ) : (
            <p role="status" className="text-xs text-gray-500">
              {save === 'saving' ? 'กำลังเก็บบันทึกนี้ลงประวัติ' : 'บันทึกนี้เก็บไว้ในประวัติแล้ว เปิดดูย้อนหลังได้จากแดชบอร์ด'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadingRow({ reading: r }: { reading: LabReading }) {
  const d = difference(r);
  const pct = differencePercent(r);
  const off = pct !== null && Math.abs(pct) > 5;
  return (
    <tr data-row className="border-t border-white/5">
      <td className="px-4 py-1.5 font-sans text-gray-200">{r.instrument}</td>
      <td className="px-3 py-1.5 text-right text-[#a78bfa]">{r.zCm === null ? '—' : r.zCm > 0 ? `+${r.zCm}` : r.zCm}</td>
      <td className="px-3 py-1.5 text-right text-gray-300">{r.I.toFixed(2)}</td>
      <td className="px-3 py-1.5 text-right text-[#c8ff00]">{r.bTheory.toFixed(3)}</td>
      <td className="px-3 py-1.5 text-right text-cyan-400">{r.bMeasured === null ? '—' : fixed(r.bMeasured, 3)}</td>
      <td className={`px-3 py-1.5 text-right ${off ? 'text-red-400' : 'text-gray-300'}`}>{d === null ? '—' : signedFixed(d, 3)}</td>
      <td className={`px-4 py-1.5 text-right ${off ? 'text-red-400' : 'text-gray-300'}`}>{pct === null ? '—' : signedFixed(pct, 1)}</td>
    </tr>
  );
}
