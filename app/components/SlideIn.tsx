'use client';

import { useLayoutEffect, useRef } from 'react';
import { animate } from 'animejs';
import { prefersReducedMotion } from '@/lib/motion';

// A panel that appears in answer to a click slides into place instead of
// popping in. It stays still when the visitor asked for reduced motion.
export default function SlideIn({ from = -8, ...props }: React.ComponentProps<'div'> & { from?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!ref.current || prefersReducedMotion()) return;
    const entering = animate(ref.current, { opacity: [0, 1], translateY: [from, 0], duration: 320, ease: 'outCubic' });
    return () => { entering.pause(); };
  }, [from]);

  return <div ref={ref} {...props} />;
}
