import type { Locator, Page } from '@playwright/test';

// Walks a page from the keyboard and checks every stop of the focus on the way: that a person can see where it is
// (WCAG 2.4.7) and that it is not hidden, under the sticky header say (2.4.11).
//
// "Can see" is measured, not guessed from class names. Before each key press the walk notes how every element that can
// take the focus looks: outline, shadow, border, background, colour, its own and those of four ancestors, pseudo
// elements and a slider's thumb included. After the press it compares the element that took the focus with how it
// looked before. The app draws focus in several ways (an outline; a ring on the field around an input; the border of the
// card that holds a link) and each changes one of these. Only stops in the tab order count: a heading the page focuses
// by script, to tell a screen reader where the person is (tabindex="-1"), need not show it.

export type Stop = {
  /** The key that led here. */
  key: string;
  /** What has the focus: role or tag, and name. */
  name: string;
  /** In a shadow root: AppKit's modal, whose look is its own. */
  thirdParty: boolean;
  /** In the tab order (tabindex ≥ 0). */
  tabbable: boolean;
  /** Its look changed when it took the focus; null when there was nothing to compare (the page, the same element). */
  shown: boolean | null;
  /** No part of it can be seen: out of the window, or under something else. */
  hidden: boolean;
  /** What covers it, when something does. */
  cover?: string;
  /** What covers it is AppKit's modal. */
  coverThirdParty?: boolean;
};

type Kit = { note: () => void; read: (key: string) => Stop };

declare global {
  interface Window {
    __focusKit?: Kit;
  }
}

/** Defines window.__focusKit. Runs in the page, so it closes over nothing. */
function kit() {
  if (window.__focusKit) return;
  const PROPS = ['outline-style', 'outline-width', 'outline-color', 'box-shadow', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color', 'background-color', 'color', 'text-decoration-line', 'opacity'];
  const FOCUSABLE = 'a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable]';
  const parent = (element: Element) => element.parentElement ?? ((element.parentNode as ShadowRoot | null)?.host as Element | undefined) ?? null;
  const chain = (element: Element) => {
    const nodes: Element[] = [];
    for (let node: Element | null = element; node && nodes.length < 5 && node !== document.body; node = parent(node)) nodes.push(node);
    return nodes;
  };
  const look = (element: Element) =>
    chain(element)
      .map(node => {
        const pseudos = [null, '::before', '::after'];
        if (node instanceof HTMLInputElement && node.type === 'range') pseudos.push('::-webkit-slider-thumb');
        return pseudos.map(pseudo => PROPS.map(prop => getComputedStyle(node, pseudo).getPropertyValue(prop)).join('|')).join('/');
      })
      .join(' > ');
  const active = () => {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    return element;
  };
  const hitAt = (x: number, y: number) => {
    let hit = document.elementFromPoint(x, y);
    while (hit?.shadowRoot) {
      const deeper = hit.shadowRoot.elementFromPoint(x, y);
      if (!deeper || deeper === hit) break;
      hit = deeper;
    }
    return hit;
  };
  const within = (inner: Element | null, outer: Element) => {
    for (let node = inner; node; node = parent(node)) if (node === outer) return true;
    return false;
  };
  // A slider draws its focus on its thumb, which getComputedStyle cannot read: a rule of the page's own styles that
  // gives the thumb of this slider, focused, a ring or a colour of its own will do.
  const thumbRing = (element: Element) => {
    const rules: CSSStyleRule[] = [];
    const collect = (list: CSSRuleList) => {
      for (const rule of list) {
        if (rule instanceof CSSStyleRule) rules.push(rule);
        else if ('cssRules' in rule) collect((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        collect(sheet.cssRules);
      } catch {
        // a stylesheet of another origin: none here
      }
    }
    return rules.some(rule =>
      rule.selectorText.split(',').some(part => {
        const focused = /^(.*:focus(?:-visible)?)::-webkit-slider-thumb$/.exec(part.trim())?.[1];
        return focused !== undefined && element.matches(focused) && ['box-shadow', 'outline-style', 'background-color', 'border-color'].some(prop => rule.style.getPropertyValue(prop));
      }),
    );
  };

  let looks = new WeakMap<Element, string>();
  let last: Element | null = null;

  const note = () => {
    looks = new WeakMap();
    const walk = (root: Document | ShadowRoot) => {
      for (const element of root.querySelectorAll('*')) {
        if (element.matches(FOCUSABLE)) looks.set(element, look(element));
        if (element.shadowRoot) walk(element.shadowRoot);
      }
    };
    walk(document);
    last = active();
  };

  const read = (key: string): Stop => {
    const element = active();
    if (!element || element === document.body || element === document.documentElement) {
      return { key, name: 'nothing (the page itself)', thirdParty: false, tabbable: false, shown: null, hidden: false };
    }
    const thirdParty = element.getRootNode() instanceof ShadowRoot;
    const role = element.getAttribute('role') ?? element.tagName.toLowerCase();
    const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
    const label =
      element.getAttribute('aria-label') ??
      (field ? [...(element.labels ?? [])].map(label => label.textContent?.trim()).join(' ') || element.getAttribute('placeholder') || element.name : (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60));
    const name = `${role}${element instanceof HTMLInputElement ? `[${element.type}]` : ''} "${label}"`;
    const tabbable = (element as HTMLElement).tabIndex >= 0;

    let shown: boolean | null = null;
    if (last !== element) {
      const then = looks.get(element);
      // new since the last key press, as the first stop in a dialog that just opened: an outline or a ring will do
      shown =
        then !== undefined
          ? then !== look(element)
          : chain(element).some(node => {
              const style = getComputedStyle(node);
              return (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none';
            });
      if (!shown && element instanceof HTMLInputElement && element.type === 'range') shown = thumbRing(element);
    }

    // hidden: five points of it, its middle and around it, each land on something that is neither it nor inside it.
    // A field hidden on purpose (a file input under its drop zone) is judged by the box that shows it.
    let box: Element | null = element;
    while (box && parent(box) && (box.getBoundingClientRect().width <= 2 || box.getBoundingClientRect().height <= 2)) box = parent(box);
    const rect = (box ?? element).getBoundingClientRect();
    const left = Math.max(rect.left, 0);
    const right = Math.min(rect.right, innerWidth);
    const top = Math.max(rect.top, 0);
    const bottom = Math.min(rect.bottom, innerHeight);
    let hidden = right - left < 1 || bottom - top < 1;
    let cover: Element | null = null;
    if (!hidden) {
      const at = (x: number, y: number) => [left + (right - left) * x, top + (bottom - top) * y] as const;
      const points = [at(0.5, 0.5), at(0.25, 0.25), at(0.75, 0.25), at(0.25, 0.75), at(0.75, 0.75)];
      const hits = points.map(([x, y]) => hitAt(x, y));
      hidden = hits.every(hit => !hit || !(within(hit, box ?? element) || within(box ?? element, hit)));
      if (hidden) cover = hits[0];
    }
    if (!cover) return { key, name, thirdParty, tabbable, shown, hidden };
    // the outermost element of what covers it in the page itself: AppKit's modal is one custom element
    let host: Element = cover;
    while (host.getRootNode() instanceof ShadowRoot) host = (host.getRootNode() as ShadowRoot).host;
    const classes = typeof host.className === 'string' ? host.className.split(/\s+/).slice(0, 3).join('.') : '';
    return { key, name, thirdParty, tabbable, shown, hidden, cover: `<${host.tagName.toLowerCase()}${classes ? `.${classes}` : ''}>`, coverThirdParty: host !== cover || host.tagName.includes('-') };
  };

  window.__focusKit = { note, read };
}

export class KeyboardWalk {
  readonly stops: Stop[] = [];
  private readonly page: Page;

  private constructor(page: Page) {
    this.page = page;
  }

  /** Before the page loads: the walk's code then comes with every page the walk opens. */
  static async on(page: Page) {
    await page.addInitScript(kit);
    return new KeyboardWalk(page);
  }

  /** Presses one key, as a person would, and records where the focus lands. */
  async press(key: string): Promise<Stop> {
    await this.page.evaluate(kit);
    await this.page.evaluate(() => window.__focusKit!.note());
    await this.page.keyboard.press(key);
    // two frames, for the page to draw what the key changed
    await this.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await this.page.evaluate(kit);
    const stop = await this.page.evaluate(key => window.__focusKit!.read(key), key);
    this.stops.push(stop);
    return stop;
  }

  /** Types into what has the focus. */
  async type(text: string) {
    await this.page.keyboard.type(text);
  }

  /** Presses Tab (Shift+Tab with `back`) until `target` has the focus; fails with the stops on the way if it never does. */
  async tabTo(target: Locator, { back = false, max = 80 }: { back?: boolean; max?: number } = {}) {
    const key = back ? 'Shift+Tab' : 'Tab';
    await target.waitFor();
    const from = this.stops.length;
    for (let presses = 0; presses < max && !(await isFocused(target)); presses++) await this.press(key);
    if (await isFocused(target)) return;
    const path = this.stops.slice(from).map(stop => stop.name);
    throw new Error(`${max} presses of ${key} never reached ${target}. The focus went: ${path.join(' → ')}`);
  }

  /** The stops of the app's own elements, in the tab order, where the focus could not be seen. */
  unseen() {
    return this.stops.filter(stop => stop.tabbable && !stop.thirdParty && stop.shown === false).map(describe);
  }

  /** The stops where no part of what has the focus could be seen, but for those under AppKit's modal (`underModal`). */
  covered() {
    return this.stops.filter(stop => stop.tabbable && stop.hidden && !stop.coverThirdParty).map(stop => `${describe(stop)}, under ${stop.cover ?? 'the edge of the window'}`);
  }

  /** The stops of the page under AppKit's modal while it is open. */
  underModal() {
    return this.stops.filter(stop => stop.tabbable && stop.hidden && stop.coverThirdParty).map(describe);
  }

  /** The keys, but Tab, after which the focus was on nothing: the element that had it went away or was disabled. */
  dropped() {
    return this.stops.filter(stop => !/Tab$/.test(stop.key) && stop.name === NOTHING).map(stop => stop.key);
  }

  /** Every stop, for the report. */
  path() {
    return this.stops.map(stop => `${describe(stop)}${stop.thirdParty ? ' (AppKit)' : ''}${stop.shown === false ? ' UNSEEN' : ''}${stop.hidden ? ` HIDDEN under ${stop.cover ?? 'the edge'}` : ''}`).join('\n');
  }
}

const NOTHING = 'nothing (the page itself)';
const describe = (stop: Stop) => `${stop.key} → ${stop.name}`;

/** Whether `target` has the focus, through shadow roots. */
export const isFocused = (target: Locator) =>
  target.evaluate(element => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active === element;
  });
