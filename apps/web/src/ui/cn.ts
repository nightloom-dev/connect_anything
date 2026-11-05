/** Joins class names and drops the falsy ones. Without a merge step, a class passed in adds to the defaults rather than replacing them. */
export const cn = (...parts: (string | false | null | undefined | 0)[]) => parts.filter(Boolean).join(' ');
