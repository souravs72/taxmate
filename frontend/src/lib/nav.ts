/**
 * Sidebar entries for shipped SPA routes only.
 * Accounting groups are added when those screens exist
 * (see tasks/plan.md). Do not point at placeholders.
 */
export type NavEntry =
  | { type: "section"; key: string }
  | { type: "link"; to: string; key: string };

export const NAV: NavEntry[] = [
  { type: "link", to: "/", key: "nav.dashboard" },
  { type: "section", key: "nav.sales" },
  { type: "link", to: "/customers", key: "nav.customers" },
  { type: "link", to: "/orders", key: "nav.salesOrders" },
  { type: "link", to: "/delivery-notes", key: "nav.deliveryNotes" },
  { type: "link", to: "/invoices", key: "nav.invoices" },
  { type: "link", to: "/payments", key: "nav.payments" },
  { type: "link", to: "/receivables", key: "nav.receivables" },
  { type: "section", key: "nav.purchase" },
  { type: "link", to: "/suppliers", key: "nav.suppliers" },
  { type: "link", to: "/purchase-invoices", key: "nav.purchaseInvoices" },
  { type: "link", to: "/payables", key: "nav.payables" },
  { type: "section", key: "nav.masters" },
  { type: "link", to: "/catalogue/items", key: "nav.items" },
  { type: "section", key: "nav.compliance" },
  { type: "link", to: "/e-invoice-log", key: "nav.eInvoiceLog" },
  { type: "link", to: "/tax-settings", key: "nav.taxSettings" },
];
