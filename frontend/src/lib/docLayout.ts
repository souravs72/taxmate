/**
 * Hook + helpers for Desk Tab Break layout on SPA screens.
 * Callers: DocTabs consumers (detail/form screens).
 * API: METHOD.formLayout → taxmate.api.form_layout.get
 * Schema: {doctype, tabs[{id,label,fieldname,fields,is_connections?}], has_connections}
 * User: Implement the plan as specified... completed all the to-dos.
 */
import { useMemo, useState } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "./frappe";

export type DocTab = {
  id: string;
  label: string;
  fieldname: string;
  fields: string[];
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
    error,
    isLoading,
    fieldSet: new Set(activeTab?.fields ?? []),
  };
}
