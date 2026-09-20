/**
 * TaxMate SPA root router.
 * Importers: frontend entry (main.tsx). Callers: browser at /taxmate.
 * Routes: /orders (Sales Order), /customers, /invoices, /payments, /receivables.
 * User: "I can't see /orders (Sales Order in the frontend)." + revert sidebar design;
 * search should navigate to /taxmate endpoints only, not desk.
 */
import { Navigate, Route, Routes } from "react-router-dom";
import { useFrappeAuth } from "frappe-react-sdk";

import AppShell from "./components/AppShell";
import { ErrorBox, Loading } from "./components/ui";
import { hasCsrfToken } from "./lib/frappe";
import { SessionProvider } from "./lib/session";
import SalesOrderList from "./screens/sales-order/SalesOrderList";
import SalesOrderDetail from "./screens/sales-order/SalesOrderDetail";
import SalesOrderCreate from "./screens/sales-order/SalesOrderCreate";
import SalesHub from "./screens/sales/SalesHub";
import CustomerList from "./screens/customer/CustomerList";
import CustomerForm from "./screens/customer/CustomerForm";
import InvoiceList from "./screens/invoice/InvoiceList";
import InvoiceForm from "./screens/invoice/InvoiceForm";
import InvoiceDetail from "./screens/invoice/InvoiceDetail";
import CreditNoteForm from "./screens/invoice/CreditNoteForm";
import PaymentList from "./screens/payment/PaymentList";
import PaymentForm from "./screens/payment/PaymentForm";
import PaymentDetail from "./screens/payment/PaymentDetail";
import Receivables from "./screens/receivables/Receivables";
import ItemList from "./screens/item/ItemList";
import ItemForm from "./screens/item/ItemForm";

export default function App() {
  const { currentUser, isLoading, error } = useFrappeAuth();

  if (isLoading) return <Loading />;

  /* Not signed in: hand off to Frappe's own login and come back here.
     Authentication and authorisation stay with Frappe — this app never
     collects a password. */
  if (error || !currentUser || currentUser === "Guest") {
    const back = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?redirect-to=${back}`;
    return <Loading />;
  }

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
          <Route path="/" element={<Navigate to="/orders" replace />} />
          <Route path="/orders" element={<SalesOrderList />} />
          <Route path="/orders/new" element={<SalesOrderCreate />} />
          <Route path="/orders/:name" element={<SalesOrderDetail />} />
          <Route path="/customers" element={<CustomerList />} />
          <Route path="/customers/:name" element={<CustomerForm />} />
          <Route path="/invoices" element={<InvoiceList />} />
          <Route path="/invoices/new" element={<InvoiceForm />} />
          <Route path="/invoices/:name/return" element={<CreditNoteForm />} />
          {/* A submitted invoice is a tax document, so the default view is
              read-only; /edit is reachable only while it is a draft. */}
          <Route path="/invoices/:name/edit" element={<InvoiceForm />} />
          <Route path="/invoices/:name" element={<InvoiceDetail />} />
          <Route path="/payments" element={<PaymentList />} />
          <Route path="/payments/new" element={<PaymentForm />} />
          {/* A submitted payment has posted to the ledger — read-only. */}
          <Route path="/payments/:name/edit" element={<PaymentForm />} />
          <Route path="/payments/:name" element={<PaymentDetail />} />
          <Route path="/receivables" element={<Receivables />} />
          <Route path="/catalogue/items" element={<ItemList />} />
          <Route path="/catalogue/items/:name" element={<ItemForm />} />
          {/* Legacy /sales aliases from earlier WIP */}
          <Route path="/sales" element={<SalesHub />} />
          <Route path="/sales/customers" element={<Navigate to="/customers" replace />} />
          <Route path="/sales/invoices" element={<Navigate to="/invoices" replace />} />
          <Route path="/sales/receivables" element={<Navigate to="/receivables" replace />} />
          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Routes>
      </AppShell>
    </SessionProvider>
  );
}
