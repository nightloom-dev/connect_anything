import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

// axe as every spec runs it: all of its rules but the experimental ones. The whole report is attached to the test.
// Serious and critical violations fail it; A11Y_STRICT=0 only lists them, as an annotation, for a look at a page
// that is known to be broken. Moderate and minor ones are always listed and never fail.

const STRICT = process.env.A11Y_STRICT !== '0';

type Audit = {
  /** Wait for the network to settle first. Off while a request is held on purpose. */
  idle?: boolean;
  /** Only this part of the page, as a CSS selector: one section of the gallery, say. */
  include?: string;
  /** What the report and the failure call this part. */
  name?: string;
};

export async function audit(page: Page, testInfo: TestInfo, { idle = true, include, name = include ?? 'the page' }: Audit = {}) {
  if (idle) await page.waitForLoadState('networkidle');
  const builder = new AxeBuilder({ page });
  if (include) builder.include(include);
  const results = await builder.analyze();
  await testInfo.attach(`axe results: ${name}`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  const describe = ({ id, impact, help, nodes }: (typeof results.violations)[number]) => `${impact} ${id}: ${help} (${nodes.length}× e.g. ${nodes[0]?.target.join(' ')})`;
  const grave = results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical').map(describe);
  const mild = results.violations.filter(({ impact }) => impact !== 'serious' && impact !== 'critical').map(describe);
  if (mild.length) testInfo.annotations.push({ type: 'a11y (moderate, minor)', description: `${name}\n${mild.join('\n')}` });
  if (STRICT) expect.soft(grave, `serious and critical axe violations in ${name}`).toEqual([]);
  else if (grave.length) testInfo.annotations.push({ type: 'a11y', description: `${name}\n${grave.join('\n')}` });
  return results;
}
