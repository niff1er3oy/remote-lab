import { render, screen } from '@testing-library/react';
import KatexMath from '@/app/components/KatexMath';
import MathSource from '@/app/components/MathSource';

// The formulas the AI assistant writes in the lab chat.
describe('KatexMath', () => {
  it('typesets a formula as a fraction instead of showing its LaTeX source', () => {
    const { container } = render(<KatexMath tex={'B_0 = \\frac{\\mu_0 n I}{2R}'} />);
    expect(container.querySelector('.katex')).toBeInTheDocument();
    expect(container.querySelector('.katex .mfrac')).toBeInTheDocument();
    expect(container.querySelector('.katex-display')).not.toBeInTheDocument();
  });

  it('sets a display formula in a block of its own', () => {
    const { container } = render(<KatexMath display tex={'B_z = \\frac{\\mu_0 N I}{2L}\\left[\\cos\\alpha_1 + \\cos\\alpha_2\\right]'} />);
    expect(container.querySelector('.katex-display')).toBeInTheDocument();
  });

  it('typesets Thai text inside \\text{}', () => {
    const { container } = render(<KatexMath tex={'N = 75\\ \\text{รอบ}'} />);
    expect(container.querySelector('.katex')).toHaveTextContent('รอบ');
  });

  it('falls back to the source when the formula cannot be parsed', () => {
    const { container } = render(<KatexMath tex={'\\frac{a}{'} />);
    expect(container.querySelector('.katex')).not.toBeInTheDocument();
    expect(screen.getByText('\\frac{a}{')).toBeInTheDocument();
  });
});

describe('MathSource', () => {
  it('shows the LaTeX as written', () => {
    render(<MathSource tex={'  x^2 + y^2  '} />);
    expect(screen.getByText('x^2 + y^2')).toBeInTheDocument();
  });
});
