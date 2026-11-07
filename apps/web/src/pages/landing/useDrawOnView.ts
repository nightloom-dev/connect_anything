import { useLayoutEffect, useRef } from 'react';

/**
 * A drawing of sheets 2 to 5 plays once, when it comes up the screen. Until then it waits on its first frame
 * (data-draw="wait", landing.css); once its top is above the lowest fifth of the screen it plays (data-draw="play")
 * and stays drawn, whichever way the page scrolls after. One above the screen when the page opens (a reload halfway
 * down) plays at once; one a jump went past waits until the page comes back to it. The attribute is set here, not
 * rendered, so that a render of the page never puts it back.
 */
export function useDrawOnView<T extends Element>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const play = () => element.setAttribute('data-draw', 'play');
    if (typeof IntersectionObserver === 'undefined') return play();
    element.setAttribute('data-draw', 'wait');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && entry.boundingClientRect.bottom >= 0) return;
        play();
        observer.disconnect();
      },
      { rootMargin: '0px 0px -20% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return ref;
}
