import { expect, type Page } from '@playwright/test';

// The heading outline of a page: one h1, the page's own title, before any other heading, and no level skipped on
// the way down. The logo in the header is a link, not a heading.

type Heading = { level: number; text: string };

/** The headings a screen reader lists, in order: hidden ones, aria-hidden ones and those in a closed <details> are left out. */
export const headingsOf = (page: Page): Promise<Heading[]> =>
  page.getByRole('heading').evaluateAll(elements =>
    elements.map(element => ({
      level: Number(element.getAttribute('aria-level') ?? (/^H[1-6]$/.test(element.tagName) ? element.tagName[1] : 2)),
      text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    })),
  );

/** What is wrong with an outline, in words: nothing for a good one. */
export function outlineProblems(headings: Heading[]): string[] {
  const problems: string[] = [];
  const ones = headings.filter(({ level }) => level === 1).length;
  if (ones !== 1) problems.push(`${ones} h1 headings, not 1`);
  if (headings.length > 0 && headings[0].level !== 1) problems.push(`the first heading is h${headings[0].level}: "${headings[0].text}"`);
  headings.forEach(({ level, text }, index) => {
    const above = headings[index - 1];
    if (above && level > above.level + 1) problems.push(`h${above.level} then h${level}: "${text}" skips a level`);
  });
  return problems;
}

export async function expectOutline(page: Page) {
  const headings = await headingsOf(page);
  const listed = headings.map(({ level, text }) => `${'  '.repeat(level - 1)}h${level} ${text}`).join('\n');
  expect(outlineProblems(headings), `the heading outline:\n${listed}`).toEqual([]);
}
