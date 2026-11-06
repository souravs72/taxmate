/**
 * Desk form shell: sticky tabs + form page for every sidebar DocType.
 * Callers: SalesOrderDetail and other detail/form screens.
 * API: useDocLayout + DeskTabPanel + ConnectionsPanel.
 * View mode always uses Desk layout. editDetails keeps custom Details form body.
 * User: keep the design of documents, tabs, and fields similar to frappe/erpnext.
 */
import type { ReactNode } from "react";

import { useDocLayout } from "../lib/docLayout";
import DocTabs from "./DocTabs";
import ConnectionsPanel from "./ConnectionsPanel";
import DeskTabPanel from "./DeskTabPanel";
import { Loading } from "./ui";

type Props = {
  doctype: string;
  name: string;
  doc?: Record<string, unknown> | null;
  extras?: ReactNode;
  editDetails?: boolean;
  details?: ReactNode;
  children?: any;
};

export default function DocTabShell({
  doctype,
  name,
  doc,
  extras,
  editDetails = false,
  details,
  children,
}: Props) {
  const { tabs, active, setActive, activeTab, isConnections, isDetails, isLoading } =
    useDocLayout(doctype);
  const formBody = details ?? children;

  if (isLoading && !tabs.length) return <Loading />;

  return (
    <div className="tm-form std-form-layout">
      <DocTabs tabs={tabs} active={active} onChange={setActive} />
      <div className="tm-form-tab-content">
        {isConnections ? (
          <ConnectionsPanel doctype={doctype} name={name} />
        ) : isDetails && editDetails && formBody != null ? (
          <>
            {extras}
            <div className="tm-form-edit-body">{formBody}</div>
          </>
        ) : activeTab ? (
          <>
            {isDetails ? extras : null}
            <DeskTabPanel tab={activeTab} doc={doc} />
          </>
        ) : null}
      </div>
    </div>
  );
}
