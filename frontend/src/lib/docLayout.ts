/**
 * Hook + types for Desk Tab Break layout on SPA screens.
 * Callers: DocTabShell, DeskTabPanel, DocTabs.
 * API: METHOD.formLayout → taxmate.api.form_layout.get
 * Schema: tabs with sections/columns/field meta (label, fieldtype, options).
 * User: mimic erpnext like tabs and fields for all sidebar doctypes.
 */
import { useMemo, useState } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "./frappe";

export type LayoutField = {
  fieldname: string;
  label: string;
  fieldtype: string;
  options?: string | null;
  reqd?: number;
  read_only?: number;
  depends_on?: string | null;
  default?: string | null;
  is_virtual?: number;
  columns?: LayoutField[];
};

export type LayoutSection = {
  id: string;
  label: string;
  columns: LayoutField[][];
};

export type DocTab = {
  id: string;
  label: string;
  fieldname: string;
  fields: string[];
  sections?: LayoutSection[];
  is_connections?: boolean;
};

export type DocLayout = {
  doctype: string;
  tabs: DocTab[];
  has_connections: boolean;
};

export function useDocLayout(doctype: string | undefined) {
  const { data, error, isLoading } = useFrappeGetCall<{ message: DocLayout }>(
    METHOD.formLayout,
    { doctype },
    doctype ? `form-layout-${doctype}` : null,
  );
  const layout = data?.message;
  const tabs = layout?.tabs ?? [];
  const [active, setActive] = useState<string>("__details");

  const resolvedActive = useMemo(() => {
    if (tabs.some((t) => t.id === active)) return active;
    return tabs[0]?.id ?? "__details";
  }, [tabs, active]);

  const activeTab = tabs.find((t) => t.id === resolvedActive) ?? tabs[0];

  return {
    layout,
    tabs,
    active: resolvedActive,
    setActive,
    activeTab,
    isConnections: !!activeTab?.is_connections,
    isDetails: !activeTab || activeTab.id === "__details",
    error,
    isLoading,
    fieldSet: new Set(activeTab?.fields ?? []),
  };
}
