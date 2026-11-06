import { useContext, useEffect } from 'react';
import { AppKitContext } from '@aurora-is-near/intents-connect-wallet/connect/appkit';

// AppKit's modal (<w3m-modal>, at the end of <body>) means to take the focus when it opens and to send Tab back into
// itself, but it looks for its card before Lit has drawn it and finds nothing: the focus stays on the page behind it, and
// Tab walks the page under it. So while it is open the rest of the page is inert, out of reach of Tab and of a
// screen reader, and its card takes the focus once it is drawn. When it closes, the focus goes back to what opened it, or
// to what took that element's place, as the connected wallet takes the place of Connect wallet in the header.

/** How long to wait, in frames, for the card to be drawn or for what opened the modal to take the focus again: about 2 s. */
const FRAMES = 120;
/** Frames the focus has to stay where it was put back, as an element can be swapped for another just after the modal closes. */
const SETTLE = 12;
const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const modalOf = () => document.querySelector('w3m-modal');
const inModal = (node: Node | null) => !!node && node instanceof Element && !!node.closest('w3m-modal');
const usable = (element: Element | null | undefined): element is HTMLElement =>
  element instanceof HTMLElement && element.isConnected && !element.matches(':disabled') && !element.closest('[inert]');

/** Runs `step` once a frame until it returns true, FRAMES times at most. Returns what stops it. */
function eachFrame(step: () => boolean) {
  let frames = 0;
  let id = requestAnimationFrame(function run() {
    if (step() || ++frames >= FRAMES) return;
    id = requestAnimationFrame(run);
  });
  return () => cancelAnimationFrame(id);
}

/** Keeps the keyboard in AppKit's modal while it is open, and gives the focus back when it closes. Renders nothing. */
export function AppKitFocus() {
  const appKit = useContext(AppKitContext)?.appKit;
  useEffect(() => {
    if (!appKit) return;
    // A button that opens the modal is disabled while it is open, and the focus leaves it before AppKit says it is
    // open: so the element of the page that last had the focus is noted all along.
    let last: HTMLElement | null = null;
    const note = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && !inModal(event.target)) last = event.target;
    };
    document.addEventListener('focusin', note, true);

    let open = false;
    let opener: HTMLElement | null = null;
    // the opener's ancestors, nearest first: where to look for what takes its place
    let places: Element[] = [];
    let inert: Element[] = [];
    let stop = () => {};
    const release = () => {
      for (const element of inert) element.removeAttribute('inert');
      inert = [];
    };

    const opened = () => {
      const active = document.activeElement;
      opener = active instanceof HTMLElement && active !== document.body && !inModal(active) ? active : last;
      places = [];
      for (let node = opener?.parentElement; node && node !== document.body && places.length < 4; node = node.parentElement) places.push(node);
      // everything but the modal: the app's root, and the portals of its popovers and tooltips
      inert = [...document.body.children].filter(element => element !== modalOf() && !element.hasAttribute('inert') && !['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE'].includes(element.tagName));
      for (const element of inert) element.setAttribute('inert', '');
      stop = eachFrame(() => {
        const card = modalOf()?.shadowRoot?.querySelector<HTMLElement>('wui-card');
        if (!card) return false;
        // the person may have reached into the modal already
        if (!inModal(document.activeElement)) card.focus({ preventScroll: true });
        return true;
      });
    };

    const closed = () => {
      release();
      let held = 0;
      stop = eachFrame(() => {
        const active = document.activeElement;
        if (active && active !== document.body && !inModal(active)) {
          // put back, and kept there for a few frames; or the page or the person moved it elsewhere: leave it there
          const back = active === opener || places.some(place => place.contains(active));
          return !back || ++held >= SETTLE;
        }
        held = 0;
        const target = opener?.isConnected ? opener : places.find(place => place.isConnected)?.querySelector(FOCUSABLE);
        // the opener is disabled until the connect it started has ended: wait for it
        if (usable(target)) target.focus({ preventScroll: true });
        return false;
      });
    };

    const unsubscribe = appKit.subscribeState(state => {
      if (state.open === open) return;
      open = state.open;
      stop();
      if (open) opened();
      else closed();
    });
    return () => {
      unsubscribe();
      stop();
      release();
      document.removeEventListener('focusin', note, true);
    };
  }, [appKit]);
  return null;
}
