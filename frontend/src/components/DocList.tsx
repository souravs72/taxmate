/**
 * Meta-driven DocType list matching Desk defaults:
 * in_list_view columns, in_standard_filter filters, click-sort, pagination,
 * local column picker. API: taxmate.api.list_view.list_view_spec + resource.get_list.
 */
import { useCallback, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { useDocList } from "../lib/resource";
import { useFilteredCount, useListParams, type FilterTuple } from "../lib/list";
import { searchOrFilters, useListViewSpec, type ListColumn } from "../lib/listMeta";
import { useDraftDelete } from "../lib/useDraftDelete";
import { useSession } from "../lib/session";
import { canWrite } from "../lib/roles";
import { date, money, pct, qty } from "../lib/format";
import { t, tStatus } from "../i18n/strings";
import { Card, PageHead, Pill } from "./ui";
import { DataTable, ListFooter, type Column } from "./DataTable";
import { FilterBar, LinkFilter, SearchFilter, SelectFilter } from "./filters";
import { ColumnPicker } from "./ColumnPicker";
import BulkDraftBar from "./BulkDraftBar";
import { IfCanWrite } from "./RoleGate";

const PAGE = 20;

export type DocListProps = {
  doctype: string;
  /** Path prefix without trailing slash, e.g. `/customers`. */
  routeBase: string;
  title: string;
  newLabel?: string;
  emptyLabel?: string;
  searchPlaceholder?: string;
  /** Override auto draft/all delete mode. */
  deleteMode?: "draft" | "all";
  /** Hide the New button (registers that must be created from a source doc). */
  hideNew?: boolean;
};

type Row = { name: string; docstatus?: number; status?: string; [key: string]: unknown };

function statusClass(status?: string): string {
  if (!status) return "p-flat";
  if (status === "Draft" || status === "Open" || status === "To Deliver and Bill") return "p-open";
  if (status === "Paid" || status === "Completed" || status === "Closed" || status === "Submitted") return "p-done";
  if (status === "Cancelled" || status === "Overdue" || status === "Unpaid") return "p-cxl";
  return "p-flat";
}

function formatCell(col: ListColumn, row: Row): ReactNode {
  const raw = row[col.fieldname];
  if (raw == null || raw === "") return "—";
  if (col.fieldname === "status" || (col.fieldtype === "Select" && col.fieldname.toLowerCase().includes("status"))) {
    return <Pill cls={statusClass(String(raw))}>{tStatus(String(raw))}</Pill>;
  }
  switch (col.fieldtype) {
    case "Currency":
      return money(raw as number);
    case "Float":
      return qty(raw as number);
    case "Percent":
      return pct(raw as number);
    case "Int":
    case "Long Int":
      return String(Math.round(Number(raw)));
    case "Date":
    case "Datetime":
      return date(String(raw));
    case "Check":
      return Number(raw) ? t("list.yes") : t("list.no");
    case "Link":
    case "Data":
    case "Small Text":
    case "Text":
    default:
      return String(raw);
  }
}

function numericClass(fieldtype: string): string | undefined {
  return ["Currency", "Float", "Int", "Long Int", "Percent"].includes(fieldtype) ? "n" : undefined;
}

function roleFor(col: ListColumn, titleField?: string | null): Column<Row>["role"] {
  if (col.fieldname === titleField || col.fieldname === "name") return "title";
  if (col.fieldname === "status") return "status";
  if (col.fieldtype === "Currency") return "amount";
  if (col.fieldtype === "Date" || col.fieldtype === "Datetime") return "meta";
  return undefined;
}

export function DocList({
  doctype,
  routeBase,
  title,
  newLabel,
  emptyLabel,
  searchPlaceholder,
  deleteMode,
  hideNew,
}: DocListProps) {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, setMany, page, setPage, start } = useListParams(PAGE);
  const { spec, visibleColumns, isLoading: metaLoading, error: metaError, setVisibleFieldnames } =
    useListViewSpec(doctype);

  const q = get("q");
  const sortField = get("sort") || spec?.sort_field || "modified";
  const sortOrder = (get("order") || spec?.sort_order || "desc") as "asc" | "desc";

  // Standard-filter values are keyed f_<fieldname> in the URL.
  const filterKey = spec
    ? spec.standard_filters.map((sf) => `${sf.fieldname}=${get(`f_${sf.fieldname}`)}`).join("&")
    : "";
  const filtersStable = useMemo(() => {
    const f: FilterTuple[] = [];
    if (!spec) return f;
    for (const sf of spec.standard_filters) {
      const v = get(`f_${sf.fieldname}`);
      if (!v) continue;
      if (sf.fieldtype === "Data" || sf.fieldtype === "Small Text") {
        f.push([sf.fieldname, "like", `%${v}%`]);
      } else if (sf.fieldtype === "Check") {
        f.push([sf.fieldname, "=", Number(v)]);
      } else {
        f.push([sf.fieldname, "=", v]);
      }
    }
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, filterKey]);

  const orFilters = useMemo(
    () => (spec ? searchOrFilters(spec, q) : []),
    [spec, q],
  );

  const fetchFields = useMemo(() => {
    if (!spec) return ["name"];
    const set = new Set(spec.fields);
    for (const c of visibleColumns) set.add(c.fieldname);
    set.add(sortField);
    return [...set];
  }, [spec, visibleColumns, sortField]);

  const list = useDocList<Row>(
    doctype,
    {
      fields: fetchFields,
      filters: filtersStable as unknown as Filter<Row>[],
      orFilters: orFilters.length ? (orFilters as unknown as Filter<Row>[]) : undefined,
      orderBy: { field: sortField, order: sortOrder },
      limit: PAGE,
      limit_start: start,
    },
    spec ? undefined : null,
  );
  const { total } = useFilteredCount(
    doctype,
    filtersStable,
    orFilters.length ? orFilters : undefined,
    !!spec,
  );

  const rows = list.data ?? [];
  const writable = canWrite(session);
  const mode = deleteMode ?? (spec?.is_submittable ? "draft" : "all");
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype,
    onDone: refreshList,
    enabled: writable,
    mode,
    clearDeps: [q, page, filterKey, sortField, sortOrder],
  });

  const onSort = useCallback((field: string) => {
    if (field === sortField) {
      setMany({ sort: field, order: sortOrder === "asc" ? "desc" : "asc" });
    } else {
      setMany({ sort: field, order: "asc" });
    }
  }, [sortField, sortOrder, setMany]);

  const locked = useMemo(() => {
    const out = ["name"];
    if (spec?.title_field) out.unshift(spec.title_field);
    return out;
  }, [spec]);

  const columns: Column<Row>[] = useMemo(
    () => visibleColumns.map((c) => ({
      key: c.fieldname,
      header: c.label,
      className: numericClass(c.fieldtype),
      sortable: true,
      role: roleFor(c, spec?.title_field),
      cell: (row) => formatCell(c, row),
    })),
    [visibleColumns, spec],
  );

  const standardFilterControls = useMemo(() => {
    if (!spec) return null;
    return spec.standard_filters.map((sf) => {
      const key = `f_${sf.fieldname}`;
      const value = get(key);
      const label = sf.label || sf.fieldname;
      if (sf.fieldtype === "Link" && sf.options) {
        return (
          <LinkFilter
            key={sf.fieldname}
            doctype={sf.options}
            value={value}
            onChange={(v) => set(key, v)}
            placeholder={label}
          />
        );
      }
      if (sf.fieldtype === "Select" && sf.options) {
        const opts = String(sf.options).split("\n").filter(Boolean).map((o) => ({
          value: o, label: tStatus(o) !== o ? tStatus(o) : o,
        }));
        return (
          <SelectFilter
            key={sf.fieldname}
            value={value}
            onChange={(v) => set(key, v)}
            allLabel={label}
            options={opts}
            label={label}
          />
        );
      }
      if (sf.fieldtype === "Check") {
        return (
          <SelectFilter
            key={sf.fieldname}
            value={value}
            onChange={(v) => set(key, v)}
            allLabel={label}
            options={[
              { value: "1", label: t("list.yes") },
              { value: "0", label: t("list.no") },
            ]}
            label={label}
          />
        );
      }
      if (sf.fieldtype === "Date") {
        return (
          <input
            key={sf.fieldname}
            className="ctl"
            type="date"
            value={value}
            aria-label={label}
            onChange={(e) => set(key, e.target.value)}
          />
        );
      }
      return (
        <input
          key={sf.fieldname}
          className="ctl"
          type="search"
          value={value}
          placeholder={label}
          aria-label={label}
          onChange={(e) => set(key, e.target.value)}
        />
      );
    });
  }, [spec, get, set]);

  const loading = metaLoading || (!!spec && list.isLoading);
  const error = metaError || list.error;

  return (
    <>
      <PageHead
        title={title}
        actions={
          !hideNew ? (
            <IfCanWrite>
              <button className="btn" type="button" onClick={() => nav(`${routeBase}/new`)}>
                {newLabel ?? t("list.new")}
              </button>
            </IfCanWrite>
          ) : undefined
        }
      />
      <Card bodyClass={null as unknown as string}>
        <div className="list-toolbar">
          <FilterBar>
            <SearchFilter
              value={q}
              onChange={(v) => set("q", v)}
              placeholder={searchPlaceholder ?? t("list.search")}
            />
            {standardFilterControls}
          </FilterBar>
          {spec && (
            <ColumnPicker
              all={spec.columns}
              visible={visibleColumns.map((c) => c.fieldname)}
              locked={locked}
              onChange={setVisibleFieldnames}
            />
          )}
        </div>

        <BulkDraftBar drafts={draftDelete} />

        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`${routeBase}/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: loading, error, onRetry: () => { void list.mutate(); } }}
          emptyLabel={emptyLabel ?? t("list.emptyGeneric")}
          columns={columns}
          selection={draftDelete.selection(rows)}
          sort={{ field: sortField, order: sortOrder, onChange: onSort }}
        />

        <ListFooter shown={rows.length} total={total} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}

export default DocList;
