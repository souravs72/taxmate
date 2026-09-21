/**
 * Hide write buttons for Viewer.
 * Importers: CustomerList, InvoiceList, PaymentList, JournalEntryList,
 * PurchaseInvoiceList, SalesOrderList, ItemList, SupplierList, Vat201List.
 * API: taxmate.api.get_session spa_role. Schema: owner|accountant|clerk|viewer.
 * User: "Keep users and roles simplified - an accounts business may not need
 * every role. So backend could use a combination of role permissions for a
 * frontend role. And we could have 3 or 4 roles in the frontend."
 */
import { canWrite } from "../lib/roles";
import { useSession } from "../lib/session";

export function IfCanWrite({ children }: { children: React.ReactNode }) {
  const session = useSession();
  if (!canWrite(session)) return null;
  return <>{children}</>;
}
