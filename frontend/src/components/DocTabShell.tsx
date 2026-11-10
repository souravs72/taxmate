/**
 * Desk form shell: sticky tabs + form page for every sidebar DocType.
 * Callers: detail/form screens across the SPA rail.
 * API: useDocLayout + DeskTabPanel + ConnectionsPanel.
 *
 * Default Details body is the Desk layout. `extras` / `after` are dashboard strips.
 * `editDetails` screens still pass their custom form as children (legacy until converted).
 * Without editDetails, children are alerts only (ErrorBox).
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
  /** Legacy custom Details body (children or details). */
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
  const legacyBody = details ?? (editDetails ? children : null);
  const legacyCustom = editDetails && isDetails && legacyBody != null && !onChange;
  const alerts = !editDetails ? children : null;

  if (isLoading && !tabs.length) return <Loading />;

  return (
    <div className="tm-form std-form-layout">
      <DocTabs tabs={tabs} active={active} onChange={setActive} />
      <div className="tm-form-tab-content">
        {alerts ? <div className="tm-form-alerts">{alerts}</div> : null}
        {isConnections ? (
          <ConnectionsPanel doctype={doctype} name={name} />
        ) : legacyCustom ? (
          <div className="tm-form-edit-body">{legacyBody}</div>
        ) : activeTab ? (
          <>
            {extras && isDetails ? <div className="tm-form-dashboard">{extras}</div> : null}
            <DeskTabPanel tab={activeTab} doc={doc} onChange={onChange} disabled={disabled} />
            {after && isDetails ? <div className="tm-form-dashboard after">{after}</div> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
