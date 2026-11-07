import { useEffect, useRef } from 'react';

// --color-accent (#1f3fd1) at 14%, as a literal: the Web Animations API takes a color, not a token
const WASH = 'rgb(31 63 209 / 0.14)';
const CLEAR = 'rgb(31 63 209 / 0)';

/**
 * A short cobalt wash over an element whose words change, as the figures of a new quote: so that what moved is seen.
 * Not on the first render, not from empty (a skeleton) to a figure, and not with motion reduced. The wash spreads 3 px
 * past the element, as a shadow, so that the layout stays as it is.
 */
export function useFlash<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const said = useRef<string | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const text = element.textContent ?? '';
    const before = said.current;
    said.current = text;
    if (!before || before === text || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    element.animate?.(
      [
        { backgroundColor: WASH, boxShadow: `0 0 0 3px ${WASH}` },
        { backgroundColor: CLEAR, boxShadow: `0 0 0 3px ${CLEAR}` },
      ],
      // 600 ms and --ease-out, as the tokens have them
      { duration: 600, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  });
  return ref;
}
