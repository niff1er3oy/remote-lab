// A formula shown as its LaTeX source. This is what stands in while KaTeX is
// still loading, while a formula is still being streamed, and when a formula
// cannot be typeset at all — the reader gets the text instead of nothing.
export default function MathSource({ tex, display = false }: { tex: string; display?: boolean }) {
  return display
    ? <span className="my-1 block overflow-x-auto rounded border border-violet-500/20 bg-violet-950/30 px-2 py-1 text-center font-mono text-sm text-violet-300">{tex.trim()}</span>
    : <span className="rounded bg-violet-950/20 px-0.5 font-mono text-sm text-violet-300">{tex.trim()}</span>;
}
