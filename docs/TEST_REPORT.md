# รายงานผลการทดสอบ unit test

ไฟล์นี้สร้างโดย `npm run test:report` จากผลการรันจริง ไม่ต้องแก้ด้วยมือ

- รันเมื่อ: 10 ตุลาคม 2569 เวลา 07:33
- ผลรวม: **ผ่านทั้งหมด**
- จำนวนเทสต์: 1639 ข้อ ใน 52 ไฟล์ (ผ่าน 1639 ไม่ผ่าน 0)
- เวลาที่ใช้: 9.8 วินาที

ทุกเทสต์รันกับตัวจำลองของ Firebase, ผู้ช่วย AI, กล้อง และเครื่องแลป จึงไม่แตะระบบจริง ชื่อเทสต์แต่ละข้อเขียนเป็นประโยคภาษาอังกฤษที่บอกพฤติกรรมที่ตรวจ

## สรุปตามหมวด

| หมวด | ไฟล์ | เทสต์ | ผ่าน | ไม่ผ่าน |
|---|---|---|---|---|
| API ฝั่งเซิร์ฟเวอร์ | 19 | 669 | 669 | 0 |
| หน้าเว็บและคอมโพเนนต์ | 15 | 514 | 514 | 0 |
| ไลบรารีและตรรกะกลาง | 18 | 456 | 456 | 0 |

## สรุปตามไฟล์

| ไฟล์ทดสอบ | ตรวจอะไร | เทสต์ | ผล |
|---|---|---|---|
| `api/active-session.test.ts` | การตรวจว่าผู้ใช้มีรอบกำลังดำเนินอยู่หรือรอบถัดไป | 19 | ผ่าน |
| `api/admin-tests.test.ts` | API ที่ส่งผลการทดสอบให้หน้า admin: เฉพาะ admin เท่านั้น | 4 | ผ่าน |
| `api/admin.test.ts` | API ของ admin: สิทธิ์ ภาพรวมการจอง การยกเลิกและสิ้นสุดรอบ การปิดช่วงเวลา การเปิดปิดแลป และแหล่งจ่ายไฟ | 80 | ผ่าน |
| `api/auth.test.ts` | การสร้าง session จากการล็อกอิน Google การอ่านผู้ใช้ปัจจุบัน และการออกจากระบบ | 22 | ผ่าน |
| `api/availability.test.ts` | ตารางช่องเวลาว่าง 7 วัน | 21 | ผ่าน |
| `api/bookings-id.test.ts` | การเริ่ม จบ และยกเลิกการจองของตัวเอง | 33 | ผ่าน |
| `api/bookings.test.ts` | การจองรอบ: การตรวจข้อมูล การกันจองซ้อน และสิ่งที่ถูกบันทึก | 36 | ผ่าน |
| `api/cam.test.ts` | พร็อกซีกล้อง: การส่งต่อไปยังกล้องที่ถูกต้อง และการกัน path ที่พยายามออกนอกที่อยู่ของกล้อง | 33 | ผ่าน |
| `api/chat.test.ts` | API ผู้ช่วย AI: สิทธิ์ การกรองข้อความ ข้อมูลที่ส่งให้โมเดล และการจัดการ error จากผู้ให้บริการ | 81 | ผ่าน |
| `api/dashboard-history.test.ts` | ประวัติการใช้งาน: รายการที่นับเป็นประวัติ เวลาที่ใช้ และการแบ่งหน้า | 24 | ผ่าน |
| `api/dashboard-stats.test.ts` | ตัวเลขสรุปและรอบที่จองไว้บน dashboard | 10 | ผ่าน |
| `api/db-test.test.ts` | การตรวจการเชื่อมต่อฐานข้อมูล | 4 | ผ่าน |
| `api/gaps.test.ts` | กรณีที่เหลือของ API ที่เทสต์ไฟล์อื่นยังไม่ครอบคลุม เช่น ฐานข้อมูลล้มเหลว | 24 | ผ่าน |
| `api/hardware.test.ts` | API สั่งอุปกรณ์: สิทธิ์ คำสั่งที่รับ ช่วงตำแหน่งหัววัด การกันคำสั่งซ้อน และการไม่เปิดเผยรายละเอียดเมื่อสคริปต์ล้มเหลว | 74 | ผ่าน |
| `api/instruments.test.ts` | การเปิดปิดอุปกรณ์การทดลองโดย admin และผลต่อ API อุปกรณ์กับหน้าห้องแลป | 79 | ผ่าน |
| `api/lab-presence.test.ts` |  | 38 | ผ่าน |
| `api/lab-record.test.ts` | การเก็บบันทึกการทดลองลงฐานข้อมูลและเปิดดูย้อนหลัง: การตรวจข้อมูลทีละเหตุการณ์ สิทธิ์ของเจ้าของรอบและ admin ช่วงเวลาที่บันทึกได้ และการไม่ให้บันทึกที่สั้นกว่าทับของเดิม | 40 | ผ่าน |
| `api/notifications.test.ts` | รายการแจ้งเตือนและการทำเครื่องหมายว่าอ่านแล้ว | 24 | ผ่าน |
| `api/notify-upcoming.test.ts` | การแจ้งเตือนเมื่อถึงเวลาเข้าห้องแลปและก่อนเริ่ม 5 นาที โดยไม่ส่งซ้ำ | 23 | ผ่าน |
| `auth-client.test.ts` | การล็อกอินด้วย Google ฝั่งเบราว์เซอร์ และข้อความ error ที่แสดงผู้ใช้ | 14 | ผ่าน |
| `components/AdminPage.test.tsx` | หน้า admin: การกันสิทธิ์ ห้องแลปตอนนี้ ปุ่มอุปกรณ์ การเปิดปิดแลปและอุปกรณ์ การปิดช่วงเวลา และตารางการจอง | 117 | ผ่าน |
| `components/AdminTestsPage.test.tsx` | หน้าผลการทดสอบของ admin: การกันสิทธิ์ ตัวเลขรวม หมวดหมู่ การค้นหา และการกรองรายการที่ไม่ผ่าน | 21 | ผ่าน |
| `components/BookingCalendar.test.tsx` | ตารางจอง: สถานะช่องเวลา การจองและยกเลิก และข้อความผลลัพธ์ | 53 | ผ่าน |
| `components/CurrentSettings.test.tsx` | ช่องตั้งค่ากระแสของแต่ละอุปกรณ์ในหน้า admin: การตรวจค่า การบันทึก และข้อความผลลัพธ์ | 15 | ผ่าน |
| `components/DashboardNav.test.tsx` | แถบเมนูผู้ใช้: เมนู ลิงก์ผู้ดูแลระบบ และการออกจากระบบ | 21 | ผ่าน |
| `components/EquipmentStatus.test.tsx` | ส่วนสถานะอุปกรณ์ในหน้า admin: ชุดทดลอง แหล่งจ่ายไฟ กล้อง และเซนเซอร์ | 62 | ผ่าน |
| `components/FieldDiagram.test.tsx` | ภาพเส้นสนามในหน้าแรก | 31 | ผ่าน |
| `components/FieldViz.test.tsx` | แบบจำลองสนามแม่เหล็กในห้องแลป: ภาพตัด 2D หัววัดกับลูกศรทฤษฎีและค่าวัด การสลับ 2D/3D และกรณีเครื่องไม่มี WebGL | 35 | ผ่าน |
| `components/GlobalNotifications.test.tsx` | กระดิ่ง แผงแจ้งเตือน และ toast: การแสดง การปิด การหายเอง และ reduced motion | 47 | ผ่าน |
| `components/LabSummary.test.tsx` | หน้าสรุปการทดลองเมื่อออกจากห้องแลป และการดาวน์โหลด CSV | 54 | ผ่าน |
| `components/LoginPage.test.tsx` | หน้าเข้าสู่ระบบ | 10 | ผ่าน |
| `components/PortraitGuard.test.tsx` | ข้อความให้หมุนจอเมื่อถือแนวตั้ง | 3 | ผ่าน |
| `components/ReadinessCheck.test.tsx` | ปุ่มตรวจความพร้อมของเครื่องแลปในหน้า admin และรายการผลที่แสดง | 12 | ผ่าน |
| `components/SlideIn.test.tsx` | แผงที่เลื่อนเข้าเมื่อปรากฏ | 5 | ผ่าน |
| `components/useNotifications.test.tsx` | ตัวดึงการแจ้งเตือน: รอบการดึงทุก 30 วินาที การทำเครื่องหมายอ่าน และเมื่อคำขอล้มเหลว | 28 | ผ่าน |
| `field-geometry.test.ts` | การอ่านแบบจำลองสนามไปวาด: เส้นของแต่ละอุปกรณ์ ความสว่างตามขนาดสนาม หัวลูกศร จำนวนเส้นในมุมมอง 3D และกรอบภาพ | 91 | ผ่าน |
| `field-lines.test.ts` | ข้อมูลเส้นสนามที่ใช้วาดภาพในหน้าแรก: สมมาตร ไม่ตัดกัน และได้สัดส่วนจริงของอุปกรณ์ | 36 | ผ่าน |
| `field-model.test.ts` | ข้อมูลเส้นสนามของแบบจำลองในห้องแลป: ตรวจทิศและขนาดสนามกับกฎบีโอต์-ซาวาร์โดยตรง ความสมมาตร ระยะห่างของเส้นตามความเข้มสนาม และจำนวนเส้นตามจำนวนรอบ | 39 | ผ่าน |
| `lab-activity.test.ts` | บันทึกกิจกรรมในห้องแลป: ตัวเลขสรุป ค่าที่วัดได้ ค่าพื้นหลังและการตั้งศูนย์ (Set 0) ข้อความแต่ละเหตุการณ์ และไฟล์ CSV | 48 | ผ่าน |
| `lab-presence.test.ts` |  | 28 | ผ่าน |
| `lab-readiness.test.ts` | การตรวจความพร้อมของเครื่องแลปจริง: ไฟล์สคริปต์ Python ไลบรารี ค่าจากเซนเซอร์ กล้อง ฐานข้อมูล และการไม่สั่งอุปกรณ์ทำงานระหว่างตรวจ | 22 | ผ่าน |
| `lab-status.test.ts` | การตรวจว่ากล้องและเซนเซอร์ตอบสนองหรือไม่ และ API สถานะอุปกรณ์ของ admin | 12 | ผ่าน |
| `lib-gaps.test.ts` | กรณีที่เหลือของโมดูลใน lib ที่เทสต์ไฟล์อื่นยังไม่ครอบคลุม | 16 | ผ่าน |
| `math.test.tsx` | การแสดงสูตรคณิตศาสตร์ด้วย KaTeX ในแชตผู้ช่วย AI | 5 | ผ่าน |
| `motion.test.ts` | ตัวช่วยแอนิเมชัน: ไม่ซ่อนเนื้อหาเมื่อผู้ใช้ตั้ง reduced motion หรือเนื้อหาอยู่บนจอแล้ว | 14 | ผ่าน |
| `physics.test.ts` | สูตรสนามแม่เหล็กของขดลวดเดี่ยวและโซลีนอยด์ ค่าคงที่ของโซลีนอยด์ 8 cm และตำแหน่งหัววัด 21 จุด | 20 | ผ่าน |
| `rig-access.test.ts` | กติกาว่าใครสั่งอุปกรณ์ได้: รอบที่กำลังดำเนินอยู่ รอบที่เพิ่งจบ และกรณีที่ไม่มีสิทธิ์ | 27 | ผ่าน |
| `rig.test.ts` | ตัวรันสคริปต์อุปกรณ์: ตำแหน่งสคริปต์และ Python จาก env การตัดวงจรทั้งหมด และการจำสถานะอุปกรณ์ | 31 | ผ่าน |
| `safety.test.ts` | ตัวกันของชุดทดสอบเอง: เทสต์ต้องไม่ใช้ credential จริง และแตะ Firebase หรือเครือข่ายไม่ได้ถ้าไม่ได้จำลองไว้ | 3 | ผ่าน |
| `sensor.test.ts` | การอ่านค่าจากเซนเซอร์สนามแม่เหล็ก: แปลง bx, by, bz หน่วยไมโครเทสลาเป็นขนาดสนามหน่วย mT คาลิเบต เฉลี่ย 20 ค่า และหักสนามพื้นหลัง | 30 | ผ่าน |
| `session.test.ts` | การออกและตรวจ session cookie | 12 | ผ่าน |
| `webrtc-latency.test.ts` | การคำนวณความหน่วงของวิดีโอจากสถิติ WebRTC (เครือข่าย บัฟเฟอร์ ถอดรหัส) และการตรวจภาพค้าง | 8 | ผ่าน |

## รายการทดสอบทั้งหมด

### API ฝั่งเซิร์ฟเวอร์

#### `api/active-session.test.ts`

การตรวจว่าผู้ใช้มีรอบกำลังดำเนินอยู่หรือรอบถัดไป

ผล: ผ่านทั้ง 19 ข้อ

**GET /api/bookings/active-session — a round running now**

- ผ่าน — refuses a caller who is not signed in
- ผ่าน — describes the running round
- ผ่าน — counts a confirmed round as running
- ผ่าน — counts a pending round as running
- ผ่าน — counts a in_progress round as running
- ผ่าน — does not count a completed round, even inside its slot
- ผ่าน — does not count a cancelled round, even inside its slot
- ผ่าน — counts the round from the millisecond it starts
- ผ่าน — counts the round through the millisecond it ends, and not after
- ผ่าน — ignores a round someone else has running
- ผ่าน — picks the running round when an older one has ended and a later one is booked
**GET /api/bookings/active-session — nothing running**

- ผ่าน — says so when the user has no bookings
- ผ่าน — describes the next round to come
- ผ่าน — picks the soonest of several rounds to come
- ผ่าน — skips a cancelled round when looking for the next one
- ผ่าน — skips a completed round when looking for the next one
- ผ่าน — skips rounds that belong to someone else
- ผ่าน — does not offer a round that has already ended as the next one
**GET /api/bookings/active-session — when Firestore fails**

- ผ่าน — answers 500

#### `api/admin-tests.test.ts`

API ที่ส่งผลการทดสอบให้หน้า admin: เฉพาะ admin เท่านั้น

ผล: ผ่านทั้ง 4 ข้อ

**GET /api/admin/tests — the unit tests, for admins**

- ผ่าน — answers 403 to someone who is not signed in, with nothing about the tests
- ผ่าน — answers 403 to a student, with nothing about the tests
- ผ่าน — gives an admin the last recorded run: its totals and every test by category
- ผ่าน — files each test under what it is about

#### `api/admin.test.ts`

API ของ admin: สิทธิ์ ภาพรวมการจอง การยกเลิกและสิ้นสุดรอบ การปิดช่วงเวลา การเปิดปิดแลป และแหล่งจ่ายไฟ

ผล: ผ่านทั้ง 80 ข้อ

**who is an admin**

- ผ่าน — reads the list from ADMIN_EMAILS, trimmed and in lower case
- ผ่าน — accepts a listed email whatever its capitals
- ผ่าน — refuses everyone else, including a user with no email and a signed-out visitor
- ผ่าน — does not treat the role claim as admin rights
- ผ่าน — has no admins when the variable is missing or empty
- ผ่าน — tells the page through /api/auth/me
**every admin route is closed to anyone who is not an admin**

- ผ่าน — GET overview answers 403 to a signed-in student and changes nothing
- ผ่าน — PATCH bookings/[id] answers 403 to a signed-in student and changes nothing
- ผ่าน — POST blocks answers 403 to a signed-in student and changes nothing
- ผ่าน — PATCH labs/[id] answers 403 to a signed-in student and changes nothing
- ผ่าน — POST rig/stop answers 403 to a signed-in student and changes nothing
- ผ่าน — POST rig/power answers 403 to a signed-in student and changes nothing
- ผ่าน — GET overview answers 403 to a visitor who is not signed in
- ผ่าน — PATCH bookings/[id] answers 403 to a visitor who is not signed in
- ผ่าน — POST blocks answers 403 to a visitor who is not signed in
- ผ่าน — PATCH labs/[id] answers 403 to a visitor who is not signed in
- ผ่าน — POST rig/stop answers 403 to a visitor who is not signed in
- ผ่าน — POST rig/power answers 403 to a visitor who is not signed in
**GET /api/admin/overview**

- ผ่าน — lists the bookings that start in the days asked for, oldest first, with who made them
- ผ่าน — starts today in Thai time and covers seven days unless told otherwise
- ผ่าน — follows the from and days it is given
- ผ่าน — answers 400 for ?from=tomorrow
- ผ่าน — answers 400 for ?from=2026-13-45
- ผ่าน — answers 400 for ?days=0
- ผ่าน — answers 400 for ?days=32
- ผ่าน — answers 400 for ?days=1.5
- ผ่าน — answers 400 for ?days=x
- ผ่าน — says who is in the lab room right now
- ผ่าน — lists every lab with whether it takes bookings
- ผ่าน — marks a blocked stretch and carries its note
- ผ่าน — still lists a booking whose owner no longer has an account
- ผ่าน — answers 500 when Firestore fails
**PATCH /api/admin/bookings/[id] — cancel**

- ผ่าน — cancels a confirmed round of any user and tells them
- ผ่าน — cancels a pending round of any user and tells them
- ผ่าน — refuses to cancel a round that is in_progress
- ผ่าน — refuses to cancel a round that is completed
- ผ่าน — refuses to cancel a round that is cancelled
- ผ่าน — sends no notification when the admin lifts their own block
- ผ่าน — answers 404 for a booking that does not exist
- ผ่าน — answers 400 for the body {"action":"delete"} and changes nothing
- ผ่าน — answers 400 for the body {} and changes nothing
- ผ่าน — answers 400 for the body null and changes nothing
- ผ่าน — answers 400 for the body "cancel" and changes nothing
**PATCH /api/admin/bookings/[id] — end the round running now**

- ผ่าน — closes the round and its session, cuts the circuits and tells the student
- ผ่าน — ends a round nobody has entered yet, which has no session to close
- ผ่าน — still ends the round when a circuit could not be cut, and says so
- ผ่าน — refuses a round that has not started, and leaves the rig alone
- ผ่าน — refuses a round that is already over, and leaves the rig alone
- ผ่าน — refuses a round that was cancelled, and leaves the rig alone
- ผ่าน — refuses a round that was completed, and leaves the rig alone
**POST /api/admin/blocks**

- ผ่าน — holds the time as a blocked booking in the admin's name
- ผ่าน — refuses a stretch that someone has already booked into, and says how many
- ผ่าน — ignores cancelled and finished rounds, and rounds that only touch the stretch
- ผ่าน — keeps a student from booking into the stretch afterwards
- ผ่าน — answers 400 for no lab
- ผ่าน — answers 400 for a start that is not a date
- ผ่าน — answers 400 for an end that is a number
- ผ่าน — answers 400 for an end before the start
- ผ่าน — answers 400 for an end equal to the start
- ผ่าน — answers 400 for a stretch already in the past
- ผ่าน — answers 400 for more than seven days
- ผ่าน — answers 400 for no body
- ผ่าน — answers 404 for a lab that does not exist
- ผ่าน — cuts a long note to 120 characters and stores none when it is not text
**PATCH /api/admin/labs/[id]**

- ผ่าน — closes and reopens a lab to booking
- ผ่าน — leaves the lab's other fields and its bookings alone
- ผ่าน — answers 400 for the body {"is_active":"false"}
- ผ่าน — answers 400 for the body {"is_active":0}
- ผ่าน — answers 400 for the body {}
- ผ่าน — answers 400 for the body null
- ผ่าน — answers 404 for a lab that does not exist, without creating it
**POST /api/admin/rig/power**

- ผ่าน — with on: true switches every relay on, whether or not anyone has a round
- ผ่าน — with on: false switches every relay off, whether or not anyone has a round
- ผ่าน — answers 400 for the body {"on":"true"} and runs nothing
- ผ่าน — answers 400 for the body {"on":1} and runs nothing
- ผ่าน — answers 400 for the body {} and runs nothing
- ผ่าน — answers 400 for the body null and runs nothing
- ผ่าน — answers 500 without the script's output when the supply does not respond
**POST /api/admin/rig/stop**

- ผ่าน — cuts both circuits whether or not anyone has a round
- ผ่าน — answers 500 and names the scripts when a circuit could not be cut

#### `api/auth.test.ts`

การสร้าง session จากการล็อกอิน Google การอ่านผู้ใช้ปัจจุบัน และการออกจากระบบ

ผล: ผ่านทั้ง 22 ข้อ

**POST /api/auth/session**

- ผ่าน — sets the session cookie for a Google user who already has a role
- ผ่าน — mints the cookie for seven days, matching the cookie's own lifetime
- ผ่าน — keeps a role the user already has
- ผ่าน — makes a first-time user a student and asks for a token refresh instead of setting a cookie
- ผ่าน — answers 403 and sets no cookie for a token from the password provider
- ผ่าน — answers 403 and sets no cookie for a token from the anonymous provider
- ผ่าน — answers 403 and sets no cookie for a token from the github.com provider
- ผ่าน — answers 403 and sets no cookie for a token from the custom provider
- ผ่าน — gives no role to a first-time user who did not come through Google
- ผ่าน — answers 400 when the ID token is missing
- ผ่าน — answers 400 when the ID token is empty
- ผ่าน — answers 400 when the ID token is null
- ผ่าน — answers 401 and sets no cookie for a token Firebase does not accept
- ผ่าน — answers 401 and sets no cookie when the cookie cannot be minted
- ผ่าน — answers 401 for a body that is not JSON
- ผ่าน — does not repeat Firebase's error text to the caller
**GET /api/auth/me**

- ผ่าน — answers 401 without a session cookie
- ผ่าน — answers 401 for a session cookie that is not valid
- ผ่าน — returns the name, email and role of the signed-in user, and not the uid
- ผ่าน — recognises the user from the cookie that signing in just set
**POST /api/auth/logout**

- ผ่าน — tells the browser to drop the session cookie
- ผ่าน — works for a caller who was not signed in

#### `api/availability.test.ts`

ตารางช่องเวลาว่าง 7 วัน

ผล: ผ่านทั้ง 21 ข้อ

**GET /api/bookings/availability — the grid**

- ผ่าน — returns every active lab with a grid of 12 slots by 7 days, all free when nothing is booked
- ผ่าน — labels the seven days starting today, as day/month/two-digit year
- ผ่าน — takes "today" from the Bangkok calendar, not the UTC one
- ผ่าน — carries the dates over the end of the year
- ผ่าน — lists active labs in order of their code and leaves inactive ones out
**GET /api/bookings/availability — booked slots**

- ผ่าน — marks exactly the slot of someone else's round as taken
- ผ่าน — marks the user's own round as mine and says which booking it is
- ผ่าน — puts a round on the right day and row
- ผ่าน — marks every slot a longer round covers
- ผ่าน — marks both slots a round straddles
- ผ่าน — shows a pending round as taken
- ผ่าน — shows a confirmed round as taken
- ผ่าน — shows a in_progress round as taken
- ผ่าน — shows the slot of a cancelled round as free
- ผ่าน — shows the slot of a completed round as free
- ผ่าน — shows a round from yesterday only where it runs into today
- ผ่าน — leaves out a round that starts after the seventh day
- ผ่าน — keeps each lab's bookings in that lab's own grid
**GET /api/bookings/availability — callers**

- ผ่าน — answers a caller who is not signed in, showing every booked slot as taken
- ผ่าน — never says who booked a slot or which booking holds it
- ผ่าน — answers 500 when Firestore fails

#### `api/bookings-id.test.ts`

การเริ่ม จบ และยกเลิกการจองของตัวเอง

ผล: ผ่านทั้ง 33 ข้อ

**PATCH /api/bookings/[id] — whose booking**

- ผ่าน — refuses start from a caller who is not signed in
- ผ่าน — refuses complete from a caller who is not signed in
- ผ่าน — refuses cancel from a caller who is not signed in
- ผ่าน — answers 404 for a booking that does not exist
- ผ่าน — refuses start on someone else's booking and leaves it untouched
- ผ่าน — refuses complete on someone else's booking and leaves it untouched
- ผ่าน — refuses cancel on someone else's booking and leaves it untouched
- ผ่าน — answers 500 when Firestore fails
**PATCH /api/bookings/[id] — start**

- ผ่าน — moves a confirmed booking to in_progress
- ผ่าน — moves a pending booking to in_progress
- ผ่าน — opens a session stored under the booking's own id
- ผ่าน — keeps the first start time when the round is started again
- ผ่าน — does not bring a completed booking back to life
- ผ่าน — does not bring a cancelled booking back to life
**PATCH /api/bookings/[id] — complete**

- ผ่าน — moves a in_progress booking to completed
- ผ่าน — moves a confirmed booking to completed
- ผ่าน — moves a pending booking to completed
- ผ่าน — closes the session with its length in whole seconds
- ผ่าน — keeps the first length when the round is completed again
- ผ่าน — completes a booking that was never started without making up a session
- ผ่าน — leaves a cancelled booking cancelled
**PATCH /api/bookings/[id] — cancel**

- ผ่าน — cancels a confirmed booking
- ผ่าน — cancels a pending booking
- ผ่าน — leaves the user a notification naming the lab and the Bangkok date
- ผ่าน — answers 400 for a in_progress booking and changes nothing
- ผ่าน — answers 400 for a completed booking and changes nothing
- ผ่าน — answers 400 for a cancelled booking and changes nothing
- ผ่าน — does not touch the session collection
**PATCH /api/bookings/[id] — without an action**

- ผ่าน — cancels the booking when sent an empty object
- ผ่าน — cancels the booking when sent no body at all
- ผ่าน — cancels the booking when sent a body that is not JSON
- ผ่าน — cancels the booking when sent an action of null
- ผ่าน — applies the cancel rules to it: a round in progress is not cancelled

#### `api/bookings.test.ts`

การจองรอบ: การตรวจข้อมูล การกันจองซ้อน และสิ่งที่ถูกบันทึก

ผล: ผ่านทั้ง 36 ข้อ

**POST /api/bookings — what is accepted**

- ผ่าน — refuses a caller who is not signed in
- ผ่าน — answers 400 when room_id is missing
- ผ่าน — answers 400 when start_time is missing
- ผ่าน — answers 400 when end_time is missing
- ผ่าน — answers 400 for a round that has already ended
- ผ่าน — answers 400 for a round that ends at this very moment
- ผ่าน — accepts a round that has started but not ended
- ผ่าน — answers 400 for a round that ends at the moment it starts
- ผ่าน — answers 400 for a round that ends before it starts
- ผ่าน — answers 400 for a start that is not a date
- ผ่าน — answers 400 for an end that is not a date
- ผ่าน — answers 400 for a start that is a number
- ผ่าน — answers 400 for a lab that is not a name
- ผ่าน — answers 404 for a lab that does not exist
- ผ่าน — answers 404 for a lab that is switched off
- ผ่าน — answers 500 when Firestore fails
**POST /api/bookings — what is stored**

- ผ่าน — stores a confirmed booking for the signed-in user, reading the times as UTC
- ผ่าน — reads a time written with a T between date and time the same way
- ผ่าน — never books for a user named in the request
- ผ่าน — leaves the user a notification with the lab and the Bangkok date and time
- ผ่าน — dates the notification by the Bangkok day when it differs from the UTC day
**POST /api/bookings — rounds that overlap**

- ผ่าน — answers 409 and stores nothing when the same round is already booked
- ผ่าน — answers 409 and stores nothing when a round that ends inside it is already booked
- ผ่าน — answers 409 and stores nothing when a round that starts inside it is already booked
- ผ่าน — answers 409 and stores nothing when a longer round around it is already booked
- ผ่าน — answers 409 and stores nothing when a shorter round inside it is already booked
- ผ่าน — accepts a round that starts the moment the one before it ends
- ผ่าน — accepts a round that ends the moment the one after it starts
- ผ่าน — treats a pending booking as holding its slot
- ผ่าน — treats a confirmed booking as holding its slot
- ผ่าน — treats a in_progress booking as holding its slot
- ผ่าน — treats the slot of a cancelled booking as free
- ผ่าน — treats the slot of a completed booking as free
- ผ่าน — refuses a round that overlaps the user's own booking too
- ผ่าน — does not let a booking of another lab hold the slot
- ผ่าน — refuses the second of two identical requests

#### `api/cam.test.ts`

พร็อกซีกล้อง: การส่งต่อไปยังกล้องที่ถูกต้อง และการกัน path ที่พยายามออกนอกที่อยู่ของกล้อง

ผล: ผ่านทั้ง 33 ข้อ

**POST /api/cam/[...path] — WHEP signalling**

- ผ่าน — forwards an offer for cam1 to that camera's own URL
- ผ่าน — forwards an offer for cam2 to that camera's own URL
- ผ่าน — forwards an offer for cam3 to that camera's own URL
- ผ่าน — sends the offer on as a POST with the camera's credentials
- ผ่าน — keeps the content type the browser sent
- ผ่าน — calls the offer application/sdp when the browser sent no content type
- ผ่าน — does not pass the caller's own cookie or authorization on to the camera
- ผ่าน — returns the camera's answer with its status and headers
- ผ่าน — returns the camera's refusal as it is
- ผ่าน — answers 404 for the unknown camera "cam4" and contacts nothing
- ผ่าน — answers 404 for the unknown camera "camera1" and contacts nothing
- ผ่าน — answers 404 for the unknown camera "CAM1" and contacts nothing
- ผ่าน — answers 404 for the unknown camera "" and contacts nothing
- ผ่าน — answers 500 without the details when the camera cannot be reached
- ผ่าน — never returns the camera's credentials
**GET /api/cam/[...path] — passthrough**

- ผ่าน — fetches the same path and query string from the camera, with its credentials
- ผ่าน — fetches the camera's base URL when the path is only the camera key
- ผ่าน — returns what the camera sent
- ผ่าน — drops the encoding headers, since the body it returns is already decoded
- ผ่าน — answers with the camera's status and its own message when the camera refuses
- ผ่าน — answers 404 for the unknown camera "cam4" and contacts nothing
- ผ่าน — answers 404 for the unknown camera "camera1" and contacts nothing
- ผ่าน — answers 404 for the unknown camera "" and contacts nothing
- ผ่าน — answers 500 without the details when the camera cannot be reached
**/api/cam/[...path] — keys and paths that are not a camera**

- ผ่าน — answers 404 for the camera key "constructor" and contacts nothing
- ผ่าน — answers 404 for the camera key "toString" and contacts nothing
- ผ่าน — answers 404 for the camera key "__proto__" and contacts nothing
- ผ่าน — refuses a path that tries to reach another camera, and contacts nothing
- ผ่าน — refuses a path that tries to reach the root of the camera host, and contacts nothing
- ผ่าน — refuses a path that tries to reach another camera through an encoded slash, and contacts nothing
- ผ่าน — refuses a path that tries to reach the root through a backslash, and contacts nothing
- ผ่าน — refuses a path that tries to reach its own URL the long way round, and contacts nothing
- ผ่าน — keeps characters that would change the URL inside the segment they came in

#### `api/chat.test.ts`

API ผู้ช่วย AI: สิทธิ์ การกรองข้อความ ข้อมูลที่ส่งให้โมเดล และการจัดการ error จากผู้ให้บริการ

ผล: ผ่านทั้ง 81 ข้อ

**POST /api/chat — who may use the assistant**

- ผ่าน — refuses a caller who is not signed in and sends nothing upstream
- ผ่าน — answers 503 and sends nothing upstream when the Typhoon key is missing
- ผ่าน — answers 503 and sends nothing upstream when the Typhoon key is empty
**POST /api/chat — the conversation**

- ผ่าน — passes user and assistant turns on in order
- ผ่าน — drops a system turn from the caller, so the tutor's instructions stay the only ones
- ผ่าน — drops a turn whose role is "tool"
- ผ่าน — drops a turn whose role is "developer"
- ผ่าน — drops a turn whose role is "function"
- ผ่าน — drops a turn whose role is "SYSTEM"
- ผ่าน — drops a turn whose role is "User"
- ผ่าน — drops a turn whose role is ""
- ผ่าน — drops a turn whose role is 7
- ผ่าน — drops a turn whose role is null
- ผ่าน — drops a turn whose content is empty
- ผ่าน — drops a turn whose content is only spaces and line breaks
- ผ่าน — drops a turn whose content is a number
- ผ่าน — drops a turn whose content is a list of parts
- ผ่าน — drops a turn whose content is missing
- ผ่าน — drops entries that are not turns at all
- ผ่าน — passes on only the role and the text of a turn
- ผ่าน — cuts a turn to its first 4,000 characters
- ผ่าน — leaves a turn of exactly 4,000 characters whole
- ผ่าน — keeps only the last 20 turns
- ผ่าน — counts the 20 after dropping what it does not accept
- ผ่าน — answers 400 and sends nothing upstream when there are no messages
- ผ่าน — answers 400 and sends nothing upstream when the messages are not a list
- ผ่าน — answers 400 and sends nothing upstream when the list is empty
- ผ่าน — answers 400 and sends nothing upstream when the last turn is the assistant's
- ผ่าน — answers 400 and sends nothing upstream when only system turns were sent
- ผ่าน — answers 400 and sends nothing upstream when the question itself is blank
- ผ่าน — answers 400 when the body is not JSON
- ผ่าน — answers 400 when the body is null
- ผ่าน — answers 400 when the body is a list
**POST /api/chat — the readings**

- ผ่าน — writes the readings into the tutor's instructions
- ผ่าน — says the measured field has had the background taken off, and how much
- ผ่าน — says the measured field still includes the background when it could not be read
- ผ่าน — says nothing about the background when it is given as undefined
- ผ่าน — says nothing about the background when it is given as "0.05"
- ผ่าน — says nothing about the background when it is given as true
- ผ่าน — says nothing about the background when it is given as {"value": 1}
- ผ่าน — marks a measured field above theory with a plus sign
- ผ่าน — leaves the percentage out when the theoretical field is zero
- ผ่าน — gives the probe position in centimetres to two decimals, negative side included
- ผ่าน — gives no probe position for a coil
- ผ่าน — gives no probe position for the solenoid when z is missing
- ผ่าน — gives no probe position for the solenoid when z is text
- ผ่าน — gives no probe position for the solenoid when z is null
- ผ่าน — flattens a label to one line, so it cannot add instructions of its own
- ผ่าน — cuts each label to 60 characters
- ผ่าน — treats a label that is 7 as empty
- ผ่าน — treats a label that is null as empty
- ผ่าน — treats a label that is {"toString": "x"} as empty
- ผ่าน — treats a label that is ["ขดลวด"] as empty
- ผ่าน — answers 400 when I is text instead of a number
- ผ่าน — answers 400 when bTheory is text instead of a number
- ผ่าน — answers 400 when bMeasured is text instead of a number
- ผ่าน — answers 400 when I is missing or null
- ผ่าน — answers 400 when bTheory is missing or null
- ผ่าน — answers 400 when bMeasured is missing or null
- ผ่าน — answers 400 when the instrument type is "toroid"
- ผ่าน — answers 400 when the instrument type is "COIL"
- ผ่าน — answers 400 when the instrument type is ""
- ผ่าน — answers 400 when the instrument type is undefined
- ผ่าน — answers 400 when the instrument type is 1
- ผ่าน — answers 400 when the readings are missing
- ผ่าน — answers 400 when the readings are null
- ผ่าน — answers 400 when the readings are text
- ผ่าน — answers 400 when the readings are a number
**POST /api/chat — the upstream request**

- ผ่าน — goes to the Typhoon chat endpoint as a JSON POST carrying the key
- ผ่าน — asks for a streamed answer of at most 1,536 tokens from the Typhoon model
- ผ่าน — never puts the key in the request body
- ผ่าน — stops the upstream request when the student's request is aborted
- ผ่าน — gives the upstream request 60 seconds before giving up
**POST /api/chat — the answer**

- ผ่าน — passes the upstream stream through unchanged as server-sent events
- ผ่าน — hands over each chunk as it arrives rather than waiting for the whole answer
- ผ่าน — answers 502 with its own message when Typhoon rejects the key
- ผ่าน — answers 502 with its own message when Typhoon fails
- ผ่าน — answers 502 with its own message when Typhoon is unavailable
- ผ่าน — answers 502 with its own message when Typhoon rejects the request
- ผ่าน — answers 429 with its own message when Typhoon is rate limiting
- ผ่าน — answers 502 with its own message when Typhoon cannot be reached

#### `api/dashboard-history.test.ts`

ประวัติการใช้งาน: รายการที่นับเป็นประวัติ เวลาที่ใช้ และการแบ่งหน้า

ผล: ผ่านทั้ง 24 ข้อ

**GET /api/dashboard/history — what counts as history**

- ผ่าน — refuses a caller who is not signed in
- ผ่าน — returns an empty first page for a user without bookings
- ผ่าน — describes a past round
- ผ่าน — says which rounds have a record kept, so their summary can be opened
- ผ่าน — lists completed and cancelled rounds, and any round whose slot is over
- ผ่าน — leaves out a confirmed round that is running or still to come
- ผ่าน — leaves out a pending round that is running or still to come
- ผ่าน — leaves out a in_progress round that is running or still to come
- ผ่าน — lists the newest round first
- ผ่าน — lists only the signed-in user's rounds
- ผ่าน — answers 500 when Firestore fails
**GET /api/dashboard/history — time spent in the lab**

- ผ่าน — gives the length recorded on the session
- ผ่าน — keeps a recorded length of zero
- ผ่าน — counts a session that was never closed up to the end of its slot
- ผ่าน — counts an unclosed session up to now while its slot is still running
- ผ่าน — gives no length and no session for a round nobody entered
**GET /api/dashboard/history — pages**

- ผ่าน — returns ten rounds a page and says when there are no more
- ผ่าน — walks through 25 rounds in three pages without repeating or skipping one
- ผ่าน — returns an empty page for a cursor older than every round
- ผ่าน — finds past rounds behind more than thirty rounds still to come
- ผ่าน — keeps rounds that start at the same moment on one page
- ผ่าน — says there are no more when the rounds that share a start time are the last ones
- ผ่าน — returns every round exactly once when several of them share start times
- ผ่าน — does not lose a round where one raw batch of thirty ends and the next begins

#### `api/dashboard-stats.test.ts`

ตัวเลขสรุปและรอบที่จองไว้บน dashboard

ผล: ผ่านทั้ง 10 ข้อ

**GET /api/dashboard/stats**

- ผ่าน — refuses a caller who is not signed in
- ผ่าน — returns zeros and an empty list for a new user
- ผ่าน — describes an upcoming round with the lab's code and name
- ผ่าน — lists the five soonest rounds, soonest first
- ผ่าน — leaves out cancelled rounds
- ผ่าน — leaves out rounds that have already started, but keeps one starting this very moment
- ผ่าน — leaves out other users' rounds
- ผ่าน — counts the user's own lab sessions
- ผ่าน — counts the labs that are switched on
- ผ่าน — answers 500 when Firestore fails

#### `api/db-test.test.ts`

การตรวจการเชื่อมต่อฐานข้อมูล

ผล: ผ่านทั้ง 4 ข้อ

**GET /api/db-test**

- ผ่าน — lists the code and Thai name of the labs it can read
- ผ่าน — answers with an empty list when there are no labs
- ผ่าน — lists at most five labs
- ผ่าน — answers 500 with ok: false when Firestore cannot be reached

#### `api/gaps.test.ts`

กรณีที่เหลือของ API ที่เทสต์ไฟล์อื่นยังไม่ครอบคลุม เช่น ฐานข้อมูลล้มเหลว

ผล: ผ่านทั้ง 24 ข้อ

**PATCH /api/admin/bookings/[id] — the cases around the usual ones**

- ผ่าน — answers 500 to cancel when Firestore fails, and leaves the rig alone
- ผ่าน — answers 500 to end when Firestore fails, and leaves the rig alone
- ผ่าน — names the lab by its id in the notification when the lab itself is gone
- ผ่าน — ends the admin's own block that is running now without notifying anyone, and still cuts the circuits
- ผ่าน — leaves alone a session the student has already closed
**POST /api/admin/blocks — when Firestore fails**

- ผ่าน — answers 500 when the lab cannot be read
- ผ่าน — answers 500, not 409, when the block cannot be written, and holds nothing
**PATCH /api/admin/labs/[id] — when Firestore fails**

- ผ่าน — answers 500 and leaves the lab as it was
**GET /api/admin/overview — the people and labs it lists**

- ผ่าน — names everyone when more than 100 people have bookings, asking Firebase Auth for at most 100 at a time
- ผ่าน — asks about a person once, however many rounds they have
- ผ่าน — lists a booking of an account that has no name or email
- ผ่าน — lists a lab that has no code or name under its id, as closed
- ผ่าน — answers 500 rather than "nothing closed" when the rig setting cannot be read
**POST /api/bookings — when the booking cannot be written**

- ผ่าน — answers 500, not 409, books nothing and announces nothing
**when the rig setting cannot be read while a round is running**

- ผ่าน — the lab room is answered 500 instead of being told that nothing is closed
- ผ่าน — the rig answers 500 to {"script":"coil_1.py"} and starts nothing
- ผ่าน — the rig answers 500 to {"script":"sole.py","position":2} and starts nothing
- ผ่าน — the rig still runs coil_b.py, which is never held back by the setting
- ผ่าน — the rig still runs sole_b.py, which is never held back by the setting
**/api/cam/[...path] — settings that are missing when the server starts**

- ผ่าน — answers 404 for cam1 when it has no address, and contacts nothing
- ผ่าน — answers 404 for cam2 when it has no address, and contacts nothing
- ผ่าน — answers 404 for cam3 when it has no address, and contacts nothing
- ผ่าน — still serves the cameras that do have an address
- ผ่าน — signs in to the camera as "admin" with no password when neither is set

#### `api/hardware.test.ts`

API สั่งอุปกรณ์: สิทธิ์ คำสั่งที่รับ ช่วงตำแหน่งหัววัด การกันคำสั่งซ้อน และการไม่เปิดเผยรายละเอียดเมื่อสคริปต์ล้มเหลว

ผล: ผ่านทั้ง 74 ข้อ

**POST /api/hardware — who may command the rig**

- ผ่าน — refuses a caller who is not signed in
- ผ่าน — refuses a signed-in user who has no booking
- ผ่าน — refuses a user whose round has not started yet
- ผ่าน — refuses a user while the running round belongs to someone else
- ผ่าน — refuses a user whose round covering this moment was cancelled
- ผ่าน — runs a command while the user has a confirmed round running
- ผ่าน — runs a command while the user has a pending round running
- ผ่าน — runs a command while the user has a in_progress round running
- ผ่าน — still runs coil_b.py for a round that ended five minutes ago
- ผ่าน — still runs sole_b.py for a round that ended five minutes ago
- ผ่าน — refuses coil_1.py for a round that ended five minutes ago
- ผ่าน — refuses coil_2.py for a round that ended five minutes ago
- ผ่าน — refuses coil_3.py for a round that ended five minutes ago
- ผ่าน — refuses sole.py for a round that ended five minutes ago
- ผ่าน — allows the break scripts up to exactly ten minutes after the round ended and no longer
- ผ่าน — allows only the break scripts once a round was completed before its slot ran out
- ผ่าน — answers 500 and runs nothing when the booking cannot be checked
**POST /api/hardware — the accepted commands**

- ผ่าน — reports whether the power supply was last switched on or off
**POST /api/hardware — the accepted commands › the relay follows the instrument being started**

- ผ่าน — moves a supply that is on to the instrument, before starting it
- ผ่าน — leaves the relay alone when it already feeds that instrument
- ผ่าน — leaves the relays alone when all of them are on
- ผ่าน — does not switch on a supply that is false
- ผ่าน — does not switch on a supply that is null
- ผ่าน — does not touch the relay for a break script
- ผ่าน — answers 500 and does not start the instrument when the relay cannot be moved
**POST /api/hardware — the accepted commands**

- ผ่าน — refuses relay.py: students do not switch the power supply
- ผ่าน — refuses relay_on.py: students do not switch the power supply
- ผ่าน — refuses relay_off.py: students do not switch the power supply
- ผ่าน — refuses psu_on.py: a script is named, never given by path
- ผ่าน — refuses /home/admin/Documents/relay.py: a script is named, never given by path
- ผ่าน — refuses ../relay.py: a script is named, never given by path
- ผ่าน — runs coil_1.py with the rig's Python, the script name as the only argument, in the script folder
- ผ่าน — runs coil_2.py with the rig's Python, the script name as the only argument, in the script folder
- ผ่าน — runs coil_3.py with the rig's Python, the script name as the only argument, in the script folder
- ผ่าน — runs coil_b.py with the rig's Python, the script name as the only argument, in the script folder
- ผ่าน — runs sole_b.py with the rig's Python, the script name as the only argument, in the script folder
- ผ่าน — runs sole.py --position <n> for every whole number from -6 to 6
- ผ่าน — ignores a position sent along with coil_1.py
- ผ่าน — ignores a position sent along with coil_b.py
- ผ่าน — refuses sole.py when the position is one below the range
- ผ่าน — refuses sole.py when the position is one above the range
- ผ่าน — refuses sole.py when the position is a fraction
- ผ่าน — refuses sole.py when the position is a number written as text
- ผ่าน — refuses sole.py when the position is text with a second command in it
- ผ่าน — refuses sole.py when the position is an extra flag
- ผ่าน — refuses sole.py when the position is null
- ผ่าน — refuses sole.py when the position is true
- ผ่าน — refuses sole.py when the position is a list
- ผ่าน — refuses sole.py when the position is a very large number
- ผ่าน — refuses sole.py without a position
- ผ่าน — refuses a script that is not on the list
- ผ่าน — refuses another file on the lab machine
- ผ่าน — refuses a listed script reached through a path
- ผ่าน — refuses a listed script with a second command appended
- ผ่าน — refuses a listed script with an argument appended
- ผ่าน — refuses a listed script in different letter case
- ผ่าน — refuses a listed script with a space after it
- ผ่าน — refuses an empty name
- ผ่าน — refuses a number
- ผ่าน — refuses a list holding a listed script
- ผ่าน — refuses nothing
- ผ่าน — refuses a body that is not JSON
- ผ่าน — refuses a body that is empty
- ผ่าน — refuses a body that is null
- ผ่าน — refuses a body that is a bare string
- ผ่าน — refuses a body that is a list
- ผ่าน — never goes through a shell
**POST /api/hardware — one command at a time**

- ผ่าน — reports the rig as free when nothing is running
- ผ่าน — refuses a second command while one is running, then accepts one again after it succeeds
- ผ่าน — frees the rig again after a script fails
- ผ่าน — does not mark the rig busy for a command it refuses
**POST /api/hardware — the answer**

- ผ่าน — reports success and returns the output when the script prints "Path finished."
- ผ่าน — reports no success when the script exits cleanly without printing "Path finished."
- ผ่าน — answers 500 for a failing script without passing on its output

#### `api/instruments.test.ts`

การเปิดปิดอุปกรณ์การทดลองโดย admin และผลต่อ API อุปกรณ์กับหน้าห้องแลป

ผล: ผ่านทั้ง 79 ข้อ

**cleanDisabled**

- ผ่าน — keeps known instruments, once each, in the rig's order
- ผ่าน — treats undefined as nothing closed
- ผ่าน — treats null as nothing closed
- ผ่าน — treats "coil_1.py" as nothing closed
- ผ่าน — treats {"0":"coil_1.py"} as nothing closed
**PATCH /api/admin/rig/instruments**

- ผ่าน — has nothing closed until an admin closes something
- ผ่าน — closes every single-coil instrument and leaves the solenoid open
- ผ่าน — replaces the list, so an empty one opens everything again
- ผ่าน — refuses to close every instrument
- ผ่าน — answers 400 for "coil_1.py" and changes nothing
- ผ่าน — answers 400 for ["coil_1.py","coil_b.py"] and changes nothing
- ผ่าน — answers 400 for ["relay.py"] and changes nothing
- ผ่าน — answers 400 for [1] and changes nothing
- ผ่าน — answers 400 for null and changes nothing
- ผ่าน — answers 400 for undefined and changes nothing
- ผ่าน — answers 403 to a student and changes nothing
- ผ่าน — answers 403 to a signed-out visitor and changes nothing
- ผ่าน — answers 500 when the setting cannot be saved
**what a closed instrument means**

- ผ่าน — the rig refuses to start coil_1.py, even for the student whose round is running
- ผ่าน — the rig refuses to start coil_2.py, even for the student whose round is running
- ผ่าน — the rig refuses to start coil_3.py, even for the student whose round is running
- ผ่าน — the solenoid still starts and moves
- ผ่าน — cutting a circuit is not held back: coil_b.py
- ผ่าน — cutting a circuit is not held back: sole_b.py
- ผ่าน — a closed solenoid refuses every probe position
- ผ่าน — opening it again lets it start
- ผ่าน — the lab room is told which instruments not to offer
- ผ่าน — the admin page is told too
- ผ่าน — the rig answers 500, and starts nothing, when Firestore cannot be read
**the relay of each instrument**

- ผ่าน — is the name relay.py knows its supply by
- ผ่าน — is nothing for "coil_b.py"
- ผ่าน — is nothing for "sole_b.py"
- ผ่าน — is nothing for "relay.py"
- ผ่าน — is nothing for "all"
- ผ่าน — is nothing for null
- ผ่าน — is nothing for undefined
- ผ่าน — is nothing for 3
**the current of each instrument**

- ผ่าน — is 5 A for each single coil and 0.3 A for the solenoid until an admin sets another
- ผ่าน — accepts 0.001 A
- ผ่าน — accepts 0.3 A
- ผ่าน — accepts 0.25 A
- ผ่าน — accepts 4.999 A
- ผ่าน — accepts 10 A
- ผ่าน — refuses 0 as a current
- ผ่าน — refuses -0.3 as a current
- ผ่าน — refuses 10.001 as a current
- ผ่าน — refuses 0.0005 as a current
- ผ่าน — refuses 0.3001 as a current
- ผ่าน — refuses NaN as a current
- ผ่าน — refuses Infinity as a current
- ผ่าน — refuses "0.3" as a current
- ผ่าน — refuses null as a current
- ผ่าน — refuses undefined as a current
- ผ่าน — keeps usable values for known instruments and falls back to the default for the rest
- ผ่าน — reads undefined as every default
- ผ่าน — reads null as every default
- ผ่าน — reads "sole.py" as every default
- ผ่าน — reads [0.3] as every default
- ผ่าน — reads 7 as every default
**the current of each instrument › PATCH /api/admin/rig/currents**

- ผ่าน — sets the current of the instruments named and leaves the others as they were
- ผ่าน — records who changed it and when
- ผ่าน — keeps the instruments an admin has closed, and closing keeps the currents
- ผ่าน — answers 400 for the value in {"sole.py":0} and changes nothing
- ผ่าน — answers 400 for the value in {"sole.py":-0.3} and changes nothing
- ผ่าน — answers 400 for the value in {"sole.py":10.5} and changes nothing
- ผ่าน — answers 400 for the value in {"sole.py":"0.3"} and changes nothing
- ผ่าน — answers 400 for the value in {"sole.py":0.3001} and changes nothing
- ผ่าน — answers 400 for the value in {"sole.py":null} and changes nothing
- ผ่าน — answers 400 for the value in {"coil_1.py":5,"sole.py":0} and changes nothing
- ผ่าน — answers 400 for {"coil_b.py":1}: only instruments have a current
- ผ่าน — answers 400 for {"relay.py":1}: only instruments have a current
- ผ่าน — answers 400 for {}: only instruments have a current
- ผ่าน — answers 400 for [0.3]: only instruments have a current
- ผ่าน — answers 400 for "sole.py": only instruments have a current
- ผ่าน — answers 400 for null: only instruments have a current
- ผ่าน — answers 400 for undefined: only instruments have a current
- ผ่าน — is for admins only
- ผ่าน — answers 500 without details when the database fails
**the current of each instrument**

- ผ่าน — reaches the lab room with the running round, and the admin page

#### `api/lab-presence.test.ts`

ผล: ผ่านทั้ง 38 ข้อ

**POST /api/lab/presence**

- ผ่าน — answers 401 to someone who is not signed in
- ผ่าน — answers 400 for the action "toggle"
- ผ่าน — answers 400 for the action "relay.py --status on --name all"
- ผ่าน — answers 400 for the action ""
- ผ่าน — answers 400 for the action null
- ผ่าน — answers 400 for the action 1
- ผ่าน — entering during a running round switches the supply on
- ผ่าน — entering with no round at all answers 403 and switches nothing
- ผ่าน — entering with a round that has ended answers 403 and switches nothing
- ผ่าน — entering with a round that was cancelled answers 403 and switches nothing
- ผ่าน — answers 500 and switches nothing when the round cannot be looked up
- ผ่าน — leaving switches the supply off, and reports it
- ผ่าน — leaving is accepted after the round has ended
- ผ่าน — staying does not run the relay again
- ผ่าน — a page still open after its round ended is put out, and the supply goes off
- ผ่าน — a page heard from for the first time by "stay" is let in and the supply comes on
- ผ่าน — after an admin switches off, staying reports the supply off and does not switch it back on
- ผ่าน — after an admin switches off, walking in anew switches the supply on again
**POST /api/lab/presence — the instrument selected on the page**

- ผ่าน — entering switches on the relay of that instrument
- ผ่าน — the student's switch switches on the relay of the instrument now selected
- ผ่าน — takes the instrument "coil_b.py" as not said: nothing from the request reaches the command
- ผ่าน — takes the instrument "relay.py" as not said: nothing from the request reaches the command
- ผ่าน — takes the instrument "../sole.py" as not said: nothing from the request reaches the command
- ผ่าน — takes the instrument "all" as not said: nothing from the request reaches the command
- ผ่าน — takes the instrument 7 as not said: nothing from the request reaches the command
- ผ่าน — takes the instrument {"script":"sole.py"} as not said: nothing from the request reaches the command
- ผ่าน — an admin switching on feeds the instrument whose circuit is on
**POST /api/lab/presence — the student's own switch**

- ผ่าน — switches the supply off and on again during the round
- ผ่าน — staying does not switch back on what the student switched off
- ผ่าน — refuses "on" without a running round
- ผ่าน — refuses "off" without a running round
- ผ่าน — refuses "on" from someone who is not signed in
- ผ่าน — refuses "off" from someone who is not signed in
- ผ่าน — does not switch on what an admin switched off, and says why
- ผ่าน — switches on again once the admin has switched the supply back on
- ผ่าน — still lets the student switch off while an admin holds the supply off
- ผ่าน — answers 500 without the script's output when the relay does not answer
- ผ่าน — the supply a student switched on still goes off when they leave

#### `api/lab-record.test.ts`

การเก็บบันทึกการทดลองลงฐานข้อมูลและเปิดดูย้อนหลัง: การตรวจข้อมูลทีละเหตุการณ์ สิทธิ์ของเจ้าของรอบและ admin ช่วงเวลาที่บันทึกได้ และการไม่ให้บันทึกที่สั้นกว่าทับของเดิม

ผล: ผ่านทั้ง 40 ข้อ

**cleanEvents — a record fit to store**

- ผ่าน — keeps a visit's events as they are
- ผ่าน — drops anything an event does not have
- ผ่าน — cuts an over-long name or detail
- ผ่าน — refuses not a list
- ผ่าน — refuses an empty list
- ผ่าน — refuses an event of no known kind
- ผ่าน — refuses an event with no time
- ผ่าน — refuses a time that is not a number
- ผ่าน — refuses a field of the wrong type
- ผ่าน — refuses a measurement that is not a number
- ผ่าน — refuses a result that is not yes or no
- ผ่าน — refuses one bad event among good ones
- ผ่าน — refuses more events than any visit makes
**POST /api/lab/record — keeping a visit**

- ผ่าน — answers 401 to someone who is not signed in
- ผ่าน — keeps the record under the booking, and marks the booking as having one
- ผ่าน — stores only what an event has, whatever else was sent with it
- ผ่าน — answers 400 for no booking named
- ผ่าน — answers 400 for a booking named by a path
- ผ่าน — answers 400 for no events
- ผ่าน — answers 400 for events that are not events
- ผ่าน — answers 400 for nothing at all
- ผ่าน — answers 404 for a booking that does not exist
- ผ่าน — does not let one student write the record of another's round
- ผ่าน — refuses a round that has not started
- ผ่าน — refuses a round that ended more than an hour ago
- ผ่าน — refuses a cancelled round
- ผ่าน — still keeps the record of a round that was marked complete a moment ago
- ผ่าน — still keeps it shortly after the round's time ran out
- ผ่าน — replaces an earlier save with a later, longer one
- ผ่าน — does not let a shorter save, arriving late, replace a fuller one
- ผ่าน — answers 500 without the database's own words when it cannot be reached
**GET /api/lab/record — opening a visit again**

- ผ่าน — gives the owner the events and the name of the experiment
- ผ่าน — answers 401 to someone who is not signed in
- ผ่าน — answers another student as if there were no record
- ผ่าน — lets an admin open any student's record
- ผ่าน — answers 404 for a round with no record
- ผ่าน — answers 400 when the booking is given as null
- ผ่าน — answers 400 when the booking is given as "../x"
- ผ่าน — answers 400 when the booking is given as ""
- ผ่าน — answers 500 without the database's own words when it cannot be reached

#### `api/notifications.test.ts`

รายการแจ้งเตือนและการทำเครื่องหมายว่าอ่านแล้ว

ผล: ผ่านทั้ง 24 ข้อ

**GET /api/notifications**

- ผ่าน — refuses a caller who is not signed in
- ผ่าน — returns an empty feed for a user without notifications
- ผ่าน — describes a notification
- ผ่าน — gives a notification without a link an action_url of null
- ผ่าน — lists the newest first
- ผ่าน — returns only the 20 newest
- ผ่าน — counts the unread ones
- ผ่าน — shows only the signed-in user's notifications
- ผ่าน — does not mark anything as read by listing it
**PATCH /api/notifications**

- ผ่าน — refuses a caller who is not signed in and changes nothing
- ผ่าน — marks all of the user's notifications as read
- ผ่าน — marks the ones beyond the 20 that are listed as read too
- ผ่าน — leaves other users' notifications unread
- ผ่าน — changes nothing but the read flag
- ผ่าน — succeeds when there is nothing to mark
**PATCH /api/notifications with an id — one notification**

- ผ่าน — marks only that notification as read
- ผ่าน — answers another user's notification as if it did not exist, and leaves it unread
- ผ่าน — answers 404 for a notification that does not exist
- ผ่าน — answers 400 for the id 5 and marks nothing
- ผ่าน — answers 400 for the id "" and marks nothing
- ผ่าน — answers 400 for the id "../x" and marks nothing
- ผ่าน — answers 400 for the id null and marks nothing
- ผ่าน — refuses a caller who is not signed in
- ผ่าน — still marks everything when the request names no notification

#### `api/notify-upcoming.test.ts`

การแจ้งเตือนเมื่อถึงเวลาเข้าห้องแลปและก่อนเริ่ม 5 นาที โดยไม่ส่งซ้ำ

ผล: ผ่านทั้ง 23 ข้อ

**POST /api/bookings/notify-upcoming — a round the user can enter**

- ผ่าน — refuses a caller who is not signed in
- ผ่าน — notifies the user once their round is running, with a link to the lab
- ผ่าน — does not repeat that notification on later polls
- ผ่าน — notifies for a confirmed round
- ผ่าน — notifies for a pending round
- ผ่าน — stays quiet for a in_progress round
- ผ่าน — stays quiet for a completed round
- ผ่าน — stays quiet for a cancelled round
- ผ่าน — notifies from the millisecond the round starts
- ผ่าน — stays quiet about a round that has ended
- ผ่าน — stays quiet about someone else's round
**POST /api/bookings/notify-upcoming — a round about to start**

- ผ่าน — notifies the user when their round starts within five minutes
- ผ่าน — does not repeat that notification on later polls
- ผ่าน — notifies at exactly five minutes before the start and not a millisecond earlier
- ผ่าน — rounds the minutes left and never says zero
- ผ่าน — stays quiet for a in_progress round
- ผ่าน — stays quiet for a completed round
- ผ่าน — stays quiet for a cancelled round
- ผ่าน — stays quiet about someone else's round
**POST /api/bookings/notify-upcoming — over the life of a booking**

- ผ่าน — says "starting soon" once and "you can enter" once
- ผ่าน — counts both kinds in one poll
- ผ่าน — reports nothing to do for a user without bookings
- ผ่าน — answers 500 when Firestore fails

### หน้าเว็บและคอมโพเนนต์

#### `components/AdminPage.test.tsx`

หน้า admin: การกันสิทธิ์ ห้องแลปตอนนี้ ปุ่มอุปกรณ์ การเปิดปิดแลปและอุปกรณ์ การปิดช่วงเวลา และตารางการจอง

ผล: ผ่านทั้ง 117 ข้อ

**AdminPage › who gets in**

- ผ่าน — sends a signed-out visitor to the login page and asks for no admin data
- ผ่าน — sends the visitor to the login page when the sign-in check cannot reach the server
- ผ่าน — tells a signed-in user who is not an admin that the page is not for them, and offers the way back
- ผ่าน — shows a non-admin none of the controls and never asks for admin data, however long they stay
- ผ่าน — shows an admin the page with every panel
- ผ่าน — shows that it is loading, and nothing else, until the first data arrives
- ผ่าน — shows the reason the server gave when the first load fails, with no controls
- ผ่าน — shows a general message when the server gave no reason when the first load fails, with no controls
- ผ่าน — shows a general message when the server answered 200 but said it failed when the first load fails, with no controls
- ผ่าน — shows that the server cannot be reached when the network is down when the first load fails, with no controls
- ผ่าน — loads the page when the admin tries again after a failed first load
**AdminPage › keeping itself fresh**

- ผ่าน — asks for seven days starting from today in Bangkok, not today in UTC
- ผ่าน — asks again every 30 seconds and shows what changed
- ผ่าน — keeps what it had on screen and says so when a refresh fails, then clears the message when one works
- ผ่าน — stops asking once the page is left
**AdminPage › asking before a destructive action**

- ผ่าน — ending a round: the first click only asks, and sends nothing
- ผ่าน — the emergency stop: the first click only asks, and sends nothing
- ผ่าน — cancelling a booking: the first click only asks, and sends nothing
- ผ่าน — reopening a closed stretch: the first click only asks, and sends nothing
- ผ่าน — ending a round: answering no sends nothing and puts the button back
- ผ่าน — the emergency stop: answering no sends nothing and puts the button back
- ผ่าน — cancelling a booking: answering no sends nothing and puts the button back
- ผ่าน — says it is working and cannot be pressed again or backed out of while the request is on its way
- ผ่าน — goes back to the plain button after a refused request, so the admin has to confirm again
- ผ่าน — keeps a question open across a refresh
**AdminPage › who is in the lab**

- ผ่าน — says so when nobody is
- ผ่าน — shows who is in, their email and the round in Bangkok time
- ผ่าน — falls back to the email, then the account id, when the user has no name
- ผ่าน — shows a closed stretch that is running now by its reason, with no user
- ผ่าน — shows a closed stretch with no reason as just closed
- ผ่าน — ends the round on the server, says so and reloads
- ผ่าน — ends the round whose button was pressed when there are two
- ผ่าน — warns that the equipment needs checking when the round ended but the circuits were not cut
- ผ่าน — shows the server's reason when it refuses, and the user stays listed
- ผ่าน — shows a general message when it refuses without a reason, and the user stays listed
- ผ่าน — shows a general message when it answers 200 but says it failed, and the user stays listed
- ผ่าน — shows that the server cannot be reached when the network is down, and the user stays listed
**AdminPage › the rig**

- ผ่าน — switches the supply with "เปิด" at once, without asking, and says it did
- ผ่าน — switches the supply with "ปิด" at once, without asking, and says it did
- ผ่าน — locks both supply buttons while a command is on its way
- ผ่าน — shows the server's reason when it refuses for a supply command
- ผ่าน — shows a general message when it refuses without a reason for a supply command
- ผ่าน — shows that the server cannot be reached when the network is down for a supply command
- ผ่าน — explains what the emergency stop does
- ผ่าน — sends the emergency stop, with no body, once confirmed
- ผ่าน — shows the server's reason when it refuses for the emergency stop, and does not claim the circuits were cut
- ผ่าน — shows a general message when it refuses without a reason for the emergency stop, and does not claim the circuits were cut
- ผ่าน — shows that the server cannot be reached when the network is down for the emergency stop, and does not claim the circuits were cut
**AdminPage › opening and closing a lab to booking**

- ผ่าน — says so when there are no labs
- ผ่าน — lists each lab by code and name with a switch showing whether it takes bookings
- ผ่าน — closes an open lab at once, says existing bookings stay, and reloads
- ผ่าน — opens a closed lab
- ผ่าน — locks the switch while the change is on its way
- ผ่าน — shows the server's reason when it refuses, and the switch stays where it was
- ผ่าน — shows a general message when it refuses without a reason, and the switch stays where it was
- ผ่าน — shows that the server cannot be reached when the network is down, and the switch stays where it was
**AdminPage › opening and closing instruments**

- ผ่าน — lists every instrument on the rig, open unless the server says it is closed
- ผ่าน — treats every instrument as open when the server sends no list
- ผ่าน — closes one instrument, keeping the ones already closed, and reloads
- ผ่าน — opens a closed instrument, leaving the other closed ones closed
- ผ่าน — closes all single coils at once and leaves the solenoid open
- ผ่าน — closes the remaining coils without listing any twice, and keeps a closed solenoid closed
- ผ่าน — offers to open the coils only when all of them are closed, and opening them leaves the solenoid as it was
- ผ่าน — locks every instrument control while a change is on its way
- ผ่าน — shows the server's reason when it refuses, and the instrument stays open
- ผ่าน — shows a general message when it refuses without a reason, and the instrument stays open
- ผ่าน — shows that the server cannot be reached when the network is down, and the instrument stays open
- ผ่าน — shows the failure and leaves the coils open when closing them all is refused
**AdminPage › closing a stretch of time**

- ผ่าน — sends the lab, both times as instants of the admin's own clock, and the reason
- ผ่าน — says the stretch is closed, empties the form and shows the stretch in the table
- ผ่าน — sends an empty reason when none is given
- ผ่าน — asks for both times and sends nothing when neither time is filled in
- ผ่าน — asks for both times and sends nothing when only the start is filled in
- ผ่าน — asks for both times and sends nothing when only the end is filled in
- ผ่าน — offers no choice of lab when there is only one
- ผ่าน — closes the first lab unless another is chosen, and the chosen one when it is
- ผ่าน — cannot be submitted when there is no lab to close
- ผ่าน — says it is closing and cannot be submitted twice while the request is on its way
- ผ่าน — shows the server's reason when it refuses, keeps what was typed and does not reload
- ผ่าน — shows a general message when it refuses without a reason, keeps what was typed and does not reload
- ผ่าน — shows that the server cannot be reached when the network is down, keeps what was typed and does not reload
**AdminPage › the booking table**

- ผ่าน — says so when there is nothing in the range
- ผ่าน — shows each booking's day and time in Bangkok, who booked it and its status
- ผ่าน — shows the account id when the booker has no name
- ผ่าน — labels a pending booking "รอยืนยัน"
- ผ่าน — labels a confirmed booking "จองแล้ว"
- ผ่าน — labels a in_progress booking "กำลังทดลอง"
- ผ่าน — labels a completed booking "เสร็จสิ้น"
- ผ่าน — labels a cancelled booking "ยกเลิก"
- ผ่าน — labels a no_show booking "no_show"
- ผ่าน — shows a closed stretch by its reason, marked closed, with no user
- ผ่าน — shows a closed stretch that was reopened as cancelled, not as closed
**AdminPage › the booking table › filters**

- ผ่าน — starts with only the bookings still in use: pending, confirmed and running
- ผ่าน — shows the right bookings for the status filter "all", in the server's order, without asking the server
- ผ่าน — shows the right bookings for the status filter "completed", in the server's order, without asking the server
- ผ่าน — shows the right bookings for the status filter "cancelled", in the server's order, without asking the server
- ผ่าน — says there is nothing when the status filter leaves no bookings
- ผ่าน — offers 1, 7, 14 and 30 days
- ผ่าน — asks the server at once for the new number of days
- ผ่าน — asks the server at once for the new start date
- ผ่าน — keeps refreshing the chosen range, every 30 seconds counted from the change
- ผ่าน — keeps the start date it had when the date field is cleared
- ผ่าน — shows how many bookings are listed beside the heading, following the status filter
- ผ่าน — counts zero when nothing is listed
**AdminPage › the booking table › cancelling**

- ผ่าน — can be done for pending and confirmed bookings only
- ผ่าน — cancels the booking on the server, says so and reloads
- ผ่าน — shows the booking as cancelled, with nothing left to press, when all statuses are listed
- ผ่าน — says the booking was cancelled even when it was the last one listed
- ผ่าน — reopens a closed stretch with the same request, and says it is open again
- ผ่าน — shows the server's reason when it refuses, and the booking stays listed and can be tried again
- ผ่าน — shows a general message when it refuses without a reason, and the booking stays listed and can be tried again
- ผ่าน — shows a general message when it answers 200 but says it failed, and the booking stays listed and can be tried again
- ผ่าน — shows that the server cannot be reached when the network is down, and the booking stays listed and can be tried again
**AdminPage › motion**

- ผ่าน — brings the rows in when the table appears and when a filter changes, not on a refresh
- ผ่าน — counts the number of bookings up to its new value when the list changes
- ผ่าน — animates nothing when the admin asked for reduced motion
- ผ่าน — leaves the heading readable and the panels visible without the animation

#### `components/AdminTestsPage.test.tsx`

หน้าผลการทดสอบของ admin: การกันสิทธิ์ ตัวเลขรวม หมวดหมู่ การค้นหา และการกรองรายการที่ไม่ผ่าน

ผล: ผ่านทั้ง 21 ข้อ

**AdminTestsPage — who may see it**

- ผ่าน — sends someone who is not signed in to the login page, and asks for no tests
- ผ่าน — tells a student the page is for admins, and asks for no tests
- ผ่าน — says so when the tests cannot be loaded, with a way back
**AdminTestsPage — the run**

- ผ่าน — shows the totals, when the tests were run and that some did not pass
- ผ่าน — says every test passed when none failed
- ผ่าน — says the page shows a recorded run and runs nothing itself
**AdminTestsPage — by category**

- ผ่าน — summarises each category: its tests, its files, and how many failed
- ผ่าน — lists every file under its category, with what it checks, its layer, count and time
- ผ่าน — opens a file with a failure in it from the start, and leaves the others closed
- ผ่าน — shows a failed test with why it failed
- ผ่าน — shows a group twice when the file comes back to it, without mixing the two up
- ผ่าน — opens a file to its tests, grouped as the file groups them, and closes it again
**AdminTestsPage — finding a test**

- ผ่าน — keeps only the tests that match what is typed, laid open, and says how many
- ผ่าน — matches a file's name and what it checks as well as a test's own words
- ผ่าน — says nothing was found for words no test has
- ผ่าน — shows only the tests that failed when asked to
- ผ่าน — says there are none when asked for failures and every test passed
**AdminTestsPage — a file that could not be run**

- ผ่าน — counts as a failure, starts open and shows what stopped it
- ผ่าน — stays in the list when only failures are shown
**AdminTestsPage — motion**

- ผ่าน — brings the page in, counts the totals up and fills the bars
- ผ่าน — keeps everything still for someone who asked for reduced motion

#### `components/BookingCalendar.test.tsx`

ตารางจอง: สถานะช่องเวลา การจองและยกเลิก และข้อความผลลัพธ์

ผล: ผ่านทั้ง 53 ข้อ

**BookingCalendar › what the week looks like**

- ผ่าน — shows the seven days the server sent, with today marked
- ผ่าน — has a row for every two-hour slot of the day
- ผ่าน — tells a signed-in user which slots are free, their own, or someone else's
- ผ่าน — gives free, own, taken and past slots four different looks
- ผ่าน — starts from this week on the visitor's own calendar until the server answers
- ผ่าน — offers a button for each room and shows the first room's bookings
- ผ่าน — shows another room's bookings when that room is chosen
- ผ่าน — carries its marketing heading on the landing page and a short one inside the dashboard
**BookingCalendar › slots in the past**

- ผ่าน — marks today's finished slots as past and leaves the running one bookable
- ผ่าน — does not mark the same early hours of tomorrow as past
- ผ่าน — counts a slot as past from the moment it ends
- ผ่าน — still counts a slot as open one second before it ends
- ผ่าน — does not let a past slot be picked
- ผ่าน — does not offer to cancel a booking of your own that is already over
**BookingCalendar › picking a free slot**

- ผ่าน — asks for confirmation, naming the room, the day and the two hours
- ผ่าน — shows the last slot of the day as ending at midnight
- ผ่าน — lets go of the slot when it is clicked again
- ผ่าน — lets go of the slot when the choice is cancelled, sending nothing
- ผ่าน — holds only one slot at a time
- ผ่าน — does nothing when the slot belongs to someone else
- ผ่าน — drops the choice when another room is chosen
**BookingCalendar › confirming a booking**

- ผ่าน — sends the room and the slot's start and end in UTC, and nothing else
- ผ่าน — sends the following midnight as the end of the last slot of a day
- ผ่าน — books in the room that is selected
- ผ่าน — shows the slot as yours and says the booking succeeded
- ผ่าน — tells the page and the notification feed, and reloads the calendar
- ผ่าน — takes the success message away after three seconds
- ผ่าน — cannot be sent twice while the first request is still on its way
**BookingCalendar › when the server turns a booking down**

- ผ่าน — shows the server's reason and keeps the slot selected so it can be retried
- ผ่าน — shows a general error when the server gives no reason
- ผ่าน — says it could not connect when the request never arrives
- ผ่าน — keeps the error on screen; it does not time out like a success message
- ผ่าน — clears the error as soon as another slot is picked
- ผ่าน — keeps an error that follows a success on screen past the success message's three seconds
**BookingCalendar › cancelling your own slot**

- ผ่าน — asks before cancelling, naming the room and the time
- ผ่าน — keeps the booking when the question is closed
- ผ่าน — closes the question when the slot is clicked again
- ผ่าน — asks the server to cancel that booking, by its id
- ผ่าน — frees the slot, says so, tells the page and reloads the calendar
- ผ่าน — cannot be sent twice while the first request is still on its way
- ผ่าน — keeps the booking and shows the server's reason when the server refuses
- ผ่าน — keeps the booking and says it could not connect when the request never arrives
- ผ่าน — swaps the booking question for the cancelling one when you move from a free slot to your own
- ผ่าน — lets a slot that was just booked be cancelled straight away
**BookingCalendar › for a signed-out visitor**

- ผ่าน — shows which slots are taken but does not invite a click on the free ones
- ผ่าน — links to the login page instead of taking a booking
- ผ่าน — does not show the login link to someone who is signed in
**BookingCalendar › loading**

- ผ่าน — asks the server for availability once when it appears
- ผ่าน — reloads when the page changes its refresh key, staying on the chosen room
- ผ่าน — still shows a week, with no rooms to choose, when the server reports a failure
**BookingCalendar › motion**

- ผ่าน — ripples the slots in when embedded in the dashboard
- ผ่าน — skips the ripple when motion is reduced
- ผ่าน — starts no scroll animation when the page turns it off

#### `components/CurrentSettings.test.tsx`

ช่องตั้งค่ากระแสของแต่ละอุปกรณ์ในหน้า admin: การตรวจค่า การบันทึก และข้อความผลลัพธ์

ผล: ผ่านทั้ง 15 ข้อ

**CurrentSettings**

- ผ่าน — shows the current of every instrument, in amperes
- ผ่าน — says that the supply itself is set by hand
- ผ่าน — has nothing to save until a value is changed
- ผ่าน — sends only the values that were changed
- ผ่าน — sends several changed values together
- ผ่าน — shows what is stored again once it has been saved
- ผ่าน — does not save "0", and says what a current may be
- ผ่าน — does not save "-1", and says what a current may be
- ผ่าน — does not save "10.5", and says what a current may be
- ผ่าน — does not save "0.3001", and says what a current may be
- ผ่าน — does not save "", and says what a current may be
- ผ่าน — keeps what was typed and gives the server's reason when saving is refused
- ผ่าน — says so when the server cannot be reached
- ผ่าน — settles the saved fields into place, and only those
- ผ่าน — keeps everything still for someone who asked for reduced motion

#### `components/DashboardNav.test.tsx`

แถบเมนูผู้ใช้: เมนู ลิงก์ผู้ดูแลระบบ และการออกจากระบบ

ผล: ผ่านทั้ง 21 ข้อ

**DashboardNav**

- ผ่าน — links the logo to the landing page
- ผ่าน — shows the user's name with their initial in capitals
- ผ่าน — keeps the menu closed until the user's name is clicked
- ผ่าน — closes the menu when the name is clicked again
- ผ่าน — closes the menu when the page behind it is clicked
- ผ่าน — closes the menu when the dashboard link is followed
- ผ่าน — names the student role in Thai
- ผ่าน — names the researcher role in Thai
- ผ่าน — names the instructor role in Thai
- ผ่าน — names the other role in Thai
- ผ่าน — shows a role it has no Thai name for as it is
- ผ่าน — renders for a user with an empty name
**DashboardNav › the admin link**

- ผ่าน — is in the menu of an administrator and leads to the admin page
- ผ่าน — is not in the menu of a user who is not an administrator
- ผ่าน — is not in the menu of a user who carries no administrator flag
- ผ่าน — does not depend on the role: an instructor without the flag gets no link, a student with it does
- ผ่าน — sits between the dashboard link and the sign-out button
- ผ่าน — closes the menu when it is followed
- ผ่าน — leaves signing out working for an administrator
**DashboardNav**

- ผ่าน — signs out on the server and then goes to the login page
- ผ่าน — waits for the server to answer before leaving the page

#### `components/EquipmentStatus.test.tsx`

ส่วนสถานะอุปกรณ์ในหน้า admin: ชุดทดลอง แหล่งจ่ายไฟ กล้อง และเซนเซอร์

ผล: ผ่านทั้ง 62 ข้อ

**EquipmentStatus › before the first answer**

- ผ่าน — says it is checking, in the header and on the rig
- ผ่าน — lists the three cameras and the sensor as being checked
- ผ่าน — claims nothing about the rig: no circuit on, supply unknown, no command, no probe
**EquipmentStatus › the header**

- ผ่าน — gives the time of the last check, in Bangkok time
**EquipmentStatus › the rig**

- ผ่าน — says no command has been sent since the server started
- ผ่าน — says no circuit is on once a command has been sent and none is on
- ผ่าน — says it is carrying out a command while busy, even with a circuit on
- ผ่าน — shows a spinner only while busy
- ผ่าน — says which circuit is on and lights it in the drawing: coil_1.py
- ผ่าน — says which circuit is on and lights it in the drawing: coil_2.py
- ผ่าน — says which circuit is on and lights it in the drawing: coil_3.py
- ผ่าน — says which circuit is on and lights it in the drawing: sole.py
- ผ่าน — treats a circuit it does not know as no circuit on
- ผ่าน — marks the probe at 4 cm
- ผ่าน — marks the probe at -8 cm
- ผ่าน — marks the probe at 0 cm
- ผ่าน — shows no probe marker when the probe position is not known
- ผ่าน — says whether the supply is on: true
- ผ่าน — says whether the supply is on: false
- ผ่าน — says whether the supply is on: null
- ผ่าน — says which relay is on: solenoid
- ผ่าน — says which relay is on: coil1
- ผ่าน — says which relay is on: coil2
- ผ่าน — says which relay is on: coil3
- ผ่าน — says which relay is on: all
- ผ่าน — says which relay is on: psu9
- ผ่าน — names no relay once the supply is off
- ผ่าน — makes the supply being on look different from it being off
- ผ่าน — names the last command, says it succeeded and when, in Bangkok time
- ผ่าน — says so when the last command failed, and makes it look different from a success
- ผ่าน — always says the state comes from the commands sent, not from the equipment itself
**EquipmentStatus › the cameras and the sensor**

- ผ่าน — shows each camera online
- ผ่าน — shows each camera offline
- ผ่าน — shows each camera unset
- ผ่าน — shows the sensor online
- ผ่าน — shows the sensor offline
- ผ่าน — shows the sensor unset
- ผ่าน — makes online, offline and not set up look different from each other
- ผ่าน — frames a tile that is offline differently from the others
- ผ่าน — shows a camera it has no name for under its key
**EquipmentStatus › checking again**

- ผ่าน — asks for the status as soon as it appears
- ผ่าน — asks again every ten seconds
- ผ่าน — shows what the latest check found
- ผ่าน — stops asking once it is off the page
- ผ่าน — does not ask at all when it is taken off the page before the first check goes out
**EquipmentStatus › when the status cannot be read**

- ผ่าน — says so and that it is trying again: the server answers with an error
- ผ่าน — says so and that it is trying again: the visitor is not allowed
- ผ่าน — says so and that it is trying again: the answer says it is not ok
- ผ่าน — says so and that it is trying again: the network is down
- ผ่าน — says so when the answer is not JSON
- ผ่าน — goes on showing every part as being checked when no check has worked yet
- ผ่าน — keeps trying every ten seconds and shows the status once a check works
- ผ่าน — replaces the time of the last check with the warning, and leaves what it last knew on the tiles
**EquipmentStatus › motion**

- ผ่าน — sweeps a bar across for the ten seconds until the next check, afresh after each check
- ผ่าน — does not sweep before the first answer
- ผ่าน — pulses each part that is online and no other
- ผ่าน — jumps a tile whose state changed, and not on the first answer or while it stays the same
- ผ่าน — runs current round the circuit that is on, and round nothing when none is
- ผ่าน — glides the probe marker 4 px along its track for every cm
- ผ่าน — animates nothing when the visitor asked for reduced motion, and puts the probe marker straight in place
**EquipmentStatus — asked to read again**

- ผ่าน — reads the status again at once when the page says a command was sent, without waiting for the next round
- ผ่าน — keeps reading every ten seconds after that, one round at a time

#### `components/FieldDiagram.test.tsx`

ภาพเส้นสนามในหน้าแรก

ผล: ผ่านทั้ง 31 ข้อ

**FieldDiagram › coil**

- ผ่าน — is one image with a description of the field for screen readers
- ผ่าน — uses the view box the field lines were generated for
- ผ่าน — says in the caption where the probe measures
- ผ่าน — draws the axis and every field line above and below it
- ผ่าน — draws the lower half as the mirror image of the upper half
- ผ่าน — draws the axis across the full width, through the centre
- ผ่าน — points the field one way along the axis, on both sides of the centre
- ผ่าน — points the field back the other way where each closed line returns outside the winding
- ผ่าน — has no arrow that points neither along the field nor back
- ผ่าน — puts the probe at the centre of the drawing
- ผ่าน — is complete as rendered: nothing but the pulse ring starts out invisible
- ผ่าน — draws the field in the primary green and the probe in the secondary cyan
- ผ่าน — labels its scale bar and sizes it against the figure
**FieldDiagram › solenoid**

- ผ่าน — is one image with a description of the field for screen readers
- ผ่าน — uses the view box the field lines were generated for
- ผ่าน — says in the caption where the probe measures
- ผ่าน — draws the axis and every field line above and below it
- ผ่าน — draws the lower half as the mirror image of the upper half
- ผ่าน — draws the axis across the full width, through the centre
- ผ่าน — points the field one way along the axis, on both sides of the centre
- ผ่าน — points the field back the other way where each closed line returns outside the winding
- ผ่าน — has no arrow that points neither along the field nor back
- ผ่าน — puts the probe at the centre of the drawing
- ผ่าน — is complete as rendered: nothing but the pulse ring starts out invisible
- ผ่าน — draws the field in the primary green and the probe in the secondary cyan
- ผ่าน — labels its scale bar and sizes it against the figure
**FieldDiagram › coil**

- ผ่าน — shows the wire at the top and bottom of the ring, on the ring
- ผ่าน — marks the current direction that produces the field direction drawn
**FieldDiagram › solenoid**

- ผ่าน — shows the 100 turns of the winding along both sides
- ผ่าน — spreads the turns evenly from one end of the solenoid to the other
- ผ่าน — has no single-coil ring or wire ends

#### `components/FieldViz.test.tsx`

แบบจำลองสนามแม่เหล็กในห้องแลป: ภาพตัด 2D หัววัดกับลูกศรทฤษฎีและค่าวัด การสลับ 2D/3D และกรณีเครื่องไม่มี WebGL

ผล: ผ่านทั้ง 35 ข้อ

**FieldViz — the section through the axis (2D)**

- ผ่าน — opens on the section, and says what it shows
- ผ่าน — draws the coil with 1 turn(s) as 4 lines above the axis, mirrored below it, and the axis
- ผ่าน — draws the coil with 2 turn(s) as 8 lines above the axis, mirrored below it, and the axis
- ผ่าน — draws the coil with 3 turn(s) as 12 lines above the axis, mirrored below it, and the axis
- ผ่าน — draws the solenoid as 6 lines above the axis and the axis
- ผ่าน — adds lines with the turns, but no arrowheads: those stay on the one-turn coil's lines
- ผ่าน — draws every stretch of a line twice: the line, and the dashes that run along it
- ผ่าน — draws a stronger field brighter: a line fades as it leaves the winding, and stays bright while it keeps to the wire
- ผ่าน — shows one wire end per turn, coming toward the viewer above the axis and going away below it
- ผ่าน — shows the solenoid's winding along both sides and a tick for each of the probe's 21 positions
- ผ่าน — is to scale, with a bar that says so
- ผ่าน — draws nothing while its box has no size, as in the layout the lab room keeps hidden
**FieldViz — the probe and its two arrows**

- ผ่าน — puts the probe where it is along the axis
- ผ่าน — glides the probe to a new position
- ผ่าน — draws the theory arrow at full length for the field at the centre, and the measured one in proportion
- ผ่าน — shortens the theory arrow as the probe leaves the middle of the solenoid
- ผ่าน — follows the sensor as its reading changes
- ผ่าน — draws no measured arrow for a reading of 0
- ผ่าน — draws no measured arrow for a reading of NaN
- ผ่าน — points the arrow back along the axis for a field the other way
- ผ่าน — draws a weak field as a short arrow of the right length, not a fixed-size head
- ผ่าน — does not let a reading far above theory run off the drawing
**FieldViz — motion**

- ผ่าน — runs the dashes along the lines, in the direction of the field
- ผ่าน — keeps everything still for someone who asked for reduced motion
- ผ่าน — still moves the probe at once under reduced motion
**FieldViz — switching between 2D and 3D**

- ผ่าน — shows the 3D view of the same instrument when 3D is chosen, and the section again on 2D
- ผ่าน — names the two buttons as one control
- ผ่าน — says how to turn the model only where it can be turned
- ผ่าน — slides the switch and brings the new view in
- ผ่าน — switches every copy of the panel together: the lab room keeps two layouts mounted
- ผ่าน — remembers the choice for the next visit
- ผ่าน — opens on the section when what was stored is not a view
- ผ่าน — still works when the browser will not store anything
**FieldView3D — on a machine without WebGL**

- ผ่าน — says it cannot show 3D and points back to 2D, instead of an empty box
- ผ่าน — does not try to start WebGL while its box has no size

#### `components/GlobalNotifications.test.tsx`

กระดิ่ง แผงแจ้งเตือน และ toast: การแสดง การปิด การหายเอง และ reduced motion

ผล: ผ่านทั้ง 47 ข้อ

**GlobalNotifications › where it appears**

- ผ่าน — shows nothing to a signed-out visitor
- ผ่าน — shows the bell on the dashboard
- ผ่าน — stays off the landing, login and lab pages even when signed in
**GlobalNotifications › the bell**

- ผ่าน — carries the number of unread notifications
- ผ่าน — carries no number when everything is read
- ผ่าน — caps the number at 9+
- ผ่าน — wiggles when the unread count goes up and not while it stays the same
**GlobalNotifications › the panel**

- ผ่าน — is closed until the bell is clicked
- ผ่าน — closes when the bell is clicked again
- ผ่าน — closes when the page behind it is clicked
- ผ่าน — lists every notification in the order the server sent them
- ผ่าน — marks everything as read on the server and clears the count, just by being opened
- ผ่าน — keeps what was unread picked out while the panel stays open, and shows it as read the next time
- ผ่าน — asks the server for nothing when it is opened with nothing unread
**GlobalNotifications › the panel, continued**

- ผ่าน — closes on Escape
- ผ่าน — ignores other keys
**GlobalNotifications › toasts**

- ผ่าน — pops up an unread notification without the bell being clicked, and announces it
- ผ่าน — does not pop up notifications that are already read
- ผ่าน — shows one at a time, newest first, and says how many are waiting
- ผ่าน — says nothing about waiting ones when it is the only one
- ผ่าน — links to the lab when the notification carries a link, and has no link otherwise
- ผ่าน — marks that one notification as read when its close button is clicked, and leaves the others unread
- ผ่าน — does not mark a toast as read when it only goes away by itself
- ผ่าน — gives way to the next one when its close button is clicked
- ผ่าน — goes away by itself after 20 seconds: a plain one
- ผ่าน — goes away by itself after 20 seconds: one with a link to the lab
- ผ่าน — gives each waiting toast its own 20 seconds
- ผ่าน — still goes away 20 seconds after it appeared when the feed is refreshed meanwhile
- ผ่าน — is cleared, with any waiting behind it, when the panel is opened
**GlobalNotifications › motion**

- ผ่าน — slides the toast and the panel in
- ผ่าน — animates nothing when the visitor asked for reduced motion
- ผ่าน — leaves the toast, the panel and its items visible without the animation
**BellIcon**

- ผ่าน — draws at the size it is given
- ผ่าน — has a default size
**UnreadBadge**

- ผ่าน — shows the count up to nine
- ผ่าน — shows 9+ from ten on
**NotifPanel**

- ผ่าน — says there is nothing when the list is empty
- ผ่าน — shows each notification's title, message and age
- ผ่าน — makes unread notifications look different from read ones
- ผ่าน — links to the lab only from notifications that carry a link
- ผ่าน — calls back to mark everything read as soon as it is shown with something unread
- ผ่าน — does not call back when nothing is unread
- ผ่าน — shows the unread count and a mark-all-read button, for when marking them read did not go through
- ผ่าน — caps the unread count at 9+
- ผ่าน — offers no mark-all-read button and no count when nothing is unread
- ผ่าน — still shows a notification whose type it does not know
- ผ่าน — limits its height to what the caller asks for

#### `components/LabSummary.test.tsx`

หน้าสรุปการทดลองเมื่อออกจากห้องแลป และการดาวน์โหลด CSV

ผล: ผ่านทั้ง 54 ข้อ

**LabSummary › the heading**

- ผ่าน — says the experiment has ended when the student finished it
- ผ่าน — says the time ran out when the visit ended that way
- ผ่าน — names the experiment
- ผ่าน — gives the date of the visit and the times it started and ended
- ผ่าน — gives no date or times for a visit in which nothing happened
**LabSummary › the five figures**

- ผ่าน — show the time spent, instruments used, rig commands, values recorded and questions asked
- ผ่าน — say how many rig commands failed
- ผ่าน — say nothing about failed commands when every command worked
- ผ่าน — write a visit of 42 seconds as 42 วินาที
- ผ่าน — write a visit of 65 seconds as 1 นาที 5 วินาที
- ผ่าน — write a visit of 3900 seconds as 1 ชม. 5 นาที
- ผ่าน — are all zero for a visit in which nothing happened
**LabSummary › the table of readings**

- ผ่าน — has a column for the instrument, the position, the current, both fields and both differences
- ผ่าน — has one row per reading, in the order they were taken
- ผ่าน — leaves the measured value and both differences blank for a reading with no sensor value, and explains the blank
- ผ่าน — does not explain the blank when every reading has a sensor value
- ผ่าน — makes a difference of more than 5 percent below theory stand out
- ผ่าน — makes a difference of more than 5 percent above theory stand out
- ผ่าน — signs a measured value above theory with a plus
- ผ่าน — gives the difference in mT but no percentage against a theory value of zero
- ผ่าน — writes the probe at the centre as 0 with no sign
- ผ่าน — is replaced by a line saying nothing was recorded when there are no readings
**LabSummary › the timeline**

- ผ่าน — lists every event with its time, oldest first
- ผ่าน — says how many events there are
- ผ่าน — makes a failed event look different from one that worked and from one that is not a command
- ผ่าน — marks every failed event and no other
- ผ่าน — is empty for a visit in which nothing happened
**LabSummary › the CSV download**

- ผ่าน — hands the browser nothing until the button is clicked
- ผ่าน — starts with a byte-order mark so a spreadsheet reads the Thai text as UTF-8
- ผ่าน — opens with the table of recorded values, one row per reading
- ผ่าน — then holds a header and one row for every event of the visit
- ผ่าน — names the file after the date and time the visit started
- ผ่าน — pads single-digit months, days, hours and minutes in the file name
- ผ่าน — points the download at the file it made and releases it afterwards
- ผ่าน — makes a fresh file each time the button is clicked
- ผ่าน — gives a visit with no events a file of headings only, named after the present moment
- ผ่าน — does not leave the page
**LabSummary › the leave button**

- ผ่าน — calls back once when clicked
- ผ่าน — says the record is kept and can be opened again, for a summary opened from history
- ผ่าน — says the record is being kept while it is
- ผ่าน — says so once it has been kept
- ผ่าน — warns when it could not be kept, and offers to try again
**LabSummary › motion**

- ผ่าน — brings the sections and the rows in when the summary appears
- ผ่าน — animates nothing when the visitor asked for reduced motion
- ผ่าน — stops its animations when the summary goes away
- ผ่าน — leaves the heading, the rows and the buttons visible without the animation
**LabSummary — the background field**

- ผ่าน — says above the readings how much was taken off every measured value
- ผ่าน — says the measured values still include it when it could not be read
- ผ่าน — says nothing about it for a visit in which it was never tried
- ผ่าน — lists the reading of it in the timeline, and does not count it among the values recorded
**LabSummary — Set 0**

- ผ่าน — says each value has had the zero in force at the time taken off, when the zero was set again
- ผ่าน — keeps the plain sentence when the only Set 0 failed
- ผ่าน — says so when the zero was only ever set by Set 0
- ผ่าน — lists each Set 0 in the timeline, a failed one marked as failed

#### `components/LoginPage.test.tsx`

หน้าเข้าสู่ระบบ

ผล: ผ่านทั้ง 10 ข้อ

**LoginPage**

- ผ่าน — offers Google as the way to sign in
- ผ่าน — tells first-time visitors that an account is created for them
- ผ่าน — links the logo back to the landing page
- ผ่าน — opens the Google popup only when the button is clicked
- ผ่าน — creates the session and then leaves the page
- ผ่าน — cannot be clicked twice while signing in is under way
- ผ่าน — explains that the popup was closed, stays on the page and lets the visitor try again
- ผ่าน — shows a general error and stays on the page when the server refuses the session
- ผ่าน — shows a general error when the server cannot be reached
- ผ่าน — clears the previous error as soon as the visitor tries again

#### `components/PortraitGuard.test.tsx`

ข้อความให้หมุนจอเมื่อถือแนวตั้ง

ผล: ผ่านทั้ง 3 ข้อ

**PortraitGuard**

- ผ่าน — asks the visitor to turn the device to landscape
- ผ่าน — draws one device outline and keeps the shape it turns into out of sight
- ผ่าน — turns the visible outline into the hidden one and back, over and over

#### `components/ReadinessCheck.test.tsx`

ปุ่มตรวจความพร้อมของเครื่องแลปในหน้า admin และรายการผลที่แสดง

ผล: ผ่านทั้ง 12 ข้อ

**ReadinessCheck**

- ผ่าน — checks nothing until the button is pressed
- ผ่าน — asks the server to check when the button is pressed
- ผ่าน — says the machine is ready and when that was checked
- ผ่าน — lists each thing checked under its group, with what was found
- ผ่าน — marks what could not be checked as not checked, neither ready nor not
- ผ่าน — says how many things need fixing, and which, when the machine is not ready
- ผ่าน — cannot be pressed again while a check is running
- ผ่าน — replaces the last result with the new one when checked again
- ผ่าน — says so when the check itself fails, with the server's reason
- ผ่าน — says so when the server cannot be reached
- ผ่าน — brings the lines of a result in one after another
- ผ่าน — keeps everything still for someone who asked for reduced motion

#### `components/SlideIn.test.tsx`

แผงที่เลื่อนเข้าเมื่อปรากฏ

ผล: ผ่านทั้ง 5 ข้อ

**SlideIn**

- ผ่าน — renders its children in a div that keeps the props it was given
- ผ่าน — slides the panel into its resting place and ends fully visible
- ผ่าน — starts from the offset it is given
- ผ่าน — stays still when motion is reduced
- ผ่าน — stops the animation when the panel is removed mid-slide

#### `components/useNotifications.test.tsx`

ตัวดึงการแจ้งเตือน: รอบการดึงทุก 30 วินาที การทำเครื่องหมายอ่าน และเมื่อคำขอล้มเหลว

ผล: ผ่านทั้ง 28 ข้อ

**formatRelative**

- ผ่าน — says "just now" for anything under a minute old
- ผ่าน — says "just now" for a time slightly in the future, as when clocks disagree
- ผ่าน — counts whole minutes from one minute up to an hour
- ผ่าน — counts whole hours from one hour up to a day
- ผ่าน — counts whole days from one day on
**useNotifications › for a signed-out visitor**

- ผ่าน — asks who is signed in and then stays quiet
- ผ่าน — never polls and ignores a booking being made
- ผ่าน — treats a failed sign-in check as signed out
**useNotifications › for a signed-in user**

- ผ่าน — checks for upcoming bookings and then loads the feed
- ผ่าน — shows a toast for each unread notification and none for those already read
- ผ่าน — shows at most three toasts from one load, the newest first
- ผ่าน — polls again every 30 seconds and not before
- ผ่าน — picks up a notification that arrives between polls and puts its toast on top
- ผ่าน — does not toast the same notification again on later polls
- ผ่าน — keeps a dismissed toast dismissed while the notification stays unread
- ผ่าน — never stacks more than five toasts
- ผ่าน — refreshes at once when a booking is made, without waiting for the next poll
- ผ่าน — stops polling and listening once unmounted
- ผ่าน — marks one notification as read when its toast is closed by hand
- ผ่าน — takes the toast away but leaves the notification unread when the server refuses
- ผ่าน — leaves a toast that is only dismissed unread
- ผ่าน — marks everything as read on the server and on screen
- ผ่าน — leaves the notifications unread when marking as read cannot reach the server
- ผ่าน — leaves the notifications unread when the server refuses to mark them as read
**useNotifications › when a request fails**

- ผ่าน — keeps what it was showing when the feed answers with an error
- ผ่าน — keeps what it was showing when the network drops, and recovers on a later poll
- ผ่าน — still loads the feed when the upcoming-booking check answers with an error
- ผ่าน — shows an empty feed when the server sends no list

### ไลบรารีและตรรกะกลาง

#### `auth-client.test.ts`

การล็อกอินด้วย Google ฝั่งเบราว์เซอร์ และข้อความ error ที่แสดงผู้ใช้

ผล: ผ่านทั้ง 14 ข้อ

**establishGoogleSession**

- ผ่าน — signs in with a Google popup on the app's Firebase auth
- ผ่าน — sends the user's ID token to the session endpoint once
- ผ่าน — sends the token as JSON
- ผ่าน — on a first sign-in, forces a token refresh and sends the new token
- ผ่าน — refreshes only once even if the server asks again
- ผ่าน — fails when the server rejects the token
- ผ่าน — fails when the server rejects the refreshed token
- ผ่าน — fails with Firebase's own error and contacts no server when the popup is closed
**authErrorMessage**

- ผ่าน — explains each Firebase error it knows in Thai
- ผ่าน — gives a closed popup and a superseded popup the same message
- ผ่าน — reads the code from a real Error object
- ผ่าน — falls back to a generic message for an unknown code
- ผ่าน — falls back to the generic message for anything that is not a Firebase error
- ผ่าน — does not mistake an inherited object property for an error code

#### `field-geometry.test.ts`

การอ่านแบบจำลองสนามไปวาด: เส้นของแต่ละอุปกรณ์ ความสว่างตามขนาดสนาม หัวลูกศร จำนวนเส้นในมุมมอง 3D และกรอบภาพ

ผล: ผ่านทั้ง 91 ข้อ

**linesFor — the lines of a drawing**

- ผ่าน — the coil with 1 turn(s) has 4 lines and the axis
- ผ่าน — the coil with 2 turn(s) has 8 lines and the axis
- ผ่าน — the coil with 3 turn(s) has 12 lines and the axis
- ผ่าน — adding turns keeps the lines already drawn and puts new ones between them
- ผ่าน — draws the one-turn coil for a number of turns it does not know
- ผ่าน — the solenoid has one drawing: every line of its model
- ผ่าน — gives each kind its own model
**samples — a line as points**

- ผ่าน — reads the flattened triples in order
- ผ่าน — leaves out a triple that is not complete
**brightness — how strongly a field is drawn**

- ผ่าน — is nothing for no field and full for the field at the centre
- ผ่าน — only ever rises with the field
- ผ่าน — is no brighter than full, however strong the field next to the wire
- ผ่าน — is nothing for NaN
- ผ่าน — is nothing for -0.5
- ผ่าน — is nothing for -Infinity
- ผ่าน — is measured against the strongest field in the drawing, so nothing stronger than the centre is lost
- ผ่าน — is nothing when the strongest field is given as 0
- ผ่าน — is nothing when the strongest field is given as -1
- ผ่าน — is nothing when the strongest field is given as NaN
- ผ่าน — knows the strongest field of each model: next to the wire for the coil, hardly above the centre's for the solenoid
- ผ่าน — uses the whole range of shades in the coil, the brightest only for its strongest field
- ผ่าน — uses the whole range of shades in the solenoid, the brightest only for its strongest field
- ผ่าน — falls in one of the shades, the dimmest for the weakest field and the brightest for the strongest
**shadedRuns — a line cut into stretches of one shade**

- ผ่าน — starts each stretch on the point the one before ended on
- ผ่าน — keeps neighbouring segments of one shade in one stretch
- ผ่าน — says how far along the line each stretch begins
- ผ่าน — shades against the strongest field it is given
- ผ่าน — takes a closed line back to where it started
- ผ่าน — covers every segment of every line of the coil
- ผ่าน — covers every segment of every line of the solenoid
**midPlaneMarks — where the arrowheads go**

- ผ่าน — marks an open line where it crosses the mid-plane, pointing the way the line runs
- ผ่าน — marks a point that lies on the mid-plane itself
- ผ่าน — marks a closed line twice: going one way inside, and back the other way outside
- ผ่าน — puts none on the axis, which runs along the mid-plane's normal
- ผ่าน — on the coil every line runs toward +z inside the winding, and a closed one comes back toward -z outside it
- ผ่าน — on the solenoid every line runs toward +z inside the winding, and a closed one comes back toward -z outside it
- ผ่าน — puts arrowheads on the one-turn coil's lines only, and on every other line of the solenoid
**axisField — the field along the axis**

- ผ่าน — is the centre's own field at the centre of the coil, and the same either side
- ผ่าน — is the centre's own field at the centre of the solenoid, and the same either side
- ผ่าน — follows the handout's formula for the solenoid
- ผ่าน — follows B0 x R^3 / (R^2 + z^2)^(3/2) for the coil
- ผ่าน — holds the last value past the ends of the traced region
**the 3D view's copies of a line**

- ผ่าน — draws the axis once
- ผ่าน — repeats a line in proportion to how far from the axis it starts
- ผ่าน — draws every line at least once
- ผ่าน — shares the solenoid's field among its 3D lines evenly: one, two, three copies and so on outward
- ผ่าน — shares the 1-turn coil's field among its 3D lines to within a factor of 1.1
- ผ่าน — shares the 2-turn coil's field among its 3D lines to within a factor of 1.35
- ผ่าน — shares the 3-turn coil's field among its 3D lines to within a factor of 1.15
- ผ่าน — gives the coil about two and three times the 3D lines for two and three turns
- ผ่าน — gives the coil more copies the further out a line starts, never fewer
- ผ่าน — gives the solenoid more copies the further out a line starts, never fewer
- ผ่าน — starts each line's copies at a different angle, inside one turn
- ผ่าน — turns a point about the axis, keeping its distance from it
**arrowLength — the probe's arrows**

- ผ่าน — is the full length for the field at the centre, and in proportion below it
- ผ่าน — stops at 1.3 times the full length for a reading far above theory
- ผ่าน — is negative for a field the other way along the axis, and stops at 1.3 times that way too
- ผ่าน — draws nothing for a reading of 0 against 1
- ผ่าน — draws nothing for a reading of NaN against 1
- ผ่าน — draws nothing for a reading of Infinity against 1
- ผ่าน — draws nothing for a reading of 0.5 against 0
- ผ่าน — draws nothing for a reading of 0.5 against NaN
- ผ่าน — splits a long arrow into a shaft and a head of full size
- ผ่าน — keeps a short arrow its true length: the head shrinks to it, and there is no shaft
- ผ่าน — an arrow of 0.001 cm is that long, whatever the size of its head
- ผ่าน — an arrow of 0.2 cm is that long, whatever the size of its head
- ผ่าน — an arrow of 0.4875 cm is that long, whatever the size of its head
- ผ่าน — an arrow of 0.6 cm is that long, whatever the size of its head
- ผ่าน — an arrow of 3.38 cm is that long, whatever the size of its head
- ผ่าน — is nothing for no length
**edgeFade — lines that leave the traced region**

- ผ่าน — leaves a line alone well inside the region
- ผ่าน — fades it to nothing at the edge, along the axis or away from it
- ผ่าน — fades evenly over the last stretch, by whichever edge is nearer
- ผ่าน — reaches nothing at both ends of every line of the coil that leaves the region, and never touches one that closes
- ผ่าน — reaches nothing at both ends of every line of the solenoid that leaves the region, and never touches one that closes
**visibleExtent — the part of the section a box shows**

- ผ่าน — shows the region it prefers in a box of that shape
- ผ่าน — the coil in a 575 x 300 box: the same scale both ways, the winding and the probe's travel in view, nothing past the traced region
- ผ่าน — the coil in a 595 x 210 box: the same scale both ways, the winding and the probe's travel in view, nothing past the traced region
- ผ่าน — the coil in a 874 x 245 box: the same scale both ways, the winding and the probe's travel in view, nothing past the traced region
- ผ่าน — the coil in a 350 x 280 box: the same scale both ways, the winding and the probe's travel in view, nothing past the traced region
- ผ่าน — the solenoid in a 580 x 270 box: the same scale both ways, the winding and the probe's travel in view, nothing past the traced region
- ผ่าน — the solenoid in a 595 x 135 box: the same scale both ways, the winding and the probe's travel in view, nothing past the traced region
- ผ่าน — the solenoid in a 350 x 130 box: the same scale both ways, the winding and the probe's travel in view, nothing past the traced region
- ผ่าน — the solenoid in a 874 x 245 box: the same scale both ways, the winding and the probe's travel in view, nothing past the traced region
- ผ่าน — keeps the whole of the probe's travel in view even in a box too narrow for the traced region
- ผ่าน — needs to show the winding of each instrument, and all 21 positions of the solenoid's probe
**cameraDistance — how far back the 3D camera sits**

- ผ่าน — needs no distance for the point it is looking at
- ผ่าน — from straight in front, stands back by a point's offset over the tangent of half the angle of view
- ผ่าน — stands further back for a point that is toward the camera, by that much and more
- ผ่าน — backs off beyond the near end of the axis when the model is turned end-on
- ผ่าน — puts every point in the picture, with at least one on its edge, whichever way the camera is turned

#### `field-lines.test.ts`

ข้อมูลเส้นสนามที่ใช้วาดภาพในหน้าแรก: สมมาตร ไม่ตัดกัน และได้สัดส่วนจริงของอุปกรณ์

ผล: ผ่านทั้ง 36 ข้อ

**field-line data**

- ผ่าน — describes a drawing 520 by 240
**field-line data › single coil**

- ผ่าน — has lines, each a well-formed path of at least a few points
- ผ่าน — fits its winding inside the drawing
- ผ่าน — keeps every line in the upper half, where the component mirrors it
- ผ่าน — keeps closed loops entirely inside the view box
- ผ่าน — runs every open line off the edge of the view box at both ends, and only there
- ผ่าน — does not let an open line stray further than a tenth of the drawing past its edge
- ผ่าน — is the same on both sides of the mid-plane
- ผ่าน — closes a line exactly when it comes back through the mid-plane inside the drawing
- ผ่าน — passes each line through the mid-plane at its stated inner and outer distances
- ผ่าน — threads every line through the winding and brings the closed ones back outside it
- ผ่าน — lists the lines from the axis outward, no two through the same point
- ผ่าน — nests the lines: one that starts nearer the wire also returns nearer the wire
- ผ่าน — never lets two field lines cross
- ผ่าน — never lets a field line cross itself
**field-line data › solenoid**

- ผ่าน — has lines, each a well-formed path of at least a few points
- ผ่าน — fits its winding inside the drawing
- ผ่าน — keeps every line in the upper half, where the component mirrors it
- ผ่าน — keeps closed loops entirely inside the view box
- ผ่าน — runs every open line off the edge of the view box at both ends, and only there
- ผ่าน — does not let an open line stray further than a tenth of the drawing past its edge
- ผ่าน — is the same on both sides of the mid-plane
- ผ่าน — closes a line exactly when it comes back through the mid-plane inside the drawing
- ผ่าน — passes each line through the mid-plane at its stated inner and outer distances
- ผ่าน — threads every line through the winding and brings the closed ones back outside it
- ผ่าน — lists the lines from the axis outward, no two through the same point
- ผ่าน — nests the lines: one that starts nearer the wire also returns nearer the wire
- ผ่าน — never lets two field lines cross
- ผ่าน — never lets a field line cross itself
**field-line data › scale**

- ผ่าน — draws the coil at its real radius of 1.3 cm
- ผ่าน — draws the solenoid at its real radius of 2.1 cm and length of 8 cm
- ผ่าน — fits the whole length of the solenoid inside the drawing
**field-line data › shape of the solenoid field**

- ผ่าน — runs parallel to the axis through the middle half of the winding
- ผ่าน — stays inside the winding until near its ends, then spreads out
**field-line data › shape of the coil field**

- ผ่าน — is closest to the axis in the plane of the coil and spreads out on either side
- ผ่าน — wraps its closed loops around the wire

#### `field-model.test.ts`

ข้อมูลเส้นสนามของแบบจำลองในห้องแลป: ตรวจทิศและขนาดสนามกับกฎบีโอต์-ซาวาร์โดยตรง ความสมมาตร ระยะห่างของเส้นตามความเข้มสนาม และจำนวนเส้นตามจำนวนรอบ

ผล: ผ่านทั้ง 39 ข้อ

**field model data**

- ผ่าน — uses the dimensions of the rig
- ผ่าน — gives the coil 4, 8 and 12 lines for 1, 2 and 3 turns, and the solenoid 6
**field model data › single coil**

- ผ่าน — is traced in the agreed frame
- ผ่าน — lists the axis first, then the lines outward by level, all inside the winding
- ผ่าน — stores finite triples inside the frame, with b positive
- ผ่าน — samples every line finely enough to shade it, in about 90 points at most
- ผ่าน — is the same on both sides of the mid-plane
- ผ่าน — runs the axis straight from one end of the frame to the other
- ผ่าน — follows the closed form of the lab on the axis
- ผ่าน — crosses the mid-plane at rho0 running toward +z
- ผ่าน — brings every closed line back through the mid-plane outside the winding, running toward -z
- ผ่าน — runs every open line from one edge of the frame to another
- ผ่าน — nests the lines: one nearer the wire inside also returns nearer the wire
- ผ่าน — never lets two field lines cross, or one cross itself
- ผ่าน — spaces the lines on the mid-plane in inverse proportion to the field there
**field model data › single coil › against Biot-Savart summed over short pieces of the wire**

- ผ่าน — points along the field with the current counterclockwise seen from +z
- ผ่าน — runs every line along that field, within 2 degrees
- ผ่าน — stores that field strength as b, within 2 %
**field model data › solenoid**

- ผ่าน — is traced in the agreed frame
- ผ่าน — lists the axis first, then the lines outward by level, all inside the winding
- ผ่าน — stores finite triples inside the frame, with b positive
- ผ่าน — samples every line finely enough to shade it, in about 90 points at most
- ผ่าน — is the same on both sides of the mid-plane
- ผ่าน — runs the axis straight from one end of the frame to the other
- ผ่าน — follows the closed form of the lab on the axis
- ผ่าน — crosses the mid-plane at rho0 running toward +z
- ผ่าน — brings every closed line back through the mid-plane outside the winding, running toward -z
- ผ่าน — runs every open line from one edge of the frame to another
- ผ่าน — nests the lines: one nearer the wire inside also returns nearer the wire
- ผ่าน — never lets two field lines cross, or one cross itself
- ผ่าน — spaces the lines on the mid-plane in inverse proportion to the field there
**field model data › solenoid › against Biot-Savart summed over short pieces of the wire**

- ผ่าน — points along the field with the current counterclockwise seen from +z
- ผ่าน — runs every line along that field, within 2 degrees
- ผ่าน — stores that field strength as b, within 2 %
**field model data › shape of the solenoid field**

- ผ่าน — runs parallel to the axis through the middle half of the winding
- ผ่าน — is nearly uniform across the middle: within 5 % of the centre field at every rho0
- ผ่าน — drops by the full sheet current where a line passes out through the winding
**field model data › shape of the coil field**

- ผ่าน — is closest to the axis in the plane of the coil for the lines that leave the frame
- ผ่าน — grows stronger from the axis toward the wire in the plane of the coil

#### `lab-activity.test.ts`

บันทึกกิจกรรมในห้องแลป: ตัวเลขสรุป ค่าที่วัดได้ ค่าพื้นหลังและการตั้งศูนย์ (Set 0) ข้อความแต่ละเหตุการณ์ และไฟล์ CSV

ผล: ผ่านทั้ง 48 ข้อ

**summarise — the figures at the top of the summary**

- ผ่าน — measures the visit from the start button to its last event
- ผ่าน — lists each instrument that was switched on, once, in the order used
- ผ่าน — does not count an instrument that failed to switch on as used
- ผ่าน — counts rig commands, the ones that failed, and questions
- ผ่าน — is all zeroes for a visit in which nothing happened
**readingsOf — the values that came out of the visit**

- ผ่าน — takes a coil's reading and each probe position the solenoid reached
- ผ่าน — leaves out a position the probe never reached
- ผ่าน — keeps only the latest value when a position is measured again
- ผ่าน — keeps a reading with no sensor signal as no measurement, not as the theory value
**difference and differencePercent**

- ผ่าน — give measured minus theory, in mT and as a share of theory
- ผ่าน — give no percentage against a theory value of zero
**describeEvent — one line per event**

- ผ่าน — says what was done
- ผ่าน — says so when the visit ended because the time ran out
- ผ่าน — gives the rig's reason when a circuit could not be switched
**the power supply in the record**

- ผ่าน — is described as switched on or off, and as failed when the rig refused
- ผ่าน — counts as a rig command
- ผ่าน — is written to the CSV with its result
**toCsv — the download**

- ผ่าน — has a header and one row per event, oldest first
- ผ่าน — writes a measurement with its values and the difference from theory
- ผ่าน — leaves the measured columns empty when the sensor sent nothing
- ผ่าน — marks a refused command and gives the reason
- ผ่าน — says how the visit ended
- ผ่าน — quotes a question that holds commas, quotes or line breaks, so it stays one cell
- ผ่าน — keeps the question "=1+1" from running as a spreadsheet formula
- ผ่าน — keeps the question "+SUM(A1)" from running as a spreadsheet formula
- ผ่าน — keeps the question "-2+3" from running as a spreadsheet formula
- ผ่าน — keeps the question "@cmd" from running as a spreadsheet formula
- ผ่าน — is only the header for a visit with no events
**the background field in the record**

- ผ่าน — says what was read and that it is taken off what follows
- ผ่าน — says so when it could not be read, and what that means for the values
- ผ่าน — is in the summary as the value taken off every measurement
- ผ่าน — is absent from the summary when it was not read, or never tried
- ผ่าน — is not one of the readings, and not a rig command
- ผ่าน — is written to the CSV with its value and what it is for
- ผ่าน — is written to the CSV as not read, with no value
**Set 0 in the record**

- ผ่าน — says what the zero was set to and that it is taken off what follows
- ผ่าน — says so when it could not be set, and that the old zero still stands
- ผ่าน — leaves the summary as it was for a visit with no Set 0
- ผ่าน — counts each Set 0 that worked, and gives the zero in force at the end
- ผ่าน — gives a zero even when the one on entering could not be read
- ผ่าน — does not count a Set 0 that failed, and keeps the zero that was in force
- ผ่าน — is not one of the readings, and not a rig command
- ผ่าน — is written to the CSV with the new zero, or as not set
**readingsCsv and visitCsv — the table of recorded values in the download**

- ผ่าน — writes one row per reading, as the summary's table shows them
- ผ่าน — keeps only the latest value of a position measured twice
- ผ่าน — is only the header when nothing was recorded
- ผ่าน — puts the readings first and the timeline after, each under its heading
- ผ่าน — knows every kind of event

#### `lab-presence.test.ts`

ผล: ผ่านทั้ง 28 ข้อ

**entering the lab room**

- ผ่าน — switches the power supply on
- ผ่าน — does not run the script again when the supply is already on
- ผ่าน — says the supply is not on when the relay does not answer, and still counts the student as in
**the relay of the instrument in use**

- ผ่าน — entering with coil_1.py selected switches on the relay coil1, after switching every relay off
- ผ่าน — entering with coil_2.py selected switches on the relay coil2, after switching every relay off
- ผ่าน — entering with coil_3.py selected switches on the relay coil3, after switching every relay off
- ผ่าน — entering with sole.py selected switches on the relay solenoid, after switching every relay off
- ผ่าน — does not switch everything off first when the supply is known to be off
- ผ่าน — switches every relay on for a page that names no instrument, or one that is not an instrument
- ผ่าน — takes the relay of the circuit that is on when the page names none
- ผ่าน — the student's own switch feeds the instrument selected, and switches every relay off
- ผ่าน — a page only heard from again leaves the relay that is on as it is
- ผ่าน — says the supply is not on when the relay answers for off but not for on
**leaving the lab room**

- ผ่าน — switches the supply off when that leaves the room empty
- ผ่าน — leaves the supply on while someone else is still in
- ผ่าน — cuts a coil left on before switching the supply off
- ผ่าน — cuts the solenoid left on before switching the supply off
- ผ่าน — runs nothing for someone who was not in the room
- ผ่าน — runs nothing the second time the same student says goodbye
**a page that goes quiet**

- ผ่าน — is kept while it keeps saying it is open
- ผ่าน — is taken to have left, and the supply goes off
- ผ่าน — tries switching off again on the next rounds when the relay does not answer, then gives up
- ผ่าน — stops trying once switching off has worked
- ผ่าน — does not switch anything off in an empty room nobody has left
**an admin switching the supply by hand**

- ผ่าน — off: it stays off for the student who is still in the room
- ผ่าน — off: the next student to walk in switches it on again
- ผ่าน — on, with nobody in the room: it is left on
- ผ่าน — on: a page heard from again is no longer held off

#### `lab-readiness.test.ts`

การตรวจความพร้อมของเครื่องแลปจริง: ไฟล์สคริปต์ Python ไลบรารี ค่าจากเซนเซอร์ กล้อง ฐานข้อมูล และการไม่สั่งอุปกรณ์ทำงานระหว่างตรวจ

ผล: ผ่านทั้ง 22 ข้อ

**checkReadiness — a lab machine with everything in place**

- ผ่าน — is ready, with every check passed
- ผ่าน — checks the folder, Python, every script the web app can run, the sensor, three cameras and the database
- ผ่าน — says which Python it found and what the sensor read
**checkReadiness — it never runs the rig**

- ผ่าน — starts Python only to ask its version and to read the scripts, never to run one
**checkReadiness — what can be wrong with the rig**

- ผ่าน — names a script that is missing, and is not ready
- ผ่าน — names every missing script when several are
- ผ่าน — says which library a script needs that the venv does not have
- ผ่าน — says so when Python cannot read a script
- ผ่าน — says where it looked when the scripts folder is not there
- ผ่าน — says where it looked for Python when it is not there, and leaves the scripts it has as not fully checked
- ผ่าน — says so when Python is there but will not start
- ผ่าน — leaves the scripts as not checked, not as failed, when reading them could not be done
**checkReadiness — the sensor**

- ผ่าน — asks the sensor service at its own address
- ผ่าน — is not ready when the service cannot be reached
- ผ่าน — is not ready when the service answers but sends no reading: an open port is not a working sensor
- ผ่าน — says it could not check, rather than guess, on a Node without WebSocket
**checkReadiness — cameras and the database**

- ผ่าน — is not ready when a camera does not answer, and names it
- ผ่าน — is not ready when the database cannot be read, without the database's own words
- ผ่าน — is not ready when the database answers but holds no lab
**POST /api/admin/readiness**

- ผ่าน — answers 403 to a student and checks nothing
- ผ่าน — answers 403 to someone who is not signed in
- ผ่าน — gives an admin the result

#### `lab-status.test.ts`

การตรวจว่ากล้องและเซนเซอร์ตอบสนองหรือไม่ และ API สถานะอุปกรณ์ของ admin

ผล: ผ่านทั้ง 12 ข้อ

**checkCameras**

- ผ่าน — asks each camera's own address, with the camera's credentials
- ผ่าน — calls a camera online when it answers, offline when it refuses or cannot be reached
- ผ่าน — says a camera is not set up when it has no address, and asks nothing of it
**checkSensor**

- ผ่าน — is online when the sensor service accepts a connection
- ผ่าน — asks the address in SENSOR_URL: ws://192.168.1.50:9000/ws/sensor
- ผ่าน — asks the address in SENSOR_URL: http://sensor.local
- ผ่าน — is offline on error
- ผ่าน — is offline on timeout
**GET /api/admin/status**

- ผ่าน — reports the rig, the cameras and the sensor to an admin
- ผ่าน — gives away neither the camera addresses nor their credentials
- ผ่าน — answers 403 to a student without checking anything
- ผ่าน — answers 403 to a signed-out visitor without checking anything

#### `lib-gaps.test.ts`

กรณีที่เหลือของโมดูลใน lib ที่เทสต์ไฟล์อื่นยังไม่ครอบคลุม

ผล: ผ่านทั้ง 16 ข้อ

**disabledInstruments**

- ผ่าน — is empty when no admin has ever closed anything
- ผ่าน — is empty when the settings document holds other settings only
- ผ่าน — returns the closed instruments in the rig's order
- ผ่าน — drops anything in the document that is not an instrument, so a hand-edited value cannot close a break script
- ผ่าน — treats a list stored as "coil_1.py" as nothing closed
- ผ่าน — treats a list stored as {"coil_1.py":true} as nothing closed
- ผ่าน — treats a list stored as true as nothing closed
- ผ่าน — rejects when Firestore cannot be read, so a caller cannot mistake an outage for "nothing closed"
**setDisabledInstruments**

- ผ่าน — stores the list with who set it and when
- ผ่าน — stores only real instruments, once each, in the rig's order
- ผ่าน — replaces the earlier list and its author
- ผ่าน — rejects when Firestore cannot be written
**checkCameras — without camera credentials set**

- ผ่าน — asks as "admin" with no password
**checkSensor — a secure sensor address without a port**

- ผ่าน — asks "wss://sensor.example/ws/sensor" at its own host and port
- ผ่าน — asks "https://sensor.example" at its own host and port
- ผ่าน — asks "  ws://10.0.0.7:8888  " at its own host and port

#### `math.test.tsx`

การแสดงสูตรคณิตศาสตร์ด้วย KaTeX ในแชตผู้ช่วย AI

ผล: ผ่านทั้ง 5 ข้อ

**KatexMath**

- ผ่าน — typesets a formula as a fraction instead of showing its LaTeX source
- ผ่าน — sets a display formula in a block of its own
- ผ่าน — typesets Thai text inside \text{}
- ผ่าน — falls back to the source when the formula cannot be parsed
**MathSource**

- ผ่าน — shows the LaTeX as written

#### `motion.test.ts`

ตัวช่วยแอนิเมชัน: ไม่ซ่อนเนื้อหาเมื่อผู้ใช้ตั้ง reduced motion หรือเนื้อหาอยู่บนจอแล้ว

ผล: ผ่านทั้ง 14 ข้อ

**prefersReducedMotion**

- ผ่าน — reports the visitor's reduced-motion setting
**all**

- ผ่าน — finds the matching elements inside the given root only
**revealOnScroll**

- ผ่าน — leaves the content visible and starts nothing when motion is reduced
- ผ่าน — leaves the content visible when the target is already on screen
- ผ่าน — leaves the content visible when the target is above the screen
- ผ่าน — hides only the given elements while the target is below the screen
- ผ่าน — plays once when the target scrolls into view, however often it re-enters
- ผ่าน — stops watching the scroll position when cleaned up
**riseIn**

- ผ่าน — animates the elements from hidden and lowered to fully visible and in place
- ผ่าน — staggers the elements, starting immediately unless a delay is given
- ผ่าน — returns the animation so the caller can control it
**press**

- ผ่าน — does nothing when motion is reduced
- ผ่าน — dips the element and brings it back to full size
- ผ่าน — swells instead of dipping when given a size above 1, and still settles at full size

#### `physics.test.ts`

สูตรสนามแม่เหล็กของขดลวดเดี่ยวและโซลีนอยด์ ค่าคงที่ของโซลีนอยด์ 8 cm และตำแหน่งหัววัด 21 จุด

ผล: ผ่านทั้ง 20 ข้อ

**calcBCoil — field at the centre of a single coil**

- ผ่าน — gives B₀ = μ₀nI/2R for one turn
- ผ่าน — grows in proportion to the number of turns
- ผ่าน — grows in proportion to the current and is zero without it
**calcBSolenoid — field on the axis of the finite solenoid**

- ผ่าน — matches values worked by hand from B = (μ₀NI/2L)(cos α₁ + cos α₂)
- ผ่าน — is the same on both sides of the centre
- ผ่าน — is strongest at the centre and falls off toward the ends
- ผ่าน — is about half the centre value at the end of the winding
- ผ่าน — approaches the long-solenoid value μ₀(N/L)I when the solenoid is long
**the solenoid on the rig and its probe positions**

- ผ่าน — is 8 cm long with 100 turns, 42 mm across, at 0.3 A
- ผ่าน — has 21 positions, from -10 to 10
- ผ่าน — steps 1 cm at a time from the middle of the solenoid, so the ends are at 10 cm
- ผ่าน — gives the field worked by hand at the centre and at the last position
- ผ่าน — writes a length in centimetres with at most two decimals
**fixed and signedFixed — a field as text**

- ผ่าน — writes a number to the decimals asked for
- ผ่าน — writes -0.0002, a hair under zero, as zero and not as a negative zero
- ผ่าน — writes -0.00049, a hair under zero, as zero and not as a negative zero
- ผ่าน — writes -1e-17, a hair under zero, as zero and not as a negative zero
- ผ่าน — writes -0, a hair under zero, as zero and not as a negative zero
- ผ่าน — keeps the sign of a value that does not round away
- ผ่าน — shows the sign of a difference either way, and a plus for none

#### `rig-access.test.ts`

กติกาว่าใครสั่งอุปกรณ์ได้: รอบที่กำลังดำเนินอยู่ รอบที่เพิ่งจบ และกรณีที่ไม่มีสิทธิ์

ผล: ผ่านทั้ง 27 ข้อ

**rigAccess — a round that is running**

- ผ่าน — is active for a confirmed round in the middle of its slot
- ผ่าน — is active for a pending round in the middle of its slot
- ผ่าน — is active for a in_progress round in the middle of its slot
- ผ่าน — is active from the very millisecond the round starts
- ผ่าน — is none one millisecond before the round starts
- ผ่าน — is still active in the millisecond the round ends
- ผ่าน — is active without any grace period
**rigAccess — a round that has ended**

- ผ่าน — is just-ended one millisecond after a confirmed round ends
- ผ่าน — is just-ended one millisecond after a pending round ends
- ผ่าน — is just-ended one millisecond after a in_progress round ends
- ผ่าน — is just-ended up to exactly the grace period after the end
- ผ่าน — is none one millisecond past the grace period
- ผ่าน — follows the grace period it is given
- ผ่าน — is none straight after the end when there is no grace period
**rigAccess — a round marked completed**

- ผ่าน — is just-ended, not active, while its slot is still running
- ผ่าน — is just-ended while its slot is still running even without a grace period
- ผ่าน — is just-ended within the grace period after its slot
- ผ่าน — is none once the grace period after its slot has passed
**rigAccess — rounds that do not count**

- ผ่าน — is none for a user without bookings
- ผ่าน — is none for a cancelled round, running or just ended
- ผ่าน — is none for a status it does not know
- ผ่าน — ignores other users' rounds
- ผ่าน — counts a round that started exactly six hours ago
- ผ่าน — ignores a round that started more than six hours ago
**rigAccess — several rounds at once**

- ผ่าน — is active when one round just ended and the next is already running, whichever comes first
- ผ่าน — is just-ended when a round ended recently and the next has not started
**rigAccess — when Firestore fails**

- ผ่าน — rejects instead of guessing an answer

#### `rig.test.ts`

ตัวรันสคริปต์อุปกรณ์: ตำแหน่งสคริปต์และ Python จาก env การตัดวงจรทั้งหมด และการจำสถานะอุปกรณ์

ผล: ผ่านทั้ง 31 ข้อ

**runRigScript**

- ผ่าน — runs the script with the rig's own Python, in the scripts folder, without a shell
**where the scripts are**

- ผ่าน — uses the lab machine's own layout when nothing is set
- ผ่าน — takes the folder from RIG_SCRIPT_DIR, and the Python from the venv inside it
- ผ่าน — takes the Python from RIG_PYTHON when that is set
- ผ่าน — runs the relay script from that same folder
- ผ่าน — runs the scripts from the folder and with the Python that were set
**cutAllCircuits**

- ผ่าน — cuts both circuits and then switches the power supply off
- ผ่าน — carries on with the rest when the first script fails, and reports the one that failed
- ผ่าน — reports every script when none could be run
**rigState — what the rig was last told to do**

- ผ่าน — knows nothing before any command has been sent
- ผ่าน — records the coil that was switched on, and the command with its time
- ผ่าน — records the solenoid and where the probe was sent
- ผ่าน — clears a circuit when its own break script runs, not the other one's
- ผ่าน — is cleared by cutting both circuits
- ผ่าน — records the power supply being switched on and off, leaving the circuit as it was
- ผ่าน — builds the relay command as relay.py --status on|off --name <relay>
- ผ่าน — records which relay is on
- ผ่าน — counts every instrument as fed while all the relays are on
- ผ่าน — keeps the supply on when a relay other than the one that is on is switched off
- ผ่าน — does not count the supply as switched when the script fails
- ผ่าน — keeps what was on when a command fails, and records the failure
- ผ่าน — keeps why a command failed: the end of the script's output, with its exit code
- ผ่าน — keeps why a command could not be started at all
- ผ่าน — keeps no reason after a command that worked
- ผ่าน — is busy while a script is running
**feed — the supply moved to one instrument**

- ผ่าน — switches every relay off first when it is not known what is on
- ผ่าน — moves from one instrument to another by switching everything off in between
- ผ่าน — runs nothing when that relay is already on
- ผ่าน — switches on only, when the supply is known to be off
- ผ่าน — switches every relay on in one command
- ผ่าน — does not switch on when switching off failed

#### `safety.test.ts`

ตัวกันของชุดทดสอบเอง: เทสต์ต้องไม่ใช้ credential จริง และแตะ Firebase หรือเครือข่ายไม่ได้ถ้าไม่ได้จำลองไว้

ผล: ผ่านทั้ง 3 ข้อ

**the test run is cut off from real services**

- ผ่าน — runs with test credentials, not the ones in .env
- ผ่าน — refuses Firestore and Firebase Auth unless the test mocks them
- ผ่าน — refuses network requests unless the test mocks fetch

#### `sensor.test.ts`

การอ่านค่าจากเซนเซอร์สนามแม่เหล็ก: แปลง bx, by, bz หน่วยไมโครเทสลาเป็นขนาดสนามหน่วย mT คาลิเบต เฉลี่ย 20 ค่า และหักสนามพื้นหลัง

ผล: ผ่านทั้ง 30 ข้อ

**fieldFromSensor — one message from the magnetometer**

- ผ่าน — turns the three components in microtesla into the calibrated size of the field in millitesla
- ผ่าน — reads the message as the service sends it, as JSON text
- ผ่าน — uses the size of the field unless told to use one component
- ผ่าน — gives one component, with its sign, when asked for it
- ผ่าน — reads a field of zero as a reading, not as no reading
- ผ่าน — calibrates with the line fitted on the rig
- ผ่าน — still reads the earlier form, one value already in millitesla
- ผ่าน — gives no reading for text that is not JSON
- ผ่าน — gives no reading for a component missing
- ผ่าน — gives no reading for a component that is text
- ผ่าน — gives no reading for a component that is not finite
- ผ่าน — gives no reading for a null component
- ผ่าน — gives no reading for an empty object
- ผ่าน — gives no reading for a list
- ผ่าน — gives no reading for nothing
- ผ่าน — gives no reading for a bare number
**createAverager — twenty values make one reading**

- ผ่าน — takes twenty values for a reading
- ผ่าน — gives nothing until the block is full, then the mean of the block
- ผ่าน — starts the next reading from nothing
- ผ่าน — a fresh reading leaves out what was collected before it was asked for
- ผ่าน — a fresh reading is null when the sensor does not send enough in time
- ผ่าน — answers everyone waiting for a fresh reading
**aboveBackground — a reading with the room's own field taken off**

- ผ่าน — is the calibrated reading less the calibrated background
- ผ่าน — takes the two calibrated values as they are, so the calibration's offset cancels
- ผ่าน — is nothing when the sensor reads what it read on entering
- ผ่าน — can come out a little below zero, and is left that way
- ผ่าน — leaves the reading as it is when the background could not be read
- ผ่าน — works on what a message from the sensor carries
**createAverager — starting over**

- ผ่าน — drops what was collected toward the next reading
- ผ่าน — does not disturb someone waiting for a fresh reading

#### `session.test.ts`

การออกและตรวจ session cookie

ผล: ผ่านทั้ง 12 ข้อ

**the session cookie**

- ผ่าน — is called "session" and lasts seven days
**createSessionCookie**

- ผ่าน — mints a cookie from the ID token that is valid for seven days
- ผ่าน — rejects when Firebase does not accept the ID token
**getSessionUser**

- ผ่าน — returns the user the session cookie belongs to
- ผ่าน — returns nothing but uid, email, name and role from the cookie's claims
- ผ่าน — leaves the role empty for a cookie minted without one
- ผ่าน — returns null when the request has no session cookie, without asking Firebase
- ผ่าน — reads only the cookie named "session"
- ผ่าน — returns null for a forged or expired cookie
- ผ่าน — returns null for a empty cookie
- ผ่าน — returns null when the cookies cannot be read
- ผ่าน — verifies the cookie without the revocation check

#### `webrtc-latency.test.ts`

การคำนวณความหน่วงของวิดีโอจากสถิติ WebRTC (เครือข่าย บัฟเฟอร์ ถอดรหัส) และการตรวจภาพค้าง

ผล: ผ่านทั้ง 8 ข้อ

**readLatency**

- ผ่าน — uses the averages since the stream began for the first reading
- ผ่าน — describes only the time since the previous reading after that
- ผ่าน — reports a stall when no frame has come out since the previous reading
- ผ่าน — starts over when the counters go backwards, as after a reconnect
- ผ่าน — reads Firefox-shaped stats: a `selected` pair, `mediaType`, no decode figures
- ผ่าน — still reports buffer and decode time when no round trip is known yet
- ผ่าน — gives no reading without usable video stats
- ผ่าน — gives no reading, rather than a stall, before the first frame
