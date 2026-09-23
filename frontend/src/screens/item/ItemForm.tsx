import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useDocList, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { parseNum } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import LinkField from "../../components/LinkField";

const COMMON_UOMS = ["Nos", "Unit", "Box", "Set", "Pair", "Kg", "g", "Litre", "Ltr", "Meter", "m", "Dozen", "Hour", "Day"];

type UomConvRow = {
  _key: string;
  uom: string;
  conversion_factor: number;
};

type ItemDoc = {
  name: string;
  item_code?: string;
  item_name?: string;
  item_group?: string;
  stock_uom?: string;
  brand?: string;
  is_stock_item?: number;
  is_sales_item?: number;
  is_purchase_item?: number;
  description?: string;
  valuation_method?: string;
  uae_item_type?: string;
  is_zero_rated?: number;
  is_exempt?: number;
  hs_code?: string;
  sac_code?: string;
  standard_rate?: number;
  safety_stock?: number;
  uoms?: { uom?: string; conversion_factor?: number }[];
  item_defaults?: { company?: string; default_warehouse?: string }[];
  barcodes?: { barcode?: string }[];
  reorder_levels?: { warehouse?: string; warehouse_reorder_level?: number; warehouse_reorder_qty?: number; material_request_type?: string }[];
};

export default function ItemForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";
  const existing = useDoc<ItemDoc>(DT.item, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const groups = useDocList<{ name: string }>(DT.itemGroup, {
    fields: ["name"], filters: [["is_group", "=", 0]], limit: 80,
  });
  const uoms = useDocList<{ name: string }>(DT.uom, { fields: ["name"], limit: 80 });
  const settings = useDoc<{ selling_price_list?: string }>(DT.sellingSettings, DT.sellingSettings);
  const create = useInsert();
  const update = useSave();

  /* ERPNext's own fallback when Selling Settings has no default
     (erpnext/stock/doctype/item/item.py:274) — without it, editing an item
     whose price ERPNext put on Standard Selling would refuse to save.    */
  const priceList = settings.data?.selling_price_list || (settings.data ? "Standard Selling" : undefined);

  /* The selling rate lives on Item Price, not on Item.
     On INSERT, ERPNext's Item.after_insert creates the Item Price from
     standard_rate (erpnext/stock/doctype/item/item.py:178) — so a second
     create here would collide. On UPDATE it does nothing at all, which is why
     an edited rate has to be written to the Item Price explicitly.

     The filter matches Item Price's own uniqueness key as far as this form
     models it: a customer- or supplier-specific row is a different price and
     must never be overwritten by the general rate (check_duplicates,
     erpnext/stock/doctype/item_price/item_price.py:105).                 */
  const priceReady = !isNew && !!priceList;
  const existingPrice = useDocList<{
    name: string; price_list_rate: number; uom?: string; customer?: string; supplier?: string;
  }>(
    DT.itemPrice,
    {
      fields: ["name", "price_list_rate", "uom", "customer", "supplier"],
      filters: [
        ["item_code", "=", name],
        ["price_list", "=", priceList ?? ""],
        ["selling", "=", 1],
      ],
      orderBy: { field: "modified", order: "desc" },
      limit: 20,
    },
    priceReady ? `item-price-${name}-${priceList}` : null,
  );
  /* A null-key SWR hook reports isLoading:false with data:undefined, so
     "resolved" has to be tracked explicitly — otherwise a save that lands
     before the lookup returns would create a duplicate Item Price.       */
  const priceResolved = priceReady && existingPrice.data !== undefined;

  const [form, setForm] = useState({
    item_code: "",
    item_name: "",
    item_group: "",
    stock_uom: "Nos",
    brand: "",
    is_stock_item: 0 as 0 | 1,
    is_sales_item: 1 as 0 | 1,
    is_purchase_item: 1 as 0 | 1,
    default_warehouse: "",
    description: "",
    valuation_method: "",
    uae_item_type: "Service",
    is_zero_rated: 0 as 0 | 1,
    is_exempt: 0 as 0 | 1,
    hs_code: "",
    sac_code: "",
    standard_rate: 0,
    barcode: "",
    safety_stock: 0,
    reorder_warehouse: "",
    reorder_level: 0,
    reorder_qty: 0,
  });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [uomRows, setUomRows] = useState<UomConvRow[]>([]);
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  let _uomKey = 0;
  const newUomKey = () => `u${++_uomKey}`;
  const onHand = useFrappeGetCall<{ message: { total: number; warehouses: { warehouse: string; actual_qty: number }[] } }>(
    METHOD.itemQty,
    !isNew && form.is_stock_item ? { item_code: name } : undefined,
    !isNew && form.is_stock_item ? `item-qty-${name}` : null,
  );

  /* One effect, not two.
     Item.standard_rate is only read at insert; once an Item Price exists that
     row is the real selling rate and Item.standard_rate can be stale. Two
     separate effects let a background SWR revalidation of the Item re-run the
     first one alone and quietly put the stale rate back in the field — so the
     rate is resolved here, in the same pass that loads the document.     */
  /* Only the general rate. A customer- or supplier-specific Item Price in the
     same price list is a different price and must never be overwritten with
     the item's headline rate.                                             */
  const priceRow = existingPrice.data?.find((r) => !r.customer && !r.supplier);
  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    // Prefer company-matched Item Default (ERPNext child). Callers: App /catalogue/items/:name.
    // User: Complete everything and make frontend completely comprehensive and complete
    const companyWh = (d.item_defaults ?? []).find((r) => r.company === session.company)?.default_warehouse
      || (d.item_defaults ?? [])[0]?.default_warehouse
      || "";
    setForm({
      item_code: d.item_code || d.name,
      item_name: d.item_name || "",
      item_group: d.item_group || "",
      stock_uom: d.stock_uom || "Nos",
      brand: d.brand || "",
      is_stock_item: (d.is_stock_item || 0) as 0 | 1,
      is_sales_item: ((d.is_sales_item ?? 1) || 0) as 0 | 1,
      is_purchase_item: ((d.is_purchase_item ?? 1) || 0) as 0 | 1,
      default_warehouse: companyWh,
      description: d.description || "",
      valuation_method: d.valuation_method || "",
      uae_item_type: d.uae_item_type || "Service",
      is_zero_rated: (d.is_zero_rated || 0) as 0 | 1,
      is_exempt: (d.is_exempt || 0) as 0 | 1,
      hs_code: d.hs_code || "",
      sac_code: d.sac_code || "",
      standard_rate: priceRow ? Number(priceRow.price_list_rate) || 0 : d.standard_rate || 0,
      barcode: (d.barcodes ?? [])[0]?.barcode || "",
      safety_stock: Number(d.safety_stock) || 0,
      reorder_warehouse: (d.reorder_levels ?? [])[0]?.warehouse || "",
      reorder_level: Number((d.reorder_levels ?? [])[0]?.warehouse_reorder_level) || 0,
      reorder_qty: Number((d.reorder_levels ?? [])[0]?.warehouse_reorder_qty) || 0,
    });
    // Load UOM conversions (exclude the stock UOM row which ERPNext auto-adds with factor 1)
    setUomRows(
      (d.uoms ?? [])
        .filter((r) => r.uom && r.uom !== d.stock_uom)
        .map((r) => ({
          _key: `u${Math.random()}`,
          uom: r.uom || "",
          conversion_factor: Number(r.conversion_factor) || 1,
        }))
    );
  }, [existing.data, priceRow, session.company]);

  const ready =
    !!form.item_code && !!form.item_name && !!form.item_group && !!form.stock_uom &&
    !!form.uae_item_type &&
    // On edit, hold Save until the Item Price lookup has answered.
    (isNew || priceResolved);

  async function save() {
    setBusy(true);
    setSaveError(null);
    try {
      const payload = {
        item_code: form.item_code,
        item_name: form.item_name,
        item_group: form.item_group,
        stock_uom: form.stock_uom,
        brand: form.brand || undefined,
        is_stock_item: form.is_stock_item,
        is_sales_item: form.is_sales_item,
        is_purchase_item: form.is_purchase_item,
        description: form.description || undefined,
        valuation_method: form.is_stock_item && form.valuation_method ? form.valuation_method : undefined,
        uae_item_type: form.uae_item_type,
        is_zero_rated: form.is_zero_rated,
        is_exempt: form.is_exempt,
        hs_code: form.hs_code || undefined,
        sac_code: form.sac_code || undefined,
        standard_rate: form.standard_rate,
        safety_stock: form.safety_stock || undefined,
        barcodes: form.barcode ? [{ barcode: form.barcode }] : undefined,
        reorder_levels: form.reorder_warehouse
          ? [{
              warehouse: form.reorder_warehouse,
              warehouse_reorder_level: form.reorder_level || 0,
              warehouse_reorder_qty: form.reorder_qty || 0,
              material_request_type: "Purchase",
            }]
          : undefined,
        uoms: uomRows.length > 0
          ? [
              // ERPNext expects the stock UOM row first with factor 1
              { uom: form.stock_uom, conversion_factor: 1 },
              ...uomRows.filter((r) => r.uom && r.conversion_factor > 0).map(({ _key: _k, ...r }) => r),
            ]
          : undefined,
        item_defaults: session.company
          ? [{
              company: session.company,
              default_warehouse: form.default_warehouse || undefined,
            }]
          : undefined,
      };
      const doc = isNew
        ? await create.createDoc(DT.item, payload)
        : await update.updateDoc(DT.item, name, payload);
      const code = (doc as { name: string }).name;

      /* New item: ERPNext already created the Item Price from standard_rate.
         Existing item: push the rate onto the Item Price ourselves, because
         nothing on the server does. Failures are NOT swallowed — a price that
         silently does not save is worse than an error message.            */
      if (!isNew) {
        if (!priceResolved || !priceList) {
          /* Guarded by the disabled Save button; this is the belt-and-braces
             so a race can never create a second Item Price.              */
          throw new Error("Still loading the price list — try again in a moment.");
        }
        if (priceRow) {
          if (Number(priceRow.price_list_rate) !== Number(form.standard_rate)) {
            await update.updateDoc(DT.itemPrice, priceRow.name, {
              price_list_rate: form.standard_rate,
            });
          }
        } else if (form.standard_rate) {
          await create.createDoc(DT.itemPrice, {
            item_code: code,
            price_list: priceList,
            price_list_rate: form.standard_rate,
            uom: form.stock_uom,
            selling: 1,
          });
        }
        await existingPrice.mutate();
      }
      nav(`/catalogue/items/${encodeURIComponent(code)}`);
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/catalogue/items")}>{t("nav.items")}</button>}
        title={isNew ? t("item.new") : form.item_name || name}
        actions={
          <>
            <button className="btn ghost" onClick={() => nav("/catalogue/items")}>{t("soc.discard")}</button>
            <button className="btn" disabled={busy || !ready} onClick={() => void save()}>
              {busy ? t("soc.saving") : t("soc.save")}
            </button>
          </>
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <Card title={t("item.identity")}>
        <div className="grid2">
          <Field label={t("item.col.code")} required>
            <input className="ctl" value={form.item_code} disabled={!isNew} onChange={(e) => set("item_code", e.target.value)} />
          </Field>
          <Field label={t("item.col.name")} required>
            <input className="ctl" value={form.item_name} onChange={(e) => set("item_name", e.target.value)} />
          </Field>
          <Field label={t("item.description")}>
            <input className="ctl" value={form.description} onChange={(e) => set("description", e.target.value)} aria-label={t("item.description")} />
          </Field>
          <Field label={t("item.col.group")} required>
            <select className="ctl" value={form.item_group} onChange={(e) => set("item_group", e.target.value)}>
              <option value="" />
              {(groups.data ?? []).map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
            </select>
          </Field>
          <Field label={t("item.uom")} required>
            <select className="ctl" value={form.stock_uom} onChange={(e) => set("stock_uom", e.target.value)}>
              {(() => {
                const all = (uoms.data ?? []).map((u) => u.name);
                const preferred = COMMON_UOMS.filter((u) => all.includes(u) || all.length === 0);
                // Always include current value if missing from preferred
                const visible = preferred.includes(form.stock_uom) ? preferred : [form.stock_uom, ...preferred];
                return visible.map((u) => <option key={u} value={u}>{u}</option>);
              })()}
            </select>
          </Field>
          <Field label={t("item.brand")}>
            <LinkField
              doctype={DT.brand}
              value={form.brand}
              onChange={(v) => set("brand", v)}
            />
          </Field>
          <Field label={t("item.barcode")}>
            <input className="ctl" value={form.barcode} onChange={(e) => set("barcode", e.target.value)} placeholder="e.g. 6290001234567" />
          </Field>
          <Field label={t("item.col.stock")}>
            <select className="ctl" value={String(form.is_stock_item)} onChange={(e) => set("is_stock_item", Number(e.target.value))}>
              <option value="0">{t("no")}</option>
              <option value="1">{t("yes")}</option>
            </select>
          </Field>
          <Field label={t("item.sell")}>
            <select className="ctl" value={String(form.is_sales_item)} onChange={(e) => set("is_sales_item", Number(e.target.value))} aria-label={t("item.sell")}>
              <option value="0">{t("no")}</option>
              <option value="1">{t("yes")}</option>
            </select>
          </Field>
          <Field label={t("item.buy")}>
            <select className="ctl" value={String(form.is_purchase_item)} onChange={(e) => set("is_purchase_item", Number(e.target.value))} aria-label={t("item.buy")}>
              <option value="0">{t("no")}</option>
              <option value="1">{t("yes")}</option>
            </select>
          </Field>
          {!!form.is_stock_item && (
            <Field label={t("item.valuation")}>
              <select
                className="ctl"
                value={form.valuation_method}
                onChange={(e) => set("valuation_method", e.target.value)}
                aria-label={t("item.valuation")}
              >
                <option value="">{t("item.valuation.default")}</option>
                <option value="FIFO">{t("item.valuation.fifo")}</option>
                <option value="Moving Average">{t("item.valuation.moving")}</option>
              </select>
            </Field>
          )}
          {!!form.is_stock_item && (
            <Field label={t("item.defaultWh")}>
              <LinkField
                doctype={DT.warehouse}
                value={form.default_warehouse}
                onChange={(v) => set("default_warehouse", v)}
                filters={session.company ? [["company", "=", session.company], ["is_group", "=", 0]] : undefined}
              />
            </Field>
          )}
          {!isNew && !!form.is_stock_item && onHand.data?.message && (
            <Field label={t("item.onHand")}>
              <div className="ctl" style={{ background: "var(--bg-faint)", cursor: "default" }}>
                {t("item.onHandTotal")}: {onHand.data.message.total ?? 0}
                {(onHand.data.message.warehouses ?? []).length > 0 && (
                  <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", fontSize: 12, color: "var(--faint)" }}>
                    {onHand.data.message.warehouses.map((r) => (
                      <li key={r.warehouse}>{r.warehouse}: {r.actual_qty}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Field>
          )}
          <Field label={t("item.kind")} required>
            <select className="ctl" value={form.uae_item_type} onChange={(e) => set("uae_item_type", e.target.value)}>
              <option value="Goods">{t("item.goods")}</option>
              <option value="Service">{t("item.service")}</option>
              <option value="Both">{t("item.both")}</option>
            </select>
          </Field>
          <Field label={t("item.col.vat")}>
            <select className="ctl" value={form.is_zero_rated ? "zero" : form.is_exempt ? "exempt" : "standard"}
              onChange={(e) => {
                set("is_zero_rated", e.target.value === "zero" ? 1 : 0);
                set("is_exempt", e.target.value === "exempt" ? 1 : 0);
              }}>
              <option value="standard">{t("item.standard")}</option>
              <option value="zero">{t("item.zero")}</option>
              <option value="exempt">{t("item.exempt")}</option>
            </select>
          </Field>
          {(form.uae_item_type === "Goods" || form.uae_item_type === "Both") && (
            <Field label={t("item.hs")}>
              <input className="ctl" value={form.hs_code} onChange={(e) => set("hs_code", e.target.value)} />
            </Field>
          )}
          {(form.uae_item_type === "Service" || form.uae_item_type === "Both") && (
            <Field label={t("item.sac")}>
              <input className="ctl" value={form.sac_code} onChange={(e) => set("sac_code", e.target.value)} />
            </Field>
          )}
          <Field label={t("item.col.rate")}>
            <input className="ctl" value={form.standard_rate} onChange={(e) => set("standard_rate", parseNum(e.target.value))} />
          </Field>
          {!!form.is_stock_item && (
            <Field label={t("item.safetyStock")}>
              <input className="ctl" type="number" min={0} value={form.safety_stock}
                onChange={(e) => set("safety_stock", parseNum(e.target.value))} />
            </Field>
          )}
        </div>
      </Card>
      {!!form.is_stock_item && (
        <Card title={t("item.reorder")}>
          <div className="grid2">
            <Field label={t("item.reorderWh")}>
              <LinkField
                doctype={DT.warehouse}
                value={form.reorder_warehouse}
                onChange={(v) => set("reorder_warehouse", v)}
                filters={session.company ? [["company", "=", session.company], ["is_group", "=", 0]] : undefined}
              />
            </Field>
            <Field label={t("item.reorderLevel")}>
              <input className="ctl" type="number" min={0} value={form.reorder_level}
                onChange={(e) => set("reorder_level", parseNum(e.target.value))} />
            </Field>
            <Field label={t("item.reorderQty")}>
              <input className="ctl" type="number" min={0} value={form.reorder_qty}
                onChange={(e) => set("reorder_qty", parseNum(e.target.value))} />
            </Field>
          </div>
        </Card>
      )}
      <Card title={t("item.uomConversions")}>
        <p style={{ color: "var(--faint)", fontSize: 12, marginBottom: 8 }}>
          {t("item.uom.factorHint")
            .replace("{uom}", "case")
            .replace("{stockUom}", form.stock_uom || "stock UOM")}
          {" — "}
          1 case = X {form.stock_uom || "nos"}
        </p>
        {uomRows.length === 0 ? (
          <p style={{ color: "var(--faint)", marginBottom: 8 }}>{t("item.uomConversions")}: —</p>
        ) : (
          <table className="data-table" style={{ marginBottom: 8 }}>
            <thead>
              <tr>
                <th>{t("item.uom.uom")}</th>
                <th>{t("item.uom.factor")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {uomRows.map((r) => (
                <tr key={r._key}>
                  <td>
                    <select
                      className="ctl"
                      value={r.uom}
                      onChange={(e) =>
                        setUomRows((rs) =>
                          rs.map((row) => row._key === r._key ? { ...row, uom: e.target.value } : row)
                        )
                      }
                    >
                      <option value="" />
                      {(uoms.data ?? []).map((u) => (
                        <option key={u.name} value={u.name}>{u.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="ctl"
                      type="number"
                      min={0.0001}
                      step={0.001}
                      value={r.conversion_factor}
                      onChange={(e) =>
                        setUomRows((rs) =>
                          rs.map((row) => row._key === r._key ? { ...row, conversion_factor: Number(e.target.value) } : row)
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setUomRows((rs) => rs.filter((row) => row._key !== r._key))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button
          type="button"
          className="btn ghost"
          onClick={() =>
            setUomRows((rs) => [...rs, { _key: newUomKey(), uom: "", conversion_factor: 1 }])
          }
        >
          {t("item.addUom")}
        </button>
      </Card>
    </>
  );
}
