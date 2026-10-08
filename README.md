# Remote Lab

A web platform that lets students, researchers, and instructors book and remotely operate a real physics lab experiment (Lab 8: Biot–Savart law / magnetic fields) over the internet — live camera feeds, real hardware control, live sensor readings, and an AI teaching assistant, all within a booked time slot.

See [DESIGN.md](./DESIGN.md) for the architecture, tech stack, directory layout, data model, and deployment notes.

## Getting Started

```bash
npm install
cp .env.example .env   # then fill in the values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server (`server.js`) boots Next.js — see `AGENTS.md` for the color theme and `DESIGN.md` for everything else.

## Tests

```bash
npm test               # run once
npm run test:watch     # re-run on change
npm run test:coverage  # run once and report coverage
```

Unit tests live in `__tests__/` and run on Jest with React Testing Library. They never touch the real Firebase project, the LLM or the rig: the credentials from `.env` are replaced before any test loads, and anything a test does not mock throws.
