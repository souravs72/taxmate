/**
 * BomForm — Phase 18. Create/edit BOM.
 * Callers: App.tsx /boms/new, /boms/:name/edit
 * API: taxmate.api.resource.insert / save on "BOM"
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales } from "../../lib/roles";
import { parseNum } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";
import LinkField from "../../components/LinkField";

type BomItem = { item_code: string; item_name?: string; qty: number; uom?: string; rate?: number };
type Doc = {
  name: string; item?: string; item_name?: string; quantity?: number; is_active?: number;
  is_default?: number; items?: (BomItem & { name?: string })[];
};

export default function BomForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";
  const canSubmit = canSubmitSales(session.roles);

  const existing = useDoc<Doc>(DT.bom, isNew ? undefined : name, isNew ? null : name, { isPaused: () => isNew });
  const create = useInsert();
  const update = useSave();
  const submitCall = useFrappePostCall(METHOD.submit);
  const itemCall = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.getItemDetails);

  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isActive, setIsActive] = useState<0 | 1>(1);
  const [isDefault, setIsDefault] = useState<0 | 1>(0);
  const [rows, setRows] = useState<(BomItem & { _key: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const d = existing.data;
    if (!d || loaded) return;
    setItem(d.item || "");
    setQuantity(d.quantity || 1);
    setIsActive(d.is_active ? 1 : 0);
    setIsDefault(d.is_default ? 1 : 0);
    setRows((d.items ?? []).map((r, i) => ({ ...r, _key: String(i) })));
    setLoaded(true);
  }, [existing.data, loaded]);

  let _k = 0;
  const addRow = () => setRows((rs) => [...rs, { _key: String(_k++), item_code: "", qty: 1, uom: "Nos" }]);
  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r._key !== key));
  const setRow = (key: string, field: string, val: string | number) =>
    setRows((rs) => rs.map((r) => r._key === key ? { ...r, [field]: val } : r));

  async function fetchItem(key: string, code: string) {
    if (!code) return;
    try {
      const res = await itemCall.call({ item_code: code, company: session.company });
      const m = res?.message as Record<string, unknown> | undefined;
      if (m?.stock_uom) setRow(key, "uom", m.stock_uom as string);
    } catch { /* ignore */ }
  }

  const ready = !!item && quantity > 0 && rows.length > 0 && rows.every((r) => r.item_code);

  async function saveFn(andSubmit = false) {
    if (!ready) return;
    setBusy(true); setSaveError(null);
    try {
      const payload = {
        item, quantity, is_active: isActive, is_default: isDefault,
        company: session.company,
        items: rows.map(({ _key: _k2, ...r }) => r),
      };
      let n: string;
      if (isNew) {
        const doc = (await create.createDoc(DT.bom, payload)) as { name: string };
        n = doc.name;
      } else {
        await update.updateDoc(DT.bom, name, payload);
        n = name;
      }
      if (andSubmit) await submitCall.call({ doctype: DT.bom, name: n });
      nav(`/boms/${encodeURIComponent(n)}`);
    } catch (err) { setSaveError(err); }
    finally { setBusy(false); }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/boms")}>{t("bom.title")}</button>}
        title={isNew ? t("bom.new") : item || name}
      />
      {saveError ? <ErrorBox error={saveError} /> : null}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("bom.col.item")} required>
              <LinkField doctype={DT.item} value={item} onChange={setItem} placeholder={t("bom.itemPh")} />
            </Field>
            <Field label={t("bom.col.qty")}>
              <input className="ctl" type="number" min={0.001} value={quantity} onChange={(e) => setQuantity(parseNum(e.target.value))} />
            </Field>
            <Field label={t("bom.col.active")}>
              <label style={{ display: "flex", gap: 8 }}>
                <input type="checkbox" checked={!!isActive} onChange={(e) => setIsActive(e.target.checked ? 1 : 0)} />
                {t("bom.activeLabel")}
              </label>
            </Field>
            <Field label={t("bom.col.default")}>
              <label style={{ display: "flex", gap: 8 }}>
                <input type="checkbox" checked={!!isDefault} onChange={(e) => setIsDefault(e.target.checked ? 1 : 0)} />
                {t("bom.defaultLabel")}
              </label>
            </Field>
          </div>
        </Card>
        <Card title={t("bom.materials")}>
          <div className="twrap">
            <table>
              <thead><tr>
                <th>{t("bom.col.material")}</th>
                <th className="n">{t("bom.col.matQty")}</th>
                <th>{t("bom.col.uom")}</th>
                <th />
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._key}>
                    <td>
                      <LinkField doctype={DT.item} value={r.item_code} onChange={(v) => { setRow(r._key, "item_code", v); void fetchItem(r._key, v); }} placeholder={t("bom.matPh")} />
                    </td>
                    <td><input className="ctl" type="number" min={0.001} step={0.001} value={r.qty} onChange={(e) => setRow(r._key, "qty", parseNum(e.target.value))} /></td>
                    <td><input className="ctl" type="text" value={r.uom || ""} onChange={(e) => setRow(r._key, "uom", e.target.value)} /></td>
                    <td><button type="button" className="btn ghost" onClick={() => removeRow(r._key)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn ghost" style={{ marginTop: 8 }} onClick={addRow}>{t("bom.addMaterial")}</button>
        </Card>
        <FormActions
          onSave={() => void saveFn(false)}
          onSubmit={canSubmit ? () => void saveFn(true) : undefined}
          onDiscard={() => nav(isNew ? "/boms" : `/boms/${encodeURIComponent(name)}`)}
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
