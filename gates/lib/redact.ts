// Bitcoin addresses never reach the JSON or a printed line: each becomes `<address>`.
const PATTERNS: readonly RegExp[] = [
  /\b(bc1|tb1|bcrt1)[02-9ac-hj-np-z]{8,87}\b/g,
  /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g,
];

export function redact(text: string): string {
  let out = text;
  for (const p of PATTERNS) out = out.replace(p, '<address>');
  return out;
}
