/**
 * Shared create/edit state for Desk-layout forms.
 * Writes go through taxmate.api.resource.insert / save.
 */
import { useCallback, useEffect, useState } from "react";

import { useDoc, useInsert, useSave } from "./resource";

const SKIP = new Set([
  "doctype",
  "owner",
  "creation",
  "modified",
  "modified_by",
  "idx",
  "lft",
  "rgt",
  "__unsaved",
]);

function stripRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SKIP.has(k) || k.startsWith("_") || k === "parent" || k === "parentfield" || k === "parenttype") continue;
    out[k] = v;
  }
  return out;
}

function rowHasData(row: Record<string, unknown>): boolean {
  if (typeof row.name === "string" && row.name) return true;
  return Object.entries(row).some(([k, v]) => {
    if (k === "name" || k === "doctype" || k === "docstatus") return false;
    if (v == null || v === "") return false;
    return true;
  });
}

export function deskPayload(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (SKIP.has(k) || k.startsWith("_")) continue;
    if (Array.isArray(v)) {
      out[k] = (v as Record<string, unknown>[]).map(stripRow).filter(rowHasData);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function useDeskForm(doctype: string, name: string | undefined) {
  const isNew = !name || name === "new";
  const existing = useDoc<Record<string, unknown>>(
    doctype,
    isNew ? undefined : name,
    isNew ? null : name,
    { isPaused: () => isNew },
  );
  const create = useInsert();
  const update = useSave();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    if (!existing.data) return;
    setValues({ ...existing.data });
  }, [existing.data]);

  const setField = useCallback((field: string, value: unknown) => {
    setValues((prev) => (prev[field] === value ? prev : { ...prev, [field]: value }));
  }, []);

  const seed = useCallback((patch: Record<string, unknown>) => {
    setValues((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [k, v] of Object.entries(patch)) {
        if ((next[k] == null || next[k] === "") && v != null && v !== "") {
          next[k] = v;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  async function save(): Promise<Record<string, unknown>> {
    setBusy(true);
    setSaveError(null);
    try {
      const payload = deskPayload(values);
      const doc = isNew
        ? await create.createDoc(doctype, payload)
        : await update.updateDoc(doctype, name as string, payload);
      return doc;
    } catch (err) {
      setSaveError(err);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  return {
    isNew,
    existing,
    values,
    setField,
    seed,
    save,
    busy,
    saveError,
    setSaveError,
    setValues,
  };
}
