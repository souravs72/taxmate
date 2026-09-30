/**
 * List/detail select + delete for TaxMate.
 *
 * Server: taxmate.api.resource.delete / bulk_delete.
 * - mode "draft" (vouchers): only docstatus 0 / status Draft — Frappe Desk rule.
 * - mode "all" (masters): every row on the page may be selected; server still
 *   enforces delete permission and link checks.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { METHOD } from "./frappe";
import { t } from "../i18n/strings";
import type { Selection } from "../components/DataTable";

export type Draftish = {
  name: string;
  docstatus?: number | string | null;
  status?: string | null;
};

export type DeleteMode = "draft" | "all";

type BulkPayload = {
  deleted?: string[];
  failed?: { name: string; error: string }[];
};

type BulkResult = { message?: BulkPayload };

/** Prefer docstatus; fall back to ERPNext status === "Draft". */
export function isDraftRow(row: Draftish): boolean {
  if (row.docstatus !== undefined && row.docstatus !== null && row.docstatus !== "") {
    return Number(row.docstatus) === 0;
  }
  return row.status === "Draft";
}

function confirmDelete(names: string[], mode: DeleteMode): boolean {
  if (names.length === 1) {
    const lead = mode === "draft" ? t("list.deleteConfirmOne") : t("list.deleteConfirmOneAny");
    return window.confirm(`${lead} ${names[0]}?`);
  }
  const lead = mode === "draft" ? t("list.deleteConfirmMany") : t("list.deleteConfirmManyAny");
  return window.confirm(`${lead} (${names.length})`);
}

function failMessage(failed: { name: string; error: string }[]): string {
  if (!failed.length) return "";
  const first = failed[0];
  if (failed.length === 1) return first.error;
  return `${t("list.deletePartial")} ${failed.length}: ${first.name}`;
}

export type UseDraftDeleteOpts = {
  doctype: string;
  onDone: () => void | Promise<void>;
  enabled?: boolean;
  clearDeps?: readonly unknown[];
  /**
   * "draft" — submittable vouchers (default).
   * "all" — masters / non-submittable (Customer, Supplier, Item, …).
   */
  mode?: DeleteMode;
};

export type DraftDeleteApi = {
  mode: DeleteMode;
  picked: Set<string>;
  clear: () => void;
  dismissError: () => void;
  toggle: (id: string) => void;
  toggleAll: (ids: string[], checked: boolean) => void;
  deletePicked: () => Promise<void>;
  loading: boolean;
  error: unknown;
  failNote: string | null;
  selection: <Row extends Draftish>(rows: Row[]) => Selection<Row> | undefined;
  showBar: boolean;
  deleteLabel: string;
};

export function useDraftDelete(opts: UseDraftDeleteOpts): DraftDeleteApi {
  const { doctype, onDone, enabled = true, clearDeps = [], mode = "draft" } = opts;
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [failNote, setFailNote] = useState<string | null>(null);
  const bulk = useFrappePostCall<BulkResult>(METHOD.bulkDelete);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const clear = useCallback(() => {
    setPicked(new Set());
    setFailNote(null);
  }, []);

  const dismissError = useCallback(() => setFailNote(null), []);

  const depKey = clearDeps.map((d) => String(d ?? "")).join("|");
  useEffect(() => {
    setPicked(new Set());
    setFailNote(null);
  }, [depKey]);

  const toggle = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[], checked: boolean) => {
    setPicked(checked ? new Set(ids) : new Set());
  }, []);

  const deletePicked = useCallback(async () => {
    const names = [...picked];
    if (!names.length) return;
    if (!confirmDelete(names, mode)) return;
    setFailNote(null);
    try {
      const res = await bulk.call({ doctype, names: JSON.stringify(names) });
      const payload = res?.message ?? (res as unknown as BulkPayload);
      const failed = payload?.failed ?? [];
      const deleted = payload?.deleted ?? [];
      if (failed.length) setFailNote(failMessage(failed));
      setPicked(new Set(failed.map((f) => f.name)));
      if (deleted.length) await onDoneRef.current();
    } catch {
      /* bulk.error */
    }
  }, [picked, bulk, doctype, mode]);

  const selectable = useCallback(
    (row: Draftish) => (mode === "all" ? true : isDraftRow(row)),
    [mode],
  );

  const selection = useCallback(
    <Row extends Draftish>(rows: Row[]): Selection<Row> | undefined => {
      if (!enabled) return undefined;
      const ids = rows.filter(selectable).map((r) => r.name);
      return {
        picked,
        selectable,
        label: t("list.selectAll"),
        onToggle: toggle,
        onToggleAll: (checked) => toggleAll(ids, checked),
      };
    },
    [enabled, picked, toggle, toggleAll, selectable],
  );

  const deleteLabel = mode === "draft" ? t("list.deleteDrafts") : t("list.deleteSelected");

  return {
    mode,
    picked,
    clear,
    dismissError,
    toggle,
    toggleAll,
    deletePicked,
    loading: bulk.loading,
    error: bulk.error,
    failNote,
    selection,
    showBar: enabled && picked.size > 0,
    deleteLabel,
  };
}

export type UseDeleteDraftActionOpts = {
  doctype: string;
  name: string;
  listPath: string;
  mode?: DeleteMode;
};

export function useDeleteDraftAction(opts: UseDeleteDraftActionOpts) {
  const { doctype, name, listPath, mode = "draft" } = opts;
  const nav = useNavigate();
  const del = useFrappePostCall(METHOD.delete);

  const onDelete = useCallback(() => {
    void (async () => {
      if (!confirmDelete([name], mode)) return;
      try {
        await del.call({ doctype, name });
        nav(listPath);
      } catch {
        /* del.error */
      }
    })();
  }, [del, doctype, name, listPath, nav, mode]);

  return {
    onDelete,
    loading: del.loading,
    error: del.error,
  };
}
