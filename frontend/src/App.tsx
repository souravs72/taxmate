/**
 * TaxMate SPA root router.
 * Importers: frontend entry (main.tsx). Callers: browser at /taxmate.
 * Routes: /orders (Sales Order), /customers, /suppliers, /invoices, /payments, /receivables.
 * User: "I can't see /orders (Sales Order in the frontend)." + revert sidebar design;
 * search should navigate to /taxmate endpoints only, not desk.
 */
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useFrappeAuth } from "frappe-react-sdk";

import AppShell from "./components/AppShell";
import { ErrorBox, Loading } from "./components/ui";
import { hasCsrfToken } from "./lib/frappe";
import { SessionProvider } from "./lib/session";
import SalesOrderList from "./screens/sales-order/SalesOrderList";
import SalesOrderDetail from "./screens/sales-order/SalesOrderDetail";
import SalesOrderCreate from "./screens/sales-order/SalesOrderCreate";
import Dashboard from "./screens/dashboard/Dashboard";
import SalesHub from "./screens/sales/SalesHub";
import CustomerList from "./screens/customer/CustomerList";
import CustomerForm from "./screens/customer/CustomerForm";
import SupplierList from "./screens/supplier/SupplierList";
import SupplierForm from "./screens/supplier/SupplierForm";
import InvoiceList from "./screens/invoice/InvoiceList";
import InvoiceForm from "./screens/invoice/InvoiceForm";
import InvoiceDetail from "./screens/invoice/InvoiceDetail";
import CreditNoteForm from "./screens/invoice/CreditNoteForm";
import PaymentList from "./screens/payment/PaymentList";
import PaymentForm from "./screens/payment/PaymentForm";
import PaymentDetail from "./screens/payment/PaymentDetail";
import Receivables from "./screens/receivables/Receivables";
import Payables from "./screens/payables/Payables";
import ItemList from "./screens/item/ItemList";
import ItemForm from "./screens/item/ItemForm";
import DeliveryNoteList from "./screens/delivery-note/DeliveryNoteList";
import DeliveryNoteDetail from "./screens/delivery-note/DeliveryNoteDetail";
import PurchaseInvoiceList from "./screens/purchase-invoice/PurchaseInvoiceList";
import PurchaseInvoiceForm from "./screens/purchase-invoice/PurchaseInvoiceForm";
import PurchaseInvoiceDetail from "./screens/purchase-invoice/PurchaseInvoiceDetail";
import IncomingInvoiceList from "./screens/incoming-invoice/IncomingInvoiceList";
import IncomingInvoiceDetail from "./screens/incoming-invoice/IncomingInvoiceDetail";
import PurchaseOrderList from "./screens/purchase-order/PurchaseOrderList";
import PurchaseOrderDetail from "./screens/purchase-order/PurchaseOrderDetail";
import PurchaseReceiptList from "./screens/purchase-receipt/PurchaseReceiptList";
import PurchaseReceiptDetail from "./screens/purchase-receipt/PurchaseReceiptDetail";
import EInvoiceLog from "./screens/compliance/EInvoiceLog";
import TaxSettings from "./screens/compliance/TaxSettings";
import NotFound from "./screens/NotFound";

export default function App() {
  const { currentUser, isLoading, error } = useFrappeAuth();
  const needsLogin = !isLoading && (!!error || !currentUser || currentUser === "Guest");

  useEffect(() => {
    if (!needsLogin) return;
    const back = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?redirect-to=${back}`;
  }, [needsLogin]);

  if (isLoading || needsLogin) return <Loading />;

  return (
    <SessionProvider>
      <AppShell>
        {!hasCsrfToken() && (
          <ErrorBox error={{ message:
            "This page was served without a CSRF token, so saving will fail. " +
            "It usually means index.html was served statically instead of rendered " +
            "by Frappe — check taxmate/www/taxmate.py and that the build copied " +
            "index.html to www/taxmate.html." }} />
        )}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<SalesOrderList />} />
          <Route path="/orders/new" element={<SalesOrderCreate />} />
          <Route path="/orders/:name" element={<SalesOrderDetail />} />
          <Route path="/delivery-notes" element={<DeliveryNoteList />} />
          <Route path="/delivery-notes/:name" element={<DeliveryNoteDetail />} />
          <Route path="/customers" element={<CustomerList />} />
          <Route path="/customers/:name" element={<CustomerForm />} />
          <Route path="/suppliers" element={<SupplierList />} />
          <Route path="/suppliers/:name" element={<SupplierForm />} />
          <Route path="/incoming-invoices" element={<IncomingInvoiceList />} />
          <Route path="/incoming-invoices/:name" element={<IncomingInvoiceDetail />} />
          <Route path="/purchase-orders" element={<PurchaseOrderList />} />
          <Route path="/purchase-orders/:name" element={<PurchaseOrderDetail />} />
          <Route path="/purchase-receipts" element={<PurchaseReceiptList />} />
          <Route path="/purchase-receipts/:name" element={<PurchaseReceiptDetail />} />
          <Route path="/purchase-invoices" element={<PurchaseInvoiceList />} />
          <Route path="/purchase-invoices/new" element={<PurchaseInvoiceForm />} />
          <Route path="/purchase-invoices/:name/edit" element={<PurchaseInvoiceForm />} />
          <Route path="/purchase-invoices/:name" element={<PurchaseInvoiceDetail />} />
          <Route path="/invoices" element={<InvoiceList />} />
          <Route path="/invoices/new" element={<InvoiceForm />} />
          <Route path="/invoices/:name/return" element={<CreditNoteForm />} />
          <Route path="/invoices/:name/edit" element={<InvoiceForm />} />
          <Route path="/invoices/:name" element={<InvoiceDetail />} />
          <Route path="/payments" element={<PaymentList />} />
          <Route path="/payments/new" element={<PaymentForm />} />
          <Route path="/payments/:name/edit" element={<PaymentForm />} />
          <Route path="/payments/:name" element={<PaymentDetail />} />
          <Route path="/receivables" element={<Receivables />} />
          <Route path="/payables" element={<Payables />} />
          <Route path="/catalogue/items" element={<ItemList />} />
          <Route path="/catalogue/items/:name" element={<ItemForm />} />
          <Route path="/e-invoice-log" element={<EInvoiceLog />} />
          <Route path="/tax-settings" element={<TaxSettings />} />
          <Route path="/sales" element={<SalesHub />} />
          <Route path="/sales/customers" element={<Navigate to="/customers" replace />} />
          <Route path="/sales/invoices" element={<Navigate to="/invoices" replace />} />
          <Route path="/sales/receivables" element={<Navigate to="/receivables" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppShell>
    </SessionProvider>
  );
}
