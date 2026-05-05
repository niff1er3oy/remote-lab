<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Color Theme

**Core palette: Dark Navy × Bright Green**

## Backgrounds (Dark Navy)
- Page background: `#030712` (gray-950)
- Hero section: radial gradient `#1d40f5 → #0c18c2 → #07108a → #040b5c` (deep blue, origin top-right)
- Cards / surfaces: `gray-900/50`, `gray-900`
- Navbar: `gray-950/80` + backdrop blur

## Primary Accent — Bright Green `#c8ff00`
The hero color. Used for: headline text, outline strokes, CTA buttons, badge, grid overlay tint.
- Glow: `rgba(200,255,0,0.3–0.45)`
- Muted stroke: `#c8ff0066`
- Text on green bg: `gray-950` (dark)

## Secondary Accent — Cyan (supporting only)
Used sparingly for UI chrome: labels, icons, booking slots, links.
- `cyan-400` / `cyan-500` — do not use as a hero accent, keep it secondary

## Text
- Primary: `white`
- Secondary: `gray-400`
- Muted: `gray-500`, `gray-600`

## Borders
- Default: `white/10`
- Subtle: `white/5`
- Hover: `cyan-500/30`
