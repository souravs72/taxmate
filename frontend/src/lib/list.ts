/**
 * List-screen plumbing: URL-backed filters, and the two aggregate calls.
 *
 * Filters live in the URL rather than component state so a filtered list is
 * a link — the thing an accountant pastes into a message. Changing any filter
 * resets the page, which is the bug every hand-rolled version of this had.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "./frappe";

export type FilterTuple = [string, string, unknown];

export function useListParams(pageSize: number) {
  const [params, setParams] = useSearchParams();

  const get = useCallback((key: string, fallback = "") => params.get(key) ?? fallback, [params]);
  const page = Number(params.get("page") ?? "0") || 0;

  const set = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    // Any change but paging puts you back on page one — otherwise a narrower
    // filter leaves you on a page that no longer exists.
    if (key !== "page") next.delete("page");
    setParams(next);
  }, [params, setParams]);

  const setPage = useCallback((p: number) => set("page", p > 0 ? String(p) : ""), [set]);

  const setMany = useCallback((pairs: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(pairs)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    next.delete("page");
    setParams(next);
  }, [params, setParams]);

  return { get, set, setMany, page, setPage, pageSize, start: page * pageSize };
}

/* ── Aggregates ───────────────────────────────────────────────────────
   frappe.client.get_list is whitelisted and its signature accepts dict
   fields, which DatabaseQuery turns into SQL functions — the same shape
   Frappe's own get_group_by_count uses. So counts and sums need no custom
   endpoint, and permissions still apply (it is get_list, not get_all).   */

export type AggField = Record<string, string> | string;

/**
 * One grouped aggregate call. Returns a row per group, with whatever
 * aliases the caller asked for plus `name` for the group key.
 */
export function useGroupedAggregate<T extends { name?: string }>(
  doctype: string,
  opts: {
    fields: AggField[];
    filters: FilterTuple[];
    orFilters?: FilterTuple[];
    groupBy: string;
    enabled?: boolean;
  },
) {
  const key = useMemo(
    () => `agg-${doctype}-${opts.groupBy}-${JSON.stringify(opts.filters)}-${JSON.stringify(opts.orFilters ?? [])}`,
    [doctype, opts.groupBy, opts.filters, opts.orFilters],
  );
  const call = useFrappeGetCall<{ message: T[] }>(
    METHOD.getList,
    {
      doctype,
      fields: JSON.stringify(opts.fields),
      filters: JSON.stringify(opts.filters),
      ...(opts.orFilters?.length ? { or_filters: JSON.stringify(opts.orFilters) } : {}),
      group_by: opts.groupBy,
      limit_page_length: 0,
    },
    opts.enabled === false ? null : key,
  );
  return {
    rows: call.data?.message ?? [],
    ready: !!call.data,
    isLoading: call.isLoading,
    error: call.error,
    mutate: call.mutate,
  };
}

/** Pick one group's row out of an aggregate result. */
export function groupRow<T extends { name?: string }>(rows: T[], name: string): T | undefined {
  return rows.find((r) => String(r.name) === name);
}

/**
 * Row count for the current filters.
 *
 * The SDK's own count hook takes no or_filters, and the invoice list's
 * derived-Overdue filter needs one. frappe.desk.reportview.get_count runs the
 * same DatabaseQuery the list does, permissions included.
 */
export function useFilteredCount(doctype: string, filters: FilterTuple[], orFilters?: FilterTuple[]) {
  const call = useFrappeGetCall<{ message: number }>(
    METHOD.getCount,
    {
      doctype,
      filters: JSON.stringify(filters),
      or_filters: JSON.stringify(orFilters ?? []),
    },
    `count-${doctype}-${JSON.stringify(filters)}-${JSON.stringify(orFilters ?? [])}`,
  );
  return { total: call.data?.message ?? 0, error: call.error };
}
