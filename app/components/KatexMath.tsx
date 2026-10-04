'use client';

import { memo, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import MathSource from './MathSource';

// Typesets one LaTeX formula. KaTeX and its stylesheet live in this file only,
// so a page that loads it lazily keeps them out of its first bundle.
//
// The markup comes from KaTeX with its default `trust: false`, which is built
// to take untrusted input: no links, no raw HTML, no styles from the formula.
// A formula KaTeX cannot parse falls back to its source rather than an error.
function KatexMath({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      // strict: 'ignore' lets Thai inside \text{…} through without console noise.
      return katex.renderToString(tex.trim(), { displayMode: display, throwOnError: true, strict: 'ignore' });
    } catch {
      return null;
    }
  }, [tex, display]);

  if (html === null) return <MathSource tex={tex} display={display} />;

  // KaTeX sets its own size at 1.21em of the text around it; next to the chat's
  // small sans-serif that reads too heavy, so it is brought down a little.
  return display ? (
    // A wide formula scrolls sideways inside its own box instead of pushing
    // the chat column wider.
    <span
      className="my-1.5 block overflow-x-auto overflow-y-hidden rounded-lg border border-white/10 bg-gray-950/60 px-3 py-2.5 text-gray-100 [scrollbar-width:thin] [&_.katex-display]:my-0 [&_.katex]:text-[1.1em]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <span className="text-gray-100 [&_.katex]:text-[1.1em]" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

// A reply re-renders for every streamed piece of text; formulas that are
// already complete have nothing to redo.
export default memo(KatexMath);
