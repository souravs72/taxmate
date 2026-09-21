/**
 * Sidebar entries for shipped SPA routes only.
 * Accounting groups are added when those screens exist
 * (see tasks/plan.md). Do not point at placeholders.
 */
export type NavEntry =
  | { type: "section"; key: string }
  | { type: "link"; to: string; key: string };

export type NavLinkItem = { to: string; key: string };
export type NavGroup = { key: string; links: NavLinkItem[] };

export function groupedNav(entries: NavEntry[]): { top: NavLinkItem[]; groups: NavGroup[] } {
  const top: NavLinkItem[] = [];
  const groups: NavGroup[] = [];
  let current: NavGroup | null = null;
  for (const n of entries) {
    if (n.type === "section") {
      current = { key: n.key, links: [] };
      groups.push(current);
      continue;
    }
    if (!current) {
      top.push({ to: n.to, key: n.key });
      continue;
    }
    current.links.push({ to: n.to, key: n.key });
  }
  return { top, groups: groups.filter((g) => g.links.length > 0) };
}

export function groupForPath(groups: NavGroup[], path: string): string | null {
  for (const group of groups) {
    for (const link of group.links) {
      if (path === link.to || (link.to !== "/" && path.startsWith(`${link.to}/`))) {
        return group.key;
      }
    }
  }
  return null;
}

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
  { type: "link", to: "/purchase-orders", key: "nav.purchaseOrders" },
  { type: "link", to: "/purchase-receipts", key: "nav.purchaseReceipts" },
  { type: "link", to: "/incoming-invoices", key: "nav.incomingInvoices" },
  { type: "link", to: "/purchase-invoices", key: "nav.purchaseInvoices" },
  { type: "link", to: "/payables", key: "nav.payables" },
  { type: "section", key: "nav.accounting" },
  { type: "link", to: "/journals", key: "nav.journals" },
  { type: "link", to: "/accounts", key: "nav.accounts" },
  { type: "link", to: "/reports", key: "nav.reports" },
  { type: "section", key: "nav.masters" },
  { type: "link", to: "/catalogue/items", key: "nav.items" },
  { type: "link", to: "/warehouses", key: "nav.warehouses" },
  { type: "link", to: "/tax-templates", key: "nav.taxTemplates" },
  { type: "section", key: "nav.compliance" },
  { type: "link", to: "/vat-201", key: "nav.vat201" },
  { type: "link", to: "/ct-filings", key: "nav.ct" },
  { type: "link", to: "/esr", key: "nav.esr" },
  { type: "link", to: "/ubo", key: "nav.ubo" },
  { type: "link", to: "/late-filings", key: "nav.lateFilings" },
  { type: "link", to: "/e-invoice-log", key: "nav.eInvoiceLog" },
  { type: "link", to: "/tax-settings", key: "nav.taxSettings" },
  { type: "section", key: "nav.company" },
  { type: "link", to: "/team", key: "nav.team" },
];
