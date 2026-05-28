export function isAllowed(email: string | undefined | null, allowList: string | undefined): boolean {
  if (!email || !allowList) return false;
  const set = new Set(
    allowList
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  return set.has(email.toLowerCase());
}
