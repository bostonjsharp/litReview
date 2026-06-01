// Single source of the "polite pool" contact address shared by every external
// bibliographic API call (CrossRef, Unpaywall, arXiv). These APIs are keyless;
// they ask for a contact email so they can reach a heavy user before rate-limiting.
// This is the APP's contact address (set via UNPAYWALL_EMAIL), never an end user's.
export function contactEmail(): string {
  return process.env.UNPAYWALL_EMAIL || 'team@example.edu';
}

export function userAgent(): string {
  return `LitReview/1.0 (mailto:${contactEmail()})`;
}
