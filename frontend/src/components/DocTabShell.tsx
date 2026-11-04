/**
 * Wraps a detail/form body with Desk Tab Breaks + Connections.
 * Callers: SalesOrderDetail, InvoiceDetail, CustomerForm, and other DocType screens.
 * API: useDocLayout (form_layout.get) + ConnectionsPanel (connections.open_count).
 * No file I/O. Props: doctype, name, optional doc record for non-Details tab fields.
 * User: Implement the plan as specified... Don't stop until you have completed all the to-dos.
 */
import type { ReactNode } from "react";

import { useDocLayout, type DocTab } from "../lib/docLayout";
import DocTabs from "./DocTabs";
import ConnectionsPanel from "./ConnectionsPanel";
import { Card, ReadRow } from "./ui";

type Props = {
  doctype: string;
  name: string;
  // Call sites use `err && <ErrorBox/>` where err is unknown — too strict for ReactNode.
  children?: any;
  doc?: Record<string, unknown> | null;
};

export default function DocTabShell({ doctype, name, children, doc }: Props) {
  const { tabs, active, setActive, activeTab, isConnections } = useDocLayout(doctype);
  const body = children;

  return (
    <>
      <DocTabs tabs={tabs} active={active} onChange={setActive} />
      {isConnections ? (
        <ConnectionsPanel doctype={doctype} name={name} />
      ) : active === "__details" || !activeTab || activeTab.id === "__details" ? (
        body
      ) : (
        <TabFieldsCard tab={activeTab} doc={doc} fallback={body} />
      )}
    </>
  );
}

function TabFieldsCard({
  tab,
  doc,
  fallback,
}: {
  tab: DocTab;
  doc?: Record<string, unknown> | null;
  fallback: ReactNode;
}) {
  if (!doc || !tab.fields.length) return <>{fallback}</>;
  const rows = tab.fields
    .map((f) => {
      const v = doc[f];
      if (v === undefined || v === null || v === "" || Array.isArray(v)) return null;
      if (typeof v === "object") return null;
      return { k: f, v: String(v) };
    })
    .filter(Boolean) as { k: string; v: string }[];
  if (!rows.length) return <>{fallback}</>;
  return (
    <Card title={tab.label}>
      <div className="fg">
        {rows.map((r) => (
          <ReadRow key={r.k} k={r.k} v={r.v} />
        ))}
      </div>
    </Card>
  );
}
