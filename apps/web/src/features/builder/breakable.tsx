import { Fragment } from 'react';

/**
 * A name from an IDL, as repay_accounts.lending_market, that wraps after its dots and underscores before it breaks
 * inside a word. Give its element [overflow-wrap:anywhere], for a part still too long for the line.
 */
export const breakable = (name: string) =>
  name.split(/(?<=[._])/).map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <wbr />}
      {part}
    </Fragment>
  ));
