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
  { type: "link", to: "/quotations", key: "nav.quotations" },
  { type: "link", to: "/delivery-notes", key: "nav.deliveryNotes" },
  { type: "link", to: "/invoices", key: "nav.invoices" },
  { type: "link", to: "/payments", key: "nav.payments" },
  { type: "link", to: "/receivables", key: "nav.receivables" },
  { type: "link", to: "/leads", key: "nav.leads" },
  { type: "section", key: "nav.purchase" },
  { type: "link", to: "/suppliers", key: "nav.suppliers" },
  { type: "link", to: "/supplier-quotations", key: "nav.supplierQuotations" },
  { type: "link", to: "/purchase-orders", key: "nav.purchaseOrders" },
  { type: "link", to: "/purchase-receipts", key: "nav.purchaseReceipts" },
  { type: "link", to: "/incoming-invoices", key: "nav.incomingInvoices" },
  { type: "link", to: "/purchase-invoices", key: "nav.purchaseInvoices" },
  { type: "link", to: "/payables", key: "nav.payables" },
  { type: "section", key: "nav.stock" },
  { type: "link", to: "/stock-entries", key: "nav.stockEntries" },
  { type: "link", to: "/stock-reconciliations", key: "nav.stockReconciliations" },
  { type: "link", to: "/material-requests", key: "nav.materialRequests" },
  { type: "link", to: "/serial-nos", key: "nav.serialNos" },
  { type: "link", to: "/batches", key: "nav.batches" },
  { type: "link", to: "/landed-cost-vouchers", key: "nav.landedCostVouchers" },
  { type: "link", to: "/boms", key: "nav.boms" },
  { type: "link", to: "/work-orders", key: "nav.workOrders" },
  // Quotation under Sales; stock nav for SE/SR/MR. Callers: AppShell. User: Implement the plan… complete all the to-dos.
  { type: "section", key: "nav.accounting" },
  { type: "link", to: "/journals", key: "nav.journals" },
  { type: "link", to: "/bank-accounts", key: "nav.bankAccounts" },
  { type: "link", to: "/modes-of-payment", key: "nav.modesOfPayment" },
  { type: "link", to: "/bank-reconciliation", key: "nav.bankReconciliation" },
  { type: "link", to: "/fiscal-years", key: "nav.fiscalYears" },
  { type: "link", to: "/accounts", key: "nav.accounts" },
  { type: "link", to: "/reports", key: "nav.reports" },
  { type: "section", key: "nav.masters" },
  { type: "link", to: "/catalogue/items", key: "nav.items" },
  { type: "link", to: "/catalogue/item-groups", key: "nav.itemGroups" },
  { type: "link", to: "/catalogue/brands", key: "nav.brands" },
  { type: "link", to: "/catalogue/uoms", key: "nav.uoms" },
  { type: "link", to: "/warehouses", key: "nav.warehouses" },
  { type: "link", to: "/price-lists", key: "nav.priceLists" },
  { type: "link", to: "/payment-terms-templates", key: "nav.paymentTermsTemplates" },
  { type: "link", to: "/tax-templates", key: "nav.taxTemplates" },
  { type: "link", to: "/tax-categories", key: "nav.taxCategories" },
  { type: "link", to: "/item-tax-templates", key: "nav.itemTaxTemplates" },
  { type: "link", to: "/pricing-rules", key: "nav.pricingRules" },
  { type: "link", to: "/customer-groups", key: "nav.customerGroups" },
  { type: "link", to: "/supplier-groups", key: "nav.supplierGroups" },
  { type: "link", to: "/territories", key: "nav.territories" },
  { type: "link", to: "/addresses", key: "nav.addresses" },
  { type: "link", to: "/contacts", key: "nav.contacts" },
  { type: "link", to: "/terms-and-conditions", key: "nav.termsAndConditions" },
  { type: "section", key: "nav.compliance" },
  { type: "link", to: "/vat-201", key: "nav.vat201" },
  { type: "link", to: "/ct-filings", key: "nav.ct" },
  { type: "link", to: "/esr", key: "nav.esr" },
  { type: "link", to: "/ubo", key: "nav.ubo" },
  { type: "link", to: "/late-filings", key: "nav.lateFilings" },
  { type: "link", to: "/e-invoice-log", key: "nav.eInvoiceLog" },
  { type: "link", to: "/tax-settings", key: "nav.taxSettings" },
  { type: "link", to: "/uae-related-parties", key: "nav.uaeRelatedParties" },
  { type: "link", to: "/uae-vat-groups", key: "nav.uaeVatGroups" },
  { type: "link", to: "/uae-bad-debt-relief", key: "nav.uaeBadDebt" },
  { type: "link", to: "/uae-customs-declarations", key: "nav.uaeCustoms" },
  { type: "link", to: "/uae-capital-goods-adjustments", key: "nav.uaeCapitalGoods" },
  { type: "section", key: "nav.company" },
  { type: "link", to: "/team", key: "nav.team" },
];
