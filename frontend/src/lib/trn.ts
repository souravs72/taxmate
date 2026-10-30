/**
 * UAE TRN format check for the Customer/Supplier SPA forms.
 * Importers: CustomerForm. Server twin: taxmate.uae.validation.is_valid_uae_trn.
 * Schema: 15 digits, starts with 1, ends with 03 (IBR-132-AE).
 */
const TRN_RE = /^1\d{12}03$/;

export function normalizeTrn(trn: string | undefined | null): string {
  return (trn || "").replace(/\s+/g, "").trim();
}

export function isValidUaeTrn(trn: string | undefined | null): boolean {
  const cleaned = normalizeTrn(trn);
  if (!cleaned) return false;
  return TRN_RE.test(cleaned);
}
