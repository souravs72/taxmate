/**
 * Desk form shell: sticky tabs + form page for every sidebar DocType.
 * Callers: SalesOrderDetail and other detail/form screens.
 * API: useDocLayout + DeskTabPanel + ConnectionsPanel.
 * View uses Desk layout. onChange edits the same layout. editDetails is the
 * legacy custom Details body until that screen is converted.
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
  after?: ReactNode;
  editDetails?: boolean;
  details?: ReactNode;
  children?: any;
  onChange?: (fieldname: string, value: unknown) => void;
  disabled?: boolean;
};

export default function DocTabShell({
  doctype,
  name,
  doc,
  extras,
  after,
  editDetails = false,
  details,
  children,
  onChange,
  disabled,
}: Props) {
  const { tabs, active, setActive, activeTab, isConnections, isDetails, isLoading } =
    useDocLayout(doctype);
  const formBody = details ?? children;
  const legacyCustom = editDetails && isDetails && formBody != null && !onChange;

  if (isLoading && !tabs.length) return <Loading />;

  const notice = formBody && !legacyCustom ? <div className="tm-form-extras">{formBody}</div> : null;

  return (
    <div className="tm-form std-form-layout">
      <DocTabs tabs={tabs} active={active} onChange={setActive} />
      <div className="tm-form-tab-content">
        {isConnections ? (
          <>
            {notice}
            <ConnectionsPanel doctype={doctype} name={name} />
          </>
        ) : legacyCustom ? (
          <>
            {extras}
            <div className="tm-form-edit-body">{formBody}</div>
          </>
        ) : activeTab ? (
          <>
            {extras && isDetails ? <div className="tm-form-extras">{extras}</div> : null}
            {notice}
            <DeskTabPanel tab={activeTab} doc={doc} onChange={onChange} disabled={disabled} />
            {after && isDetails ? <div className="tm-form-extras">{after}</div> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
