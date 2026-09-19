import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappeCreateDoc, useFrappeGetDoc, useFrappeGetDocList, useFrappeUpdateDoc } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { parseNum } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";

type ItemDoc = {
  name: string;
  item_code?: string;
  item_name?: string;
  item_group?: string;
  stock_uom?: string;
  is_stock_item?: number;
  uae_item_type?: string;
  is_zero_rated?: number;
  is_exempt?: number;
  hs_code?: string;
  sac_code?: string;
  standard_rate?: number;
};

export default function ItemForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";
  const existing = useFrappeGetDoc<ItemDoc>(DT.item, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const groups = useFrappeGetDocList<{ name: string }>(DT.itemGroup, {
    fields: ["name"], filters: [["is_group", "=", 0]], limit: 80,
  });
  const uoms = useFrappeGetDocList<{ name: string }>(DT.uom, { fields: ["name"], limit: 80 });
  const settings = useFrappeGetDoc<{ selling_price_list?: string }>(DT.sellingSettings, DT.sellingSettings);
  const create = useFrappeCreateDoc();
  const update = useFrappeUpdateDoc();

  const [form, setForm] = useState({
    item_code: "",
    item_name: "",
    item_group: "",
    stock_uom: "Nos",
    is_stock_item: 0 as 0 | 1,
    uae_item_type: "Service",
    is_zero_rated: 0 as 0 | 1,
    is_exempt: 0 as 0 | 1,
    hs_code: "",
    sac_code: "",
    standard_rate: 0,
  });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setForm({
      item_code: d.item_code || d.name,
      item_name: d.item_name || "",
      item_group: d.item_group || "",
      stock_uom: d.stock_uom || "Nos",
      is_stock_item: (d.is_stock_item || 0) as 0 | 1,
      uae_item_type: d.uae_item_type || "Service",
      is_zero_rated: (d.is_zero_rated || 0) as 0 | 1,
      is_exempt: (d.is_exempt || 0) as 0 | 1,
      hs_code: d.hs_code || "",
      sac_code: d.sac_code || "",
      standard_rate: d.standard_rate || 0,
    });
  }, [existing.data]);

  const ready = !!form.item_code && !!form.item_name && !!form.item_group && !!form.stock_uom && !!form.uae_item_type;

  async function save() {
    setBusy(true);
    setSaveError(null);
    try {
      const payload = {
        item_code: form.item_code,
        item_name: form.item_name,
        item_group: form.item_group,
        stock_uom: form.stock_uom,
        is_stock_item: form.is_stock_item,
        is_sales_item: 1,
        uae_item_type: form.uae_item_type,
        is_zero_rated: form.is_zero_rated,
        is_exempt: form.is_exempt,
        hs_code: form.hs_code || undefined,
        sac_code: form.sac_code || undefined,
        standard_rate: form.standard_rate,
      };
      const doc = isNew
        ? await create.createDoc(DT.item, payload)
        : await update.updateDoc(DT.item, name, payload);
      const code = (doc as { name: string }).name;
      const priceList = settings.data?.selling_price_list;
      if (priceList && form.standard_rate) {
        await create.createDoc(DT.itemPrice, {
          item_code: code,
          price_list: priceList,
          price_list_rate: form.standard_rate,
          selling: 1,
        }).catch(() => undefined);
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
        eyebrow={<a onClick={() => nav("/catalogue/items")} style={{ color: "var(--brand)", cursor: "pointer" }}>{t("nav.items")}</a>}
        title={isNew ? t("item.new") : form.item_name || name}
        actions={
          <>
            <button className="btn quiet" onClick={() => nav("/catalogue/items")}>{t("soc.discard")}</button>
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
          <Field label={t("item.col.group")} required>
            <select className="ctl" value={form.item_group} onChange={(e) => set("item_group", e.target.value)}>
              <option value="" />
              {(groups.data ?? []).map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
            </select>
          </Field>
          <Field label={t("item.uom")} required>
            <select className="ctl" value={form.stock_uom} onChange={(e) => set("stock_uom", e.target.value)}>
              {(uoms.data ?? [{ name: "Nos" }]).map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
            </select>
          </Field>
          <Field label={t("item.col.stock")}>
            <select className="ctl" value={String(form.is_stock_item)} onChange={(e) => set("is_stock_item", Number(e.target.value))}>
              <option value="0">{t("no")}</option>
              <option value="1">{t("yes")}</option>
            </select>
          </Field>
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
        </div>
      </Card>
    </>
  );
}
