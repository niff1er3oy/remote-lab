// Runs the unit tests and writes docs/TEST_REPORT.md: every test, whether it
// passed, and a short note on what each test file is for.
//
//   node scripts/test-report.mjs        (or: npm run test:report)
//
// The report is generated, so it always matches the suite; edit the notes
// below, not the report.

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

// What each test file checks, in a sentence. A file missing here is still
// listed, without a note.
const NOTES = {
  'safety.test.ts': 'ตัวกันของชุดทดสอบเอง: เทสต์ต้องไม่ใช้ credential จริง และแตะ Firebase หรือเครือข่ายไม่ได้ถ้าไม่ได้จำลองไว้',
  'physics.test.ts': 'สูตรสนามแม่เหล็กของขดลวดเดี่ยวและโซลีนอยด์ ค่าคงที่ของโซลีนอยด์ 8 cm และตำแหน่งหัววัด 13 จุด',
  'field-lines.test.ts': 'ข้อมูลเส้นสนามที่ใช้วาดภาพในหน้าแรก: สมมาตร ไม่ตัดกัน และได้สัดส่วนจริงของอุปกรณ์',
  'webrtc-latency.test.ts': 'การคำนวณความหน่วงของวิดีโอจากสถิติ WebRTC (เครือข่าย บัฟเฟอร์ ถอดรหัส) และการตรวจภาพค้าง',
  'lab-activity.test.ts': 'บันทึกกิจกรรมในห้องแลป: ตัวเลขสรุป ค่าที่วัดได้ ข้อความแต่ละเหตุการณ์ และไฟล์ CSV',
  'lab-status.test.ts': 'การตรวจว่ากล้องและเซนเซอร์ตอบสนองหรือไม่ และ API สถานะอุปกรณ์ของ admin',
  'rig.test.ts': 'ตัวรันสคริปต์อุปกรณ์: ตำแหน่งสคริปต์และ Python จาก env การตัดวงจรทั้งหมด และการจำสถานะอุปกรณ์',
  'rig-access.test.ts': 'กติกาว่าใครสั่งอุปกรณ์ได้: รอบที่กำลังดำเนินอยู่ รอบที่เพิ่งจบ และกรณีที่ไม่มีสิทธิ์',
  'session.test.ts': 'การออกและตรวจ session cookie',
  'auth-client.test.ts': 'การล็อกอินด้วย Google ฝั่งเบราว์เซอร์ และข้อความ error ที่แสดงผู้ใช้',
  'motion.test.ts': 'ตัวช่วยแอนิเมชัน: ไม่ซ่อนเนื้อหาเมื่อผู้ใช้ตั้ง reduced motion หรือเนื้อหาอยู่บนจอแล้ว',
  'math.test.tsx': 'การแสดงสูตรคณิตศาสตร์ด้วย KaTeX ในแชตผู้ช่วย AI',
  'lib-gaps.test.ts': 'กรณีที่เหลือของโมดูลใน lib ที่เทสต์ไฟล์อื่นยังไม่ครอบคลุม',
  'api/hardware.test.ts': 'API สั่งอุปกรณ์: สิทธิ์ คำสั่งที่รับ ช่วงตำแหน่งหัววัด การกันคำสั่งซ้อน และการไม่เปิดเผยรายละเอียดเมื่อสคริปต์ล้มเหลว',
  'api/chat.test.ts': 'API ผู้ช่วย AI: สิทธิ์ การกรองข้อความ ข้อมูลที่ส่งให้โมเดล และการจัดการ error จากผู้ให้บริการ',
  'api/bookings.test.ts': 'การจองรอบ: การตรวจข้อมูล การกันจองซ้อน และสิ่งที่ถูกบันทึก',
  'api/bookings-id.test.ts': 'การเริ่ม จบ และยกเลิกการจองของตัวเอง',
  'api/active-session.test.ts': 'การตรวจว่าผู้ใช้มีรอบกำลังดำเนินอยู่หรือรอบถัดไป',
  'api/availability.test.ts': 'ตารางช่องเวลาว่าง 7 วัน',
  'api/notify-upcoming.test.ts': 'การแจ้งเตือนเมื่อถึงเวลาเข้าห้องแลปและก่อนเริ่ม 5 นาที โดยไม่ส่งซ้ำ',
  'api/notifications.test.ts': 'รายการแจ้งเตือนและการทำเครื่องหมายว่าอ่านแล้ว',
  'api/dashboard-history.test.ts': 'ประวัติการใช้งาน: รายการที่นับเป็นประวัติ เวลาที่ใช้ และการแบ่งหน้า',
  'api/dashboard-stats.test.ts': 'ตัวเลขสรุปและรอบที่จองไว้บน dashboard',
  'api/auth.test.ts': 'การสร้าง session จากการล็อกอิน Google การอ่านผู้ใช้ปัจจุบัน และการออกจากระบบ',
  'api/cam.test.ts': 'พร็อกซีกล้อง: การส่งต่อไปยังกล้องที่ถูกต้อง และการกัน path ที่พยายามออกนอกที่อยู่ของกล้อง',
  'api/db-test.test.ts': 'การตรวจการเชื่อมต่อฐานข้อมูล',
  'api/admin.test.ts': 'API ของ admin: สิทธิ์ ภาพรวมการจอง การยกเลิกและสิ้นสุดรอบ การปิดช่วงเวลา การเปิดปิดแลป และแหล่งจ่ายไฟ',
  'api/instruments.test.ts': 'การเปิดปิดอุปกรณ์การทดลองโดย admin และผลต่อ API อุปกรณ์กับหน้าห้องแลป',
  'api/gaps.test.ts': 'กรณีที่เหลือของ API ที่เทสต์ไฟล์อื่นยังไม่ครอบคลุม เช่น ฐานข้อมูลล้มเหลว',
  'components/BookingCalendar.test.tsx': 'ตารางจอง: สถานะช่องเวลา การจองและยกเลิก และข้อความผลลัพธ์',
  'components/GlobalNotifications.test.tsx': 'กระดิ่ง แผงแจ้งเตือน และ toast: การแสดง การปิด การหายเอง และ reduced motion',
  'components/useNotifications.test.tsx': 'ตัวดึงการแจ้งเตือน: รอบการดึงทุก 30 วินาที การทำเครื่องหมายอ่าน และเมื่อคำขอล้มเหลว',
  'components/DashboardNav.test.tsx': 'แถบเมนูผู้ใช้: เมนู ลิงก์ผู้ดูแลระบบ และการออกจากระบบ',
  'components/FieldDiagram.test.tsx': 'ภาพเส้นสนามในหน้าแรก',
  'components/LoginPage.test.tsx': 'หน้าเข้าสู่ระบบ',
  'components/PortraitGuard.test.tsx': 'ข้อความให้หมุนจอเมื่อถือแนวตั้ง',
  'components/SlideIn.test.tsx': 'แผงที่เลื่อนเข้าเมื่อปรากฏ',
  'components/AdminPage.test.tsx': 'หน้า admin: การกันสิทธิ์ ห้องแลปตอนนี้ ปุ่มอุปกรณ์ การเปิดปิดแลปและอุปกรณ์ การปิดช่วงเวลา และตารางการจอง',
  'components/EquipmentStatus.test.tsx': 'ส่วนสถานะอุปกรณ์ในหน้า admin: ชุดทดลอง แหล่งจ่ายไฟ กล้อง และเซนเซอร์',
  'components/LabSummary.test.tsx': 'หน้าสรุปการทดลองเมื่อออกจากห้องแลป และการดาวน์โหลด CSV',
};

const GROUPS = [
  ['api/', 'API ฝั่งเซิร์ฟเวอร์'],
  ['components/', 'หน้าเว็บและคอมโพเนนต์'],
  ['', 'ไลบรารีและตรรกะกลาง'],
];

const out = path.join(tmpdir(), `remote-lab-jest-${process.pid}.json`);
try {
  execSync(`npx jest --json --outputFile="${out}"`, { cwd: root, stdio: 'ignore' });
} catch {
  // A failing test makes jest exit non-zero; the results are still written.
}
const run = JSON.parse(readFileSync(out, 'utf8'));
rmSync(out, { force: true });

const files = run.testResults
  .map((f) => ({
    name: path.relative(path.join(root, '__tests__'), f.name).replace(/\\/g, '/'),
    tests: f.assertionResults,
    crashed: f.assertionResults.length === 0 && f.status === 'failed' ? f.message : '',
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const passed = (f) => f.tests.filter((t) => t.status === 'passed').length;
const failed = (f) => f.tests.filter((t) => t.status === 'failed').length + (f.crashed ? 1 : 0);
const groupOf = (name) => GROUPS.find(([prefix]) => name.startsWith(prefix))[1];
const when = new Date(run.startTime).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
const seconds = ((Math.max(...run.testResults.map((f) => f.endTime)) - run.startTime) / 1000).toFixed(1);

const lines = [];
lines.push('# รายงานผลการทดสอบ unit test', '');
lines.push('ไฟล์นี้สร้างโดย `npm run test:report` จากผลการรันจริง ไม่ต้องแก้ด้วยมือ', '');
lines.push(`- รันเมื่อ: ${when}`);
lines.push(`- ผลรวม: **${run.numFailedTests === 0 && run.numFailedTestSuites === 0 ? 'ผ่านทั้งหมด' : 'มีรายการไม่ผ่าน'}**`);
lines.push(`- จำนวนเทสต์: ${run.numTotalTests} ข้อ ใน ${run.numTotalTestSuites} ไฟล์ (ผ่าน ${run.numPassedTests} ไม่ผ่าน ${run.numFailedTests})`);
lines.push(`- เวลาที่ใช้: ${seconds} วินาที`, '');
lines.push('ทุกเทสต์รันกับตัวจำลองของ Firebase, ผู้ช่วย AI, กล้อง และเครื่องแลป จึงไม่แตะระบบจริง ชื่อเทสต์แต่ละข้อเขียนเป็นประโยคภาษาอังกฤษที่บอกพฤติกรรมที่ตรวจ', '');

lines.push('## สรุปตามหมวด', '', '| หมวด | ไฟล์ | เทสต์ | ผ่าน | ไม่ผ่าน |', '|---|---|---|---|---|');
for (const [, label] of GROUPS) {
  const inGroup = files.filter((f) => groupOf(f.name) === label);
  const sum = (fn) => inGroup.reduce((n, f) => n + fn(f), 0);
  lines.push(`| ${label} | ${inGroup.length} | ${sum((f) => f.tests.length)} | ${sum(passed)} | ${sum(failed)} |`);
}
lines.push('');

lines.push('## สรุปตามไฟล์', '', '| ไฟล์ทดสอบ | ตรวจอะไร | เทสต์ | ผล |', '|---|---|---|---|');
for (const f of files) {
  lines.push(`| \`${f.name}\` | ${NOTES[f.name] ?? ''} | ${f.tests.length} | ${failed(f) ? `ไม่ผ่าน ${failed(f)}` : 'ผ่าน'} |`);
}
lines.push('');

lines.push('## รายการทดสอบทั้งหมด', '');
for (const [, label] of GROUPS) {
  lines.push(`### ${label}`, '');
  for (const f of files.filter((x) => groupOf(x.name) === label)) {
    lines.push(`#### \`${f.name}\``, '');
    if (NOTES[f.name]) lines.push(NOTES[f.name], '');
    lines.push(`ผล: ${failed(f) ? `ไม่ผ่าน ${failed(f)} จาก ${f.tests.length} ข้อ` : `ผ่านทั้ง ${f.tests.length} ข้อ`}`, '');
    if (f.crashed) lines.push('ไฟล์นี้รันไม่ได้:', '', '```', f.crashed.trim().split('\n').slice(0, 12).join('\n'), '```', '');
    let section = null;
    for (const t of f.tests) {
      const heading = t.ancestorTitles.join(' › ');
      if (heading !== section) {
        section = heading;
        lines.push(`**${heading || 'ทั่วไป'}**`, '');
      }
      lines.push(`- ${t.status === 'passed' ? 'ผ่าน' : t.status === 'failed' ? '**ไม่ผ่าน**' : 'ข้าม'} — ${t.title}`);
      if (t.status === 'failed' && t.failureMessages?.[0]) {
        lines.push('', '  ```', ...t.failureMessages[0].split('\n').slice(0, 6).map((l) => `  ${l}`), '  ```', '');
      }
    }
    lines.push('');
  }
}

mkdirSync(path.join(root, 'docs'), { recursive: true });
writeFileSync(path.join(root, 'docs', 'TEST_REPORT.md'), lines.join('\n'));
console.log(`wrote docs/TEST_REPORT.md: ${run.numTotalTests} tests, ${run.numFailedTests} failed`);
process.exit(run.numFailedTests || run.numFailedTestSuites ? 1 : 0);
