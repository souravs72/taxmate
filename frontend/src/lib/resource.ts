/**
 * Catalog CRUD hooks. Screens must not call /api/resource or Desk methods.
 * These wrap taxmate.api.resource.* listed in get_catalog().
 */
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

import { METHOD } from "./frappe";

type OrderBy = { field: string; order?: "asc" | "desc" };

type ListOpts = {
  fields?: (string | Record<string, string>)[];
  filters?: unknown;
  orFilters?: unknown;
  orderBy?: OrderBy;
  limit?: number;
  limit_start?: number;
  groupBy?: string;
};

export function useDocList<T>(doctype: string, opts: ListOpts = {}, key?: string | null) {
  const params = {
    doctype,
    fields: opts.fields ? JSON.stringify(opts.fields) : undefined,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    or_filters: opts.orFilters ? JSON.stringify(opts.orFilters) : undefined,
    order_by: opts.orderBy
      ? `${opts.orderBy.field} ${opts.orderBy.order ?? "desc"}`
      : undefined,
    limit_start: opts.limit_start,
    limit_page_length: opts.limit ?? 20,
    group_by: opts.groupBy,
  };
  const call = useFrappeGetCall<{ message: T[] }>(
    METHOD.getList,
    params,
    key === null ? null : (key ?? `list-${doctype}-${JSON.stringify(params)}`),
  );
  return {
    data: call.data?.message,
    error: call.error,
    isLoading: call.isLoading,
    mutate: call.mutate,
  };
}

export function useDoc<T>(
  doctype: string,
  name?: string,
  key?: string | null,
  opts?: { isPaused?: () => boolean },
) {
  const paused = opts?.isPaused?.() || !name;
  const call = useFrappeGetCall<{ message: T }>(
    METHOD.get,
    { doctype, name },
    paused ? null : (key ?? `get-${doctype}-${name}`),
  );
  return {
    data: call.data?.message,
    error: call.error,
    isLoading: call.isLoading,
    mutate: call.mutate,
  };
}

export function useDocCount(doctype: string, filters?: unknown, orFilters?: unknown) {
  const call = useFrappeGetCall<{ message: number }>(
    METHOD.getCount,
    {
      doctype,
      filters: filters ? JSON.stringify(filters) : undefined,
      or_filters: orFilters ? JSON.stringify(orFilters) : undefined,
    },
    `count-${doctype}-${JSON.stringify(filters ?? [])}-${JSON.stringify(orFilters ?? [])}`,
  );
  return { data: call.data?.message ?? 0, error: call.error, isLoading: call.isLoading, mutate: call.mutate };
}

export function useInsert() {
  const { call, loading, error, reset, isCompleted } = useFrappePostCall<{ message: Record<string, unknown> }>(
    METHOD.insert,
  );
  const createDoc = async (doctype: string, doc: Record<string, unknown>) => {
    const res = await call({ doc: { ...doc, doctype } });
    return res.message;
  };
  return { createDoc, loading, error, reset, isCompleted };
}

export function useSave() {
  const { call, loading, error, reset, isCompleted } = useFrappePostCall<{ message: Record<string, unknown> }>(
    METHOD.save,
  );
  const updateDoc = async (doctype: string, name: string, doc: Record<string, unknown>) => {
    const res = await call({ doc: { ...doc, doctype, name } });
    return res.message;
  };
  return { updateDoc, loading, error, reset, isCompleted };
}
