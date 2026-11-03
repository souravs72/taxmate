import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import DocHistory from "../../components/DocHistory";

type WarehouseDoc = {
  name: string;
  warehouse_name?: string;
  warehouse_type?: string;
  company?: string;
  parent_warehouse?: string;
  is_group?: number;
  disabled?: number;
  account?: string;
};

type StockItem = {
  item_code: string;
  item_name: string;
  item_group?: string;
  stock_uom?: string;
  actual_qty: number;
  valuation_rate: number;
  stock_value: number;
  weight_per_unit?: number;
  weight?: number;
  purity?: string;
  reorder_level?: number | null;
  is_low_stock?: boolean;
};

type LowStockItem = {
  item_code: string;
  item_name: string;
  actual_qty: number;
  reorder_level: number;
  uom: string;
};

type RecentMovement = {
  posting_date: string;
  voucher_type: string;
  voucher_no: string;
  item_code: string;
  item_name: string;
  actual_qty: number;
  qty_after_transaction: number;
};

type WarehouseStockPayload = {
  warehouse: WarehouseDoc;
  summary: {
    items_count: number;
    total_qty: number;
    total_value: number;
    total_weight: number;
    purity_breakdown: { purity: string; weight: number }[];
  };
  items: StockItem[];
  low_stock_items: LowStockItem[];
  recent_movements: RecentMovement[];
};

export default function WarehouseDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const writable = canWrite(session);
  const cur = session.currency || "AED";

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data: stockData, error, isLoading, mutate } = useFrappeGetCall<{ message: WarehouseStockPayload }>(
    METHOD.getWarehouseStock,
    { warehouse: name },
    name ? `wh-stock-${name}` : null,
  );

  const payload = stockData?.message;
  const wh = payload?.warehouse;
  const summary = payload?.summary;
  const items = payload?.items ?? [];
  const lowStock = payload?.low_stock_items ?? [];
  const movements = payload?.recent_movements ?? [];

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (it) => it.item_name.toLowerCase().includes(q) || it.item_code.toLowerCase().includes(q),
    );
  }, [items, query]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, page]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!wh) return null;

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHead
        eyebrow={
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--sub)" }}>
            <button type="button" className="btn quiet" style={{ padding: 0 }} onClick={() => nav("/warehouses")}>
              {t("nav.warehouses")}
            </button>
            <span>/</span>
            <span>{wh.warehouse_name || wh.name}</span>
          </div>
        }
        title={wh.warehouse_name || wh.name}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <DocHistory doctype={DT.warehouse} name={name} />
            {writable ? (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    nav("/stock-entries/new", {
                      state: { purpose: "Material Transfer", from_warehouse: name },
                    })
                  }
                >
                  Stock Transfer
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() =>
                    nav("/stock-entries/new", {
                      state: { purpose: "Material Receipt", to_warehouse: name },
                    })
                  }
                >
                  Stock Adjustment
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => nav(`/warehouses/${encodeURIComponent(name)}/edit`)}
                >
                  Edit warehouse
                </button>
              </>
            ) : null}
          </div>
        }
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6, fontSize: 13, color: "var(--sub)" }}>
          <span style={{ fontWeight: 500, color: "var(--text)" }}>{wh.name}</span>
          <Pill cls={wh.disabled ? "p-cxl" : "p-done"}>
            {wh.disabled ? t("coa.disabled") : t("wh.active")}
          </Pill>
          <span>{wh.company || "—"}</span>
          <span>·</span>
          <span>Parent: {wh.parent_warehouse || "—"}</span>
          <span>·</span>
          <span>Stock account: {wh.account || "—"}</span>
        </div>
      </PageHead>

      {/* 4 Stat Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 16,
          marginTop: 18,
          marginBottom: 20,
        }}
      >
        <Card bodyClass="cbody">
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--sub)", marginBottom: 6 }}>
            Items in stock
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", lineHeight: 1.1 }}>
            {summary?.items_count ?? 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 6 }}>
            distinct items
          </div>
        </Card>

        <Card bodyClass="cbody">
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--sub)", marginBottom: 6 }}>
            Total quantity
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", lineHeight: 1.1 }}>
            {summary?.total_qty ? Math.round(summary.total_qty) : 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 6 }}>
            pieces
          </div>
        </Card>

        <Card bodyClass="cbody">
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--sub)", marginBottom: 6 }}>
            Stock value
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", lineHeight: 1.1 }}>
            {cur} {money(summary?.total_value ?? 0)}
          </div>
          <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 6 }}>
            at valuation rate
          </div>
        </Card>

        <Card bodyClass="cbody">
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--sub)", marginBottom: 6 }}>
            Gold weight
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", lineHeight: 1.1 }}>
            {summary?.total_weight ? Math.round(summary.total_weight) : 0} g
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {(summary?.purity_breakdown ?? []).map((b) => (
              <span
                key={b.purity}
                style={{
                  background: "#FEF3C7",
                  color: "#92400E",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: 4,
                }}
              >
                {b.purity} · {b.weight} g
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Main 2-column layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 340px)",
          gap: 20,
          alignItems: "start",
        }}
        className="wh-grid-responsive"
      >
        {/* Left Column: Stock in this warehouse */}
        <Card bodyClass="cbody">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
              Stock in this warehouse
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, color: "var(--sub)" }}>Search</span>
              <input
                className="ctl"
                style={{ width: 190, padding: "4px 8px", fontSize: 12.5 }}
                placeholder="Item name or code"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--sub)", fontSize: 11.5, textTransform: "uppercase" }}>
                  <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>ITEM</th>
                  <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>PURITY</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>QTY</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>WEIGHT (G)</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>RATE ({cur})</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>VALUE ({cur})</th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "30px 10px", color: "var(--sub)" }}>
                      {query ? "No items match your search." : "No stock items in this warehouse."}
                    </td>
                  </tr>
                ) : (
                  pagedItems.map((it) => (
                    <tr
                      key={it.item_code}
                      style={{ borderBottom: "1px solid var(--border)", height: 48 }}
                    >
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{it.item_name}</span>
                          {it.is_low_stock && (
                            <span
                              style={{
                                background: "#FFEDD5",
                                color: "#9A3412",
                                fontSize: 10.5,
                                fontWeight: 600,
                                padding: "1px 6px",
                                borderRadius: 4,
                                whiteSpace: "nowrap",
                              }}
                            >
                              Low stock
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--sub)" }}>
                          {it.item_code}
                        </div>
                      </td>
                      <td style={{ padding: "8px 10px", color: "var(--text)", fontSize: 12.5 }}>
                        {it.purity || "—"}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text)" }}>
                        {it.actual_qty}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text)" }}>
                        {it.weight ? Math.round(it.weight) : "—"}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text)" }}>
                        {money(it.valuation_rate)}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text)" }}>
                        {money(it.stock_value)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 16,
              paddingTop: 12,
              borderTop: "1px solid var(--border)",
              fontSize: 12.5,
              color: "var(--sub)",
            }}
          >
            <div>
              Showing {filteredItems.length ? (page - 1) * PAGE_SIZE + 1 : 0} to{" "}
              {Math.min(page * PAGE_SIZE, filteredItems.length)} of {filteredItems.length} items · 25 per page
            </div>
            <button
              type="button"
              className="btn quiet"
              style={{ color: "var(--brand)", fontSize: 12.5, fontWeight: 500, padding: 0 }}
              onClick={() => nav(`/reports/Stock%20Balance?warehouse=${encodeURIComponent(name)}`)}
            >
              Open full Stock Balance report
            </button>
          </div>
        </Card>

        {/* Right Column: Low Stock + Recent Movements */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Low Stock Card */}
          <Card title="Low stock" bodyClass="cbody">
            {lowStock.length === 0 ? (
              <p style={{ margin: "6px 0", fontSize: 12.5, color: "var(--sub)" }}>
                No items below reorder level.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {lowStock.map((row) => (
                  <div
                    key={row.item_code}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      background: "rgba(254, 243, 199, 0.45)",
                      borderRadius: 8,
                      border: "1px solid rgba(251, 191, 36, 0.3)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                        {row.item_name}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 2 }}>
                        Reorder level {row.reorder_level}
                      </div>
                    </div>
                    <div
                      style={{
                        background: "#FFEDD5",
                        color: "#9A3412",
                        fontWeight: 700,
                        fontSize: 15,
                        minWidth: 28,
                        height: 28,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 6,
                        padding: "0 8px",
                      }}
                    >
                      {row.actual_qty}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Recent movements Card */}
          <Card title="Recent movements" bodyClass="cbody">
            {movements.length === 0 ? (
              <p style={{ margin: "6px 0", fontSize: 12.5, color: "var(--sub)" }}>
                No recent stock movements recorded.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {movements.map((m, idx) => {
                  const isPositive = m.actual_qty > 0;
                  return (
                    <div
                      key={`${m.voucher_no}-${m.item_code}-${idx}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingBottom: 8,
                        borderBottom: idx < movements.length - 1 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      <div style={{ minWidth: 0, paddingRight: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                          {m.voucher_type}
                        </div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "var(--sub)",
                            marginTop: 2,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {date(m.posting_date)} · {m.item_name}
                        </div>
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          color: isPositive ? "#16A34A" : "#DC2626",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isPositive ? `+${m.actual_qty}` : m.actual_qty}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <button
                type="button"
                className="btn quiet"
                style={{ color: "var(--brand)", fontSize: 12.5, fontWeight: 500, padding: 0 }}
                onClick={() => nav(`/reports/Stock%20Ledger?warehouse=${encodeURIComponent(name)}`)}
              >
                Open Stock Ledger
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
