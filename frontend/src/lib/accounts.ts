/**
 * Account LinkField filter helpers.
 *
 * Centralises filter arrays so JournalEntryForm, PaymentForm and any future
 * account pickers all agree on what constitutes a "postable" account.
 *
 * Callers: JournalEntryForm.tsx, PaymentForm.tsx, AccountForm.tsx
 */

/** Filters for a leaf (non-group) account that is not disabled, scoped to one company. */
export function leafAccountFilters(company: string): [string, string, string | number][] {
  return [
    ["company", "=", company],
    ["is_group", "=", 0],
    ["disabled", "=", 0],
  ];
}

/** Filters for group accounts (parents) scoped to a company. */
export function groupAccountFilters(company: string): [string, string, string | number][] {
  return [
    ["company", "=", company],
    ["is_group", "=", 1],
    ["disabled", "=", 0],
  ];
}

/** Filters for leaf accounts of a specific account_type. */
export function leafByTypeFilters(
  company: string,
  accountType: string,
): [string, string, string | number][] {
  return [...leafAccountFilters(company), ["account_type", "=", accountType]];
}

/** True when the account_type requires a party (Customer / Supplier). */
export function requiresParty(accountType: string | undefined): boolean {
  return accountType === "Receivable" || accountType === "Payable";
}

/** Party type implied by account type. */
export function impliedPartyType(accountType: string | undefined): string {
  if (accountType === "Receivable") return "Customer";
  if (accountType === "Payable") return "Supplier";
  return "";
}
