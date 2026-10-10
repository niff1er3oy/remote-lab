# Remote Lab — Design Document

Remote Lab is a web platform that lets students, researchers, and instructors book and remotely operate a real physics lab experiment (Lab 8: Biot–Savart law / magnetic fields) over the internet — live camera feeds, real hardware control, live sensor readings, and an AI teaching assistant, all within a booked time slot.

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Custom Node server** (`server.js`) wrapping Next.js — a thin wrapper that loads env and picks the listen host. It used to host a `ws` WebSocket server for room chat; that was removed together with the room-sharing feature, so it runs no WebSocket code of its own any more
- **Firebase Authentication** — user accounts (Google sign-in only)
- **Firestore** — all application data (bookings, sessions, notifications, lab catalog)
- **Tailwind CSS 4** — dark navy × bright green (`#c8ff00`) theme, see `AGENTS.md`
- **Anime.js** — UI micro-animations throughout
- **Three.js** — the 3D view of the lab room's field model (`app/lab/FieldView3D.tsx`); fetched on demand, the first time 3D is chosen
- **KaTeX** — typesets the formulas in the AI assistant's replies; loaded on demand, the first time a reply contains one
- **Jest + React Testing Library** — unit tests in `__tests__/`, run with `npm test` (configured through `next/jest` in `jest.config.mjs`). They cover `lib/`, every route handler in `app/api/` (called directly, against in-memory stand-ins for Firestore, Firebase Auth, the LLM and the rig), the components in `app/components/` and the sign-in page. The landing page, the dashboard page and the lab room (`app/lab/`) are not under test. `next/jest` loads `.env`, so `jest.env.ts` swaps the real credentials for test values and `jest.setup.ts` makes Firestore, Firebase Auth and `fetch` throw unless a test mocks them: no test can reach a real service
- **MediaMTX** (external service) — WebRTC (WHEP) camera streaming, proxied through the Next server
- **Typhoon API** (OpenAI-compatible LLM) — the in-lab AI teaching assistant

## Directory structure

```
app/
├── page.tsx, layout.tsx            — landing page (hero with an interactive plot of the
│                                     solenoid's theoretical B(Z), booking calendar,
│                                     experiment overview, steps), root layout
├── login/page.tsx                  — sign-in page (Google popup via the Firebase client SDK)
├── admin/tests/page.tsx            — admin only: the unit tests by category, from the last
│                                     recorded run (search, failures only, each file opened to its tests)
├── admin/ReadinessCheck.tsx        — the admin page's button that checks the lab machine itself and
│                                     lists what it found
├── admin/page.tsx                  — admin page: who is in the lab room, emergency stop, open or
│                                     close a lab, block out time, every booking with cancel
├── dashboard/record/[id]/page.tsx   — the summary of a past visit, opened from the history
│                                     table: LabSummary drawn from the record kept in lab_records
├── dashboard/page.tsx               — session hero (live countdown / next round), booking
│                                     calendar beside the booked rounds, handouts, history
├── lab/
│   ├── page.tsx                    — the lab room itself: camera feeds, instrument
│   │                                 selector, sensor/formula panels, field viz,
│   │                                 AI chat, activity log (~2200 lines, all client
│   │                                 components co-located in one file)
│   ├── FieldViz.tsx                — the lab room's field model: the 2D/3D switch and the
│   │                                 section through the axis (2D, SVG)
│   ├── FieldView3D.tsx             — the same model turned about the axis (3D, Three.js)
│   └── LabSummary.tsx              — shown in place of the lab room when a visit ends (finish
│                                     button, time up, or the round ended from outside): what was
│                                     done, the values, CSV download.
│                                     Also what dashboard/record/[id] draws for a past visit
├── components/                     — BookingCalendar, DashboardNav, GlobalNotifications,
│                                     PortraitGuard, useNotifications (poll-based hook),
│                                     FieldDiagram (to-scale field-line drawings of the
│                                     coil and solenoid, used on the landing page),
│                                     SlideIn (panel that slides in when it appears),
│                                     KatexMath / MathSource (a formula in the AI chat,
│                                     typeset by KaTeX or shown as its LaTeX source)
└── api/                            — Next.js Route Handlers, see "API routes" below

lib/
├── firebase-admin.ts               — server-side Firestore + Auth (Admin SDK) singleton
├── firebase-client.ts              — browser-side Firebase Auth singleton
├── auth-client.ts                  — Google sign-in helper used by the login page
├── physics.ts                      — Lab 8 formulas (calcBCoil, calcBSolenoid), shared by
│                                     the lab room and the landing page's field plot
├── webrtc-latency.ts               — reads a camera feed's delay (network + jitter buffer
│                                     + decode) from RTCPeerConnection.getStats(); used by
│                                     the latency readout on the lab room's camera panes
├── lab-activity.ts                 — the record of one visit to the lab room (commands, probe
│                                     moves, readings, questions); feeds the log tab, the
│                                     summary and its CSV (the table of recorded values, then
│                                     every event)
├── lab-record.ts                   — checks a visit's record, which comes from the browser,
│                                     before it is stored in lab_records; also what of an
│                                     over-long record is sent (fitToSave) and the
│                                     one-at-a-time save queue the lab page uses
├── admin.ts                        — who is an admin: the emails in the ADMIN_EMAILS variable
├── rig.ts                          — runs the rig's scripts (no shell) and cuts both circuits
├── rig-access.ts                   — whether a user's booking is running now (or just
│                                     ended); the check behind every hardware command
├── field-lines.ts                  — generated: field-line paths for FieldDiagram
├── field-model.ts                  — generated: the exact field lines of the rig's coil and
│                                     solenoid for the lab room's field model, with the
│                                     size of the field along each line
├── field-geometry.ts               — reads field-model.ts into what the two views draw:
│                                     which lines, shading, arrowheads, 3D copies, window
├── motion.ts                       — shared anime.js helpers (reduced-motion check,
│                                     reveal-on-scroll, press feedback) for the landing
│                                     page, dashboard and booking calendar
└── session.ts                      — session cookie mint/verify (wraps Admin SDK)

scripts/
├── field-lines.mjs                 — regenerates lib/field-lines.ts by tracing the exact
│                                     Biot-Savart field of the rig's coil and solenoid;
│                                     rerun it if their dimensions change
├── test-report.mjs                 — runs the unit tests and writes docs/TEST_REPORT.md and
│                                     lib/test-report.json (what the admin's test page shows)
└── field-model.mjs                 — regenerates lib/field-model.ts the same way for the
                                      lab room's model (the solenoid as a sheet of current,
                                      in closed form), and refuses to write a file whose
                                      axis field or flux does not check out; rerun it too

server.js                           — custom server: loads env and boots Next.js
```

## API routes (`app/api/`)

| Route | Purpose |
|---|---|
| `auth/session`, `auth/me`, `auth/logout` | Session management |
| `bookings`, `bookings/[id]`, `bookings/availability`, `bookings/active-session`, `bookings/notify-upcoming` | Booking CRUD, the 7-day availability grid, "do I have an active session right now" check, and reminder notifications |
| `dashboard/history`, `dashboard/stats` | Dashboard data. Each history row says whether the round has a record kept (`has_record`), which is what puts the "ดูสรุป" link on it |
| `lab/record` | The record of a visit to the lab room. `POST { booking_id, events }`: the lab page saves it a few seconds after each event during the visit (one save at a time, a failed one retried), when the visit ends (finish, time up, or the round found over from outside) and when the page is left without finishing: as an ordinary request when leaving by the back button or a link, and by `sendBeacon` when the tab closes or reloads (only while the record is under 60 kB; a longer one goes as an ordinary request that may not arrive, the saves made during the visit having kept all but its last seconds). A record holds at most 3000 events: past that the page keeps saving the first 3000, the ending in the last place, and tells the student once. Only the booking's owner, only from the round's start until an hour after its end, and never for a cancelled round; every event is checked field by field (`lib/lab-record.ts`); a save with fewer events than the one already kept does not replace it. `GET ?booking=<id>` gives the events and the experiment's name back to the owner or an admin, and answers anyone else as if there were no record. The lab page reads it too, before the student can start: a student who comes back in the same round continues from what was kept, so the record holds the earlier part followed by the new one, with a `start` and a `background` event for each entry, and the solenoid's table is filled from its `move` events. If it cannot be read, nothing is saved until it can, so a shorter record never replaces the one kept |
| `notifications` | Notification feed |
| `hardware` | Runs one of the rig's control scripts on the lab machine (from `RIG_SCRIPT_DIR`, with `RIG_PYTHON`). Only for the user whose booking is running right now (`lib/rig-access.ts`); break scripts stay allowed for 10 minutes after it ends. Body: `{ script }` for `coil_1.py`, `coil_2.py`, `coil_3.py` (switch a coil on), `coil_b.py`, `sole_b.py` (cut a circuit), or `{ script: "sole.py", position }` with a whole number from −10 to 10, run as `sole.py --position <n>`. Set 0 in the lab room: with a single coil the student switches the supply off and the zero is the field read where the probe is; with the solenoid the page sends `sole.py --position 10` (switching the supply on for it if it was off, and off again after), reads the field at that far end, and sets the zero so that the value measured there equals the theory value for the current in force, which also fills that position in the table. (`sole.py` itself still takes `--position set0`, the probe parked at the start of the row with the solenoid off, for use by hand; the web app does not send it.) A position is one of the 21 points the arm takes the probe to, 1 cm apart: position n is n cm from the middle of the 8 cm solenoid (`lib/physics.ts`). `sole_b.py` on the lab machine only returns the arm to its start position; it does not switch a relay. Only the web app switches the supply relays, through `relay.py` (`lib/rig.ts`, `lib/lab-presence.ts`): the solenoid's relay goes off when the next instrument is started, when the room empties, when the student or an admin switches the supply off, or when an admin stops the rig. Nothing else is accepted and nothing goes through a shell. The relay script (`relay.py`) is not among the commands a student can send: the supply follows who is in the room, see `lab/presence` |
| `lab/presence` | The lab page reports `{ action }`: `enter` when the student presses start, `stay` every 20 seconds, `leave` when the visit ends or the page is left (by `sendBeacon` when the tab closes). The power supply follows (`lib/lab-presence.ts`): on when a student with a running round enters, off when the room is empty, after cutting whatever circuit was left on. The supply is switched by `relay.py --status on|off --name <relay>`, where the relay is `solenoid`, `coil1`, `coil2`, `coil3` or `all` (`lib/rig.ts`). The page sends the script of the instrument it has selected as `instrument` (anything that is not an instrument is ignored): on is for that instrument's relay, after switching every relay off unless they are known to be off, so that one instrument is fed at a time; a page that names none gets `all`. Off is always `--name all`. While the supply is on, `hardware` moves it to the instrument being started. A page that has been quiet for 90 seconds counts as gone. Two more actions, `on` and `off`, are the student's own switch in the lab room, for as long as their round runs. Answers `{ ok, supply, held }`. A supply an admin switched off, by `rig/power` or by the emergency stop `rig/stop`, is held: it stays off for whoever is in the room, their `on` is refused with 409 and the switch is locked, until an admin switches it on or the next student enters |
| `cam/[...path]` | Reverse proxy for WHEP camera signaling — see "Camera streaming" below |
| `chat` | Proxies to the Typhoon LLM API for the AI teaching assistant. Signed-in users only; accepts user/assistant turns (last 20, 4,000 characters each) plus the current readings and the state of the lab room, and streams the answer back as SSE. The state is what the lab page knows when the question is sent: the supply (on, off, or held by an admin), whether the rig is carrying out a command, whether the sensor is sending values, how many times Set 0 was used, the last command that failed, the minutes left in the round, and the values recorded so far in the visit (the last 30). Every piece is optional and checked before it is written into the tutor's instructions (kinds, ranges, one short line for any text); what does not pass is left out. The tutor is told to answer in at most 100 words and to explain a reading from the state first (supply off, no sensor signal) before the physics; the answer is capped at 600 tokens as a backstop |
| `admin/overview`, `admin/bookings/[id]`, `admin/blocks`, `admin/labs/[id]`, `admin/rig/stop` | The admin page's API, for the people named in `ADMIN_EMAILS` only (403 for everyone else). `overview` lists the labs, the round running now and every booking in a range of days, with names from Firebase Auth. `bookings/[id]` cancels a round that has not started or ends the one running now (which also cuts the rig's circuits); its owner gets a notification. The student's lab page finds out within a minute and, if they had started, ends the visit as the finish button does (the record's `end` event says `round-closed`) and shows the summary; a re-check that fails (server error, dropped session) ends nothing. `blocks` closes a stretch of time to booking. `labs/[id]` opens or closes a lab to booking. `rig/stop` cuts both circuits and switches the power supply off at once, whoever has the rig, and then holds the supply off as `rig/power` does for off, even when a script could not be run: a student in the room cannot switch it back on (409, switch locked) until an admin switches it on or the next student enters. `rig/power` switches the supply on (the relay of the instrument whose circuit is on, or `all` when none is) or off (`all`), whoever is in the room; switched off, it overrides the student's own switch. `rig/currents` (`PATCH { currents: { [script]: amperes } }`) sets the current the theory is worked out with, per instrument: above 0, at most 10 A, to 0.001 A; the instruments not named keep theirs. The rig does not measure or set current, so the admin sets the supply by hand and keeps this number the same. The lab room reads the currents with `bookings/active-session` when a visit begins and uses them for that whole visit. `rig/instruments` closes instruments to students or opens them again (`lib/instruments.ts`, `lib/rig-settings.ts`): a closed one is left out of the lab room's list (`bookings/active-session` reports the list) and `hardware` refuses to start it; at least one must stay open. `readiness` (also under `admin/`, `POST`) checks the lab machine itself when an admin asks (`lib/lab-readiness.ts`): that the scripts folder and its Python are there and Python starts, that each of the eight scripts the app can run exists, parses and can find every module it imports (Python reads them with `ast`; none is run and nothing on the rig is switched), that a reading actually arrives from the sensor service, that each camera answers and that Firestore can be read. It answers one line per thing checked, `ok` true, false or null (could not be checked); this is what the unit tests cannot tell, since they run against stand-ins. `tests` (also under `admin/`) hands an admin the unit tests and how they went on the last recorded run, by category: the contents of `lib/test-report.json`, which `npm run test:report` writes; nothing is run by the request. `status` (also listed under `admin/`) reports the equipment: what the rig was last told to do (a record kept in memory by `lib/rig.ts`, not a reading from the rig), and whether each camera and the sensor service answer (`lib/lab-status.ts`) |
| `db-test` | Trivial Firestore connectivity health-check |

## Data model (Firestore)

There is no fixed schema file — Firestore is schemaless — but the app expects these collections:

- **`labs/{labId}`** — the experiment catalog (currently one seeded document, `LAB8`). Fields: `code`, `name_th`, `name_en`, `description_th`, `duration_minutes`, `is_active`. `labId` doubles as the human-readable code (e.g. `"LAB8"`) — no separate UUID.
- **`bookings/{bookingId}`** (auto-ID) — `user_id`, `lab_id`, `start_time`/`end_time` (Timestamps), `status` (`pending`/`confirmed`/`in_progress`/`completed`/`cancelled`), plus `notified_can_enter_at`/`notified_starting_soon_at` (reminder de-dup flags).
- **`sessions/{bookingId}`** — one doc per booking, **keyed by the booking's own ID** (not a separate auto-ID) so "start" is a plain existence-check-then-create instead of an upsert. Fields: `user_id`, `lab_id`, `booking_id`, `start_time`, `end_time`, `duration_seconds`, `status`.
- **`lab_records/{bookingId}`** — what a student did in the lab room during one round (every entry of that round, one after the other, when they left and came back), **keyed by the booking's ID**: `user_id`, `booking_id`, `lab_id`, `events` (the list `lib/lab-activity.ts` describes: each command, probe move, reading, zero and question with its time), `saved_at`. Written by `lab/record`; the booking gets `has_record: true` alongside, so the history list need not open the record to know. Bookings from before this was kept have neither.
- **`settings/rig`** — one document of rig settings an admin changes at run time: `currents` (the current of each instrument in amperes, by script, e.g. `{ "sole.py": 0.3 }`; an instrument with none stored has its default from `lib/instruments.ts`: 5 A for each single coil, 0.3 A for the solenoid), and `disabled_instruments` (the scripts of the instruments closed to students, e.g. `["coil_1.py", "coil_2.py", "coil_3.py"]`), `updated_by`, `updated_at`. Absent until an admin first closes something.
- **`notifications/{notificationId}`** (auto-ID) — `user_id`, `title`, `message`, `type`, `action_url`, `is_read`, `created_at`.

Leftovers from the removed room-sharing feature may still exist in the database and are no longer read or written: the `lab_chat` collection, and a `room_code` field on bookings created before the removal.

User profile data (`name`, `role`) is **not** stored in Firestore — it lives on the Firebase Auth user record itself (`displayName` for name, a custom claim for `role`), so reading the current user (`/api/auth/me`) is pure JWT verification with zero database reads.

## Auth & sessions

- **Google is the only sign-in method.** There is no signup flow and no email/password login — a user's Firebase Auth record is created automatically by their first Google sign-in.
- **Login** happens **client-side** via the Firebase Auth SDK (a Google popup). The client then POSTs the resulting ID token to `POST /api/auth/session`, which mints an **httpOnly session cookie** via `adminAuth.createSessionCookie()`.
- `/api/auth/session` rejects (403) any ID token whose `firebase.sign_in_provider` is not `google.com`. The login page offers nothing else, but the project's public web API key would otherwise let a caller obtain an ID token from another provider straight from the Firebase Auth REST API — so the Email/Password provider should also be disabled in the Firebase console.
- First-time sign-ins have no `role` claim yet; `/api/auth/session` defaults it to `'student'` and asks the client to force-refresh its ID token once before retrying, since a session cookie's claims are a snapshot of whatever ID token minted it — not the live user record. Nothing in the app assigns any other role, and no route decides anything by it.
- **Admins are named in configuration, not in data.** `ADMIN_EMAILS` (comma separated, in `.env`) lists the Google accounts that may open `/admin` and call `/api/admin/*`; `lib/admin.ts` compares the session's email with it on every request. Changing the list takes a restart.
- **A blocked stretch of time is a booking.** It is held in the admin's own name with `blocked: true` and an optional `note`, so the calendar and the overlap check need no special case; cancelling it lifts the block. While it runs, the admin who made it has the rig, as with any booking of theirs.
- Server-side routes that need a user verify the `session` cookie through `getSessionUser()` in `lib/session.ts`, i.e. `adminAuth.verifySessionCookie(cookie, /* checkRevoked */ false)` — a local JWT check against Firebase's cached public keys, no network round-trip and no database read.

## Booking overlap prevention

Double-booking the same lab for overlapping time ranges is prevented with a Firestore `runTransaction()` in `POST /api/bookings`: inside the transaction it reads all `bookings` for that `lab_id` with an active status (`pending`/`confirmed`/`in_progress`) whose `start_time` is before the new booking's end, filters for actual overlap in JS, and aborts (409) if any are found — otherwise it goes on to the limit. A user can hold at most 5 rounds at a time (`MAX_ACTIVE_BOOKINGS`): in the same transaction it reads that user's bookings with an active status and counts those whose `end_time` is still ahead, leaving out an admin's blocked stretches (`blocked: true`); at 5 it aborts with 409 and 'จองได้ไม่เกิน 5 รอบพร้อมกัน ยกเลิกรอบที่ไม่ใช้ก่อนจึงจะจองเพิ่มได้', otherwise it writes the new booking. Completed, cancelled and past rounds do not count, and `admin/blocks` is not subject to the limit. Firestore transactions retry automatically on write conflicts, giving the same race-safety a database-level constraint would.

Firestore has no equivalent of a SQL `CHECK` constraint, so `end_time > start_time` and "not booking in the past" are validated explicitly in the route before the transaction runs.

## Real-time architecture

The app has no WebSocket server of its own. The room-sharing feature (room codes, the `/view/[code]` spectator page, in-room chat and the `/ws` room server in `server.js`) was removed; a lab session now has exactly one participant, the user who booked it.

The only live socket is the sensor feed: the lab page opens `/ws/sensor`, which `next.config.ts` rewrites to the sensor service named in `SENSOR_URL` (`ws://127.0.0.1:8888` unless set). The rewrite is fixed when the app is built, so a new address needs a build as well as a restart. The service sends `{"bx", "by", "bz"}` in microtesla; `lib/sensor.ts` turns each message into the size of the field in mT and applies the calibration fitted on the rig (`CALIBRATION`). What the lab room shows and records is that value with the room's own field taken off: on entering (the start button), before the power supply or any circuit is switched on, the page takes one reading of the background (the mean of 20 values, as every recorded reading is) and from then on subtracts it from every value, calibrated less calibrated (`aboveBackground`). The background is in the visit's record, the summary and both CSV files; if the sensor sends nothing at entry, nothing is subtracted and the page says so beside the measured value; otherwise the value subtracted is shown there ("หักพื้นหลัง 0.074 mT", shortened in the narrow desktop column). The background is taken off as a vector (`fieldAbove` in `lib/sensor.ts`): the page keeps the three components the sensor read with nothing switched on, takes them off each message component by component, and shows the size of what is left; a reading for the record is the mean of 20 messages per component first. Taking size from size, as it did before, is right only when the background is parallel to the axis, and read up to 60 % low along the solenoid's tails on this rig. Set 0 reads the background again: with a single coil where the probe is, the student having switched the supply off; with the solenoid at position +10, the page switching the supply off for the reading and back on, after which that position is measured like any other. The calibration line (`CALIBRATION`) is the identity until it is fitted again. At a measuring point the calibration is set again when needed (`pointAdjustment` in `lib/sensor.ts`, the lab owner's rule): once the probe has come to rest (3 seconds after the arm stops) and 20 values have been averaged, a value further than 20 % from the theory value gets an offset for that point that brings it to the edge of that band, and only then is it shown and recorded; until then the measured value reads "รอค่า". Such a value is no longer what the sensor read; by the lab owner's decision nothing on the page, in the CSV files, in the visit's record or in what the assistant is told says which values were set this way. A reading with no sensor signal is not adjusted. When the sensor sends no value (none for a second, or none for a reading), the measured value on screen, in the field model, in the solenoid's table and its CSV and in what the assistant is told is 0, never the theory value; the visit's record keeps such a reading as no measurement. The student can have the zero read again with the **Set 0** button in the readings panel, where the probe now is. It works only while the power supply is off (with current in the winding the sensor reads the very field being measured, and pressing it then only says to switch the supply off first); every zero is in the record with its time, and each measured position of the solenoid keeps the zero that was in force when it was read. Both are sizes, not vectors, so the result is the instrument's own field only as far as the background lies along it. Next.js attaches its own upgrade listener to the HTTP server for that rewrite (and for HMR in development), so `server.js` needs no upgrade handling.

Notifications are polled, not pushed — `useNotifications()` calls `/api/notifications` + `/api/bookings/notify-upcoming` every 30 seconds, plus immediately on a `booking-created` DOM event fired by the booking calendar.

## Camera streaming

Two physical cameras (`cam1`, `cam2`, `cam3` per experiment type — main + secondary depending on whether the selected instrument is a coil or solenoid) run on MediaMTX at a separate machine (`http://34.87.165.238:8889`), configured via env vars of the same names (`cam1=http://.../camera1`, etc.). The browser never talks to MediaMTX directly — it POSTs its WHEP SDP offer to `/api/cam/{camKey}/whep`, a same-origin proxy in `app/api/cam/[...path]/route.ts` that forwards to the right MediaMTX URL server-side. The proxy attaches the camera's credentials, so it only forwards paths that stay under that camera's own URL: a `..` segment, or one carrying a slash (which arrives when a caller encodes it), is answered with 404. This keeps the camera host configurable without rebuilding the client bundle and works regardless of what public domain the Next app itself is served behind.

## Deployment

- `Dockerfile` builds the Next app into a single image (`remote-lab:latest`).
- `docker-compose.yml` runs that image plus a `cloudflared` tunnel container for public ingress — there is no database container; all server-side env vars (Firebase Admin credentials, camera URLs, Typhoon key, admin emails, the rig's script folder, tunnel token) are supplied via `.env` (`env_file: .env`). `.env.example` lists every variable with a note on each.
- Firestore composite indexes are not defined in a `firestore.indexes.json` — they were created ad hoc through the Firebase Console as each query's `FAILED_PRECONDITION` error surfaced during development. If Firestore is ever reset, the composite indexes needed are: `labs(is_active, code)`, `bookings(lab_id, status, start_time)`, `bookings(status, start_time)`, `bookings(user_id, status, start_time)`, `bookings(user_id, start_time desc)`, `notifications(user_id, created_at desc)`.

## Notable non-obvious behavior

- **The lab room's field model is computed, not drawn** — `scripts/field-model.mjs` traces the field lines of the rig's own coil (radius 1.3 cm) and solenoid (8 cm long, radius 2.1 cm) through the exact off-axis field and stores them in `lib/field-model.ts`, with |B| along each line; `__tests__/field-model.test.ts` checks them against a direct Biot-Savart sum over the wire. Both views (`app/lab/FieldViz.tsx`, `FieldView3D.tsx`, through `lib/field-geometry.ts`) draw those lines to scale. What the drawing means: a line's level is the field summed outward along the mid-plane, in equal steps, so across the mid-plane inside the winding the lines crowd where the field is strong (only there: the field is axisymmetric, and further round a line its gaps follow other things too); the coil's n-turn drawing has n times the lines of the one-turn one; a line's brightness rises with |B| and is measured against the strongest field in that drawing, so it compares places within one drawing and says nothing between drawings; in 3D a line is repeated round the axis in proportion to how far from it it starts, so that each line carries about the same share of the field (the solenoid's within 1 %, the coil's within about a sixth either way; the axis line and the last 2.6 mm next to the coil's wire are outside that count), and a line that leaves the traced region fades out at its edge instead of stopping in mid-air. The probe's two arrows are the field at the probe from theory and from the sensor (which reports a size, drawn along the axis for comparison), each against the theory field at the centre and no longer than 1.3 times it. The 3D camera backs off as the model is turned, so the probe's whole travel stays in the picture, and its canvas exists only while its layout is the visible one. Direction: the current runs counterclockwise seen from +z (out of the page at the top of the section), so B points along +z on the axis. The rig's dimensions are written in both `lib/physics.ts` and the two generators: change them together and rerun both.

- **No pagination via offset/limit anywhere** — Firestore doesn't support it efficiently. `dashboard/history` uses a cursor (`start_time` of the last item returned) instead of a page number. Two bookings can share a start time (a slot cancelled and booked again), so a page never ends between them and can hold more than ten.
- **`labId` is a human-readable string, not a UUID** — `labs/LAB8` — chosen deliberately since Firestore doesn't need surrogate keys, and it keeps `lab_id` fields readable in the console.
- **The lab room adapts to viewport height, not only width** — the page never scrolls as a whole, so the desktop tree (≥1024px) has to fit whatever height it gets. The camera row is sized from the 16:9 shape of the feeds; the bottom row (selector, readings, formula, field view, Z table) takes the rest but has a minimum height, so on an 11–12" screen (roughly 1024–1366 × 600–760 once browser chrome is subtracted) the cameras give up height first and the left column scrolls only as a last resort. The `short:` Tailwind variant (`max-height: 760px`, declared in `app/globals.css`) only tightens spacing on top of that. Below 1024px wide the tabbed compact tree is used instead. Both trees stay mounted and are switched with CSS.
