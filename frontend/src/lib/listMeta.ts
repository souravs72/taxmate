/**
 * Desk-like list view spec + local column preferences.
 * API: taxmate.api.list_view.list_view_spec
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "./frappe";
import type { FilterTuple } from "./list";

export type ListColumn = {
  fieldname: string;
  label: string;
  fieldtype: string;
  options?: string | null;
  width?: number | null;
};

export type ListFilterField = {
  fieldname: string;
  label: string;
  fieldtype: string;
  options?: string | null;
};

export type ListViewSpec = {
  doctype: string;
  title_field?: string | null;
  search_fields: string[];
  sort_field: string;
  sort_order: "asc" | "desc";
  image_field?: string | null;
  is_submittable: number;
  columns: ListColumn[];
  standard_filters: ListFilterField[];
  fields: string[];
};

const PREF_PREFIX = "taxmate.list.columns.v1.";

export function loadColumnPref(doctype: string): string[] | null {
  try {
    const raw = localStorage.getItem(PREF_PREFIX + doctype);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : null;
  } catch {
    return null;
  }
}

export function saveColumnPref(doctype: string, fieldnames: string[]): void {
  localStorage.setItem(PREF_PREFIX + doctype, JSON.stringify(fieldnames));
}

/** Visible columns: preference ∩ available, else all; title/name always kept. */
export function resolveVisibleColumns(spec: ListViewSpec, pref: string[] | null): ListColumn[] {
  const byName = new Map(spec.columns.map((c) => [c.fieldname, c]));
  const locked = new Set<string>();
  if (spec.title_field && byName.has(spec.title_field)) locked.add(spec.title_field);
  locked.add("name");

  if (!pref || pref.length === 0) return spec.columns;

  const ordered: ListColumn[] = [];
  const seen = new Set<string>();
  for (const fn of pref) {
    const col = byName.get(fn);
    if (col && !seen.has(fn)) {
      ordered.push(col);
      seen.add(fn);
    }
  }
  for (const fn of locked) {
    if (!seen.has(fn) && byName.has(fn)) {
      ordered.unshift(byName.get(fn)!);
      seen.add(fn);
    }
  }
  return ordered.length ? ordered : spec.columns;
}

export function searchOrFilters(spec: ListViewSpec, q: string): FilterTuple[] {
  const term = q.trim();
  if (!term) return [];
  const like = `%${term}%`;
  const fields = new Set<string>(["name", ...spec.search_fields]);
  if (spec.title_field) fields.add(spec.title_field);
  return [...fields].map((f) => [f, "like", like] as FilterTuple);
}

export function useListViewSpec(doctype: string) {
  const call = useFrappeGetCall<{ message: ListViewSpec }>(
    METHOD.listViewSpec,
    { doctype },
    `list-view-spec:${doctype}`,
  );
  const spec = call.data?.message;
  const [pref, setPref] = useState<string[] | null>(() => loadColumnPref(doctype));
  useEffect(() => { setPref(loadColumnPref(doctype)); }, [doctype]);
  const visible = useMemo(
    () => (spec ? resolveVisibleColumns(spec, pref) : []),
    [spec, pref],
  );
  const setVisibleFieldnames = useCallback((fieldnames: string[]) => {
    saveColumnPref(doctype, fieldnames);
    setPref(fieldnames);
  }, [doctype]);

  return {
    spec,
    visibleColumns: visible,
    isLoading: call.isLoading,
    error: call.error,
    mutate: call.mutate,
    setVisibleFieldnames,
  };
}
