// The figures of a quote as the run card writes them. Display only: they are worked out from what the SDK returned, and
// nothing here goes back into what is created, signed or sent.

/** An amount in atomic units of a token with these decimals. */
export type Amount = { atomic: string; decimals: number };

export type QuoteAmounts = {
  /** What is paid, in the token paid with. */
  paid: Amount;
  /** Whether that is the token delivered, so that its figure takes the same precision as theirs. */
  samePaid: boolean;
  /** In atomic units of the token delivered: what arrives at least (the quote's minAmountOut). */
  delivered: string;
  /** The network fee, taken out of what arrives. */
  fee?: string;
  /** What the recipe spends: the preview's spendable. None for a recipe whose amounts are written into it. */
  spendable?: string;
  /** The decimals of the token delivered. */
  decimals: number;
};

export type QuoteFigures = {
  paid: string;
  delivered: string;
  fee?: string;
  /**
   * What the run keeps back for the quote to move: what arrives, less the fee and what the recipe spends. It stays with
   * the intermediary. None when nothing is left over, or when the figures would leave less than nothing.
   */
  held?: string;
  spends?: string;
};

/** Decimal places that write an amount exactly. */
function placesOf({ atomic, decimals }: Amount) {
  let value = BigInt(atomic);
  let places = decimals;
  while (places > 0 && value % 10n === 0n) {
    value /= 10n;
    places--;
  }
  return places;
}

const formats = new Map<number, Intl.NumberFormat>();

/** An amount with exactly `places` decimals, or its own when it has fewer, in en-US: 774.19965, 4,400.00. Exact, since the digits go in as text. */
export function writeAmount({ atomic, decimals }: Amount, places: number) {
  const shown = Math.min(places, decimals);
  let format = formats.get(shown);
  if (!format) formats.set(shown, (format = new Intl.NumberFormat('en-US', { minimumFractionDigits: shown, maximumFractionDigits: shown })));
  const digits = BigInt(atomic).toString().padStart(decimals + 1, '0');
  const point = digits.length - decimals;
  const text = decimals ? `${digits.slice(0, point)}.${digits.slice(point)}` : digits;
  // a string goes in as the exact decimal it writes, where a number would round past 2^53 (the getter's function is bound)
  const exact = format.format as unknown as (value: string) => string;
  return exact(text);
}

/** The places that write every one of these amounts exactly, and at least `least` (fewer for a token with fewer decimals). */
export function sharedPlaces(amounts: Amount[], least = 2) {
  return Math.max(least, ...amounts.map(placesOf));
}

/**
 * The quote's figures, each exact and all of the token delivered at one precision, so that they add up to the atomic
 * unit: at least `delivered` arrives, the fee and what is held back come out of it, and the rest is what the recipe spends.
 */
export function quoteFigures({ paid, samePaid, delivered, fee, spendable, decimals }: QuoteAmounts): QuoteFigures {
  const left = spendable === undefined ? undefined : BigInt(delivered) - BigInt(fee ?? '0') - BigInt(spendable);
  const held = left !== undefined && left > 0n ? left.toString() : undefined;
  const of = (atomic: string): Amount => ({ atomic, decimals });
  const rows = [of(delivered), ...(spendable === undefined ? [] : [of(spendable)]), ...(fee ? [of(fee)] : []), ...(held ? [of(held)] : [])];
  const places = sharedPlaces(samePaid ? [...rows, paid] : rows);
  const write = (atomic: string) => writeAmount(of(atomic), places);
  return {
    paid: writeAmount(paid, samePaid ? places : sharedPlaces([paid])),
    delivered: write(delivered),
    fee: fee ? write(fee) : undefined,
    held: held && write(held),
    spends: spendable === undefined ? undefined : write(spendable),
  };
}

/** A figure of a quote with no payment in it, as a Retry's or a Refund's: atomic units of a token, either unknown yet. */
export type BoxRow = { atomic?: string; token?: { decimals: number; symbol: string } };

/** Such a quote's figures, each with its token's symbol, all at the precision the most exact of them needs: '–' for one not known. */
export function boxFigures(rows: BoxRow[]) {
  const places = sharedPlaces(rows.flatMap(({ atomic, token }) => (atomic && token ? [{ atomic, decimals: token.decimals }] : [])));
  return rows.map(({ atomic, token }) => (atomic && token ? `${writeAmount({ atomic, decimals: token.decimals }, places)} ${token.symbol}` : '–'));
}
