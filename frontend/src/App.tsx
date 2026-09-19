import { Navigate, Route, Routes } from "react-router-dom";
import { useFrappeAuth } from "frappe-react-sdk";

import AppShell from "./components/AppShell";
import SalesOrderList from "./screens/sales-order/SalesOrderList";
import SalesOrderDetail from "./screens/sales-order/SalesOrderDetail";
import SalesOrderCreate from "./screens/sales-order/SalesOrderCreate";
import { ErrorBox, Loading } from "./components/ui";
import { hasCsrfToken } from "./lib/frappe";

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
        <Route path="*" element={<Navigate to="/orders" replace />} />
      </Routes>
    </AppShell>
  );
}
