/**
 * Pricing Rule form. Routes: /pricing-rules/new, /pricing-rules/:name/edit
 * API: insert/save on "Pricing Rule". Callers: App.tsx. Phase 9.
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Field } from "../../components/ui";
import { FormLayout, ReadinessCard } from "../../components/form";
import LinkField from "../../components/LinkField";
import { parseNum, toIsoDate } from "../../lib/format";

const today = toIsoDate(new Date());

type Doc = {
  apply_on?: string;
  item_code?: string;
  item_group?: string;
  brand?: string;
  customer?: string;
  min_qty?: number;
  rate_or_discount?: string;
  discount_percentage?: number;
  discount_amount?: number;
  rate?: number;
  valid_from?: string;
  valid_upto?: string;
  priority?: number;
  disable?: number;
};

const APPLY_ON_OPTIONS = ["Item Code", "Item Group", "Brand"];
const RATE_DISCOUNT_OPTIONS = ["Discount Percentage", "Discount Amount", "Rate"];

export default function PricingRuleForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";

  const existing = useDoc<Doc>(DT.pricingRule, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const create = useInsert();
  const update = useSave();

  const [applyOn, setApplyOn] = useState("Item Code");
  const [itemCode, setItemCode] = useState("");
  const [itemGroup, setItemGroup] = useState("");
  const [brand, setBrand] = useState("");
  const [customer, setCustomer] = useState("");
  const [minQty, setMinQty] = useState(0);
  const [rateOrDiscount, setRateOrDiscount] = useState("Discount Percentage");
  const [discountPct, setDiscountPct] = useState(0);
  const [discountAmt, setDiscountAmt] = useState(0);
  const [rate, setRate] = useState(0);
  const [validFrom, setValidFrom] = useState(today);
  const [validUpto, setValidUpto] = useState("");
  const [priority, setPriority] = useState(1);
  const [disable, setDisable] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setApplyOn(d.apply_on || "Item Code");
    setItemCode(d.item_code || "");
    setItemGroup(d.item_group || "");
    setBrand(d.brand || "");
    setCustomer(d.customer || "");
    setMinQty(Number(d.min_qty) || 0);
    setRateOrDiscount(d.rate_or_discount || "Discount Percentage");
    setDiscountPct(Number(d.discount_percentage) || 0);
    setDiscountAmt(Number(d.discount_amount) || 0);
    setRate(Number(d.rate) || 0);
    setValidFrom(d.valid_from || today);
    setValidUpto(d.valid_upto || "");
    setPriority(Number(d.priority) || 1);
    setDisable(Number(d.disable) || 0);
  }, [existing.data]);

  const checks = useMemo(() => [
    { label: t("prule.check.applyOn"), ok: !!applyOn },
    { label: t("prule.check.target"), ok: applyOn === "Item Code" ? !!itemCode : applyOn === "Item Group" ? !!itemGroup : !!brand },
  ], [applyOn, itemCode, itemGroup, brand]);

  const ready = checks.every((c) => c.ok);

  async function save() {
    setBusy(true); setSaveError(null);
    try {
      const payload: Record<string, unknown> = {
        company: session.company,
        apply_on: applyOn,
        item_code: applyOn === "Item Code" ? itemCode : undefined,
        item_group: applyOn === "Item Group" ? itemGroup : undefined,
        brand: applyOn === "Brand" ? brand : undefined,
        customer: customer || undefined,
        min_qty: minQty,
        rate_or_discount: rateOrDiscount,
        discount_percentage: rateOrDiscount === "Discount Percentage" ? discountPct : undefined,
        discount_amount: rateOrDiscount === "Discount Amount" ? discountAmt : undefined,
        rate: rateOrDiscount === "Rate" ? rate : undefined,
        valid_from: validFrom || undefined,
        valid_upto: validUpto || undefined,
        priority,
        disable,
      };
      if (isNew) {
        const res = (await create.createDoc(DT.pricingRule, payload) as { name: string });
        nav(`/pricing-rules/${encodeURIComponent(res.name)}`);
      } else {
        await update.updateDoc(DT.pricingRule, name, payload);
        nav(`/pricing-rules/${encodeURIComponent(name)}`);
      }
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;
  if (!canWrite(session)) return <Navigate to="/pricing-rules" replace />;

  return (
    <>
      <PageHead
        title={isNew ? t("prule.new") : name}
        actions={
          <>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => nav(-1)}>{t("form.cancel")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void save()}>{t("form.save")}</button>
          </>
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <ReadinessCard checks={checks} />
        <Card num={1} title={t("prule.details")}>
          <div className="fields">
            <Field label={t("prule.applyOn")} required htmlFor="pr-apply">
              <select id="pr-apply" className="ctl" value={applyOn} onChange={(e) => setApplyOn(e.target.value)}>
                {APPLY_ON_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            {applyOn === "Item Code" && (
              <Field label={t("prule.itemCode")} required>
                <LinkField doctype={DT.item} value={itemCode} onChange={setItemCode} />
              </Field>
            )}
            {applyOn === "Item Group" && (
              <Field label={t("prule.itemGroup")} required>
                <LinkField doctype={DT.itemGroup} value={itemGroup} onChange={setItemGroup} />
              </Field>
            )}
            {applyOn === "Brand" && (
              <Field label={t("prule.brand")} required>
                <input className="ctl" value={brand} onChange={(e) => setBrand(e.target.value)} />
              </Field>
            )}
            <Field label={t("prule.customer")}>
              <LinkField doctype={DT.customer} value={customer} onChange={setCustomer} />
            </Field>
            <Field label={t("prule.minQty")} htmlFor="pr-minqty">
              <input id="pr-minqty" className="ctl nn" type="number" min={0} value={minQty}
                onChange={(e) => setMinQty(parseNum(e.target.value))} />
            </Field>
          </div>
        </Card>
        <Card num={2} title={t("prule.discount")}>
          <div className="fields">
            <Field label={t("prule.rateOrDiscount")} htmlFor="pr-rod">
              <select id="pr-rod" className="ctl" value={rateOrDiscount} onChange={(e) => setRateOrDiscount(e.target.value)}>
                {RATE_DISCOUNT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            {rateOrDiscount === "Discount Percentage" && (
              <Field label={t("prule.discountPct")} htmlFor="pr-dpct">
                <input id="pr-dpct" className="ctl nn" type="number" min={0} max={100} value={discountPct}
                  onChange={(e) => setDiscountPct(parseNum(e.target.value))} />
              </Field>
            )}
            {rateOrDiscount === "Discount Amount" && (
              <Field label={t("prule.discountAmt")} htmlFor="pr-damt">
                <input id="pr-damt" className="ctl nn" type="number" min={0} value={discountAmt}
                  onChange={(e) => setDiscountAmt(parseNum(e.target.value))} />
              </Field>
            )}
            {rateOrDiscount === "Rate" && (
              <Field label={t("prule.rate")} htmlFor="pr-rate">
                <input id="pr-rate" className="ctl nn" type="number" min={0} value={rate}
                  onChange={(e) => setRate(parseNum(e.target.value))} />
              </Field>
            )}
          </div>
        </Card>
        <Card num={3} title={t("prule.validity")}>
          <div className="fields">
            <Field label={t("prule.validFrom")} htmlFor="pr-vfrom">
              <input id="pr-vfrom" className="ctl" type="date" value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)} />
            </Field>
            <Field label={t("prule.validUpto")} htmlFor="pr-vupto">
              <input id="pr-vupto" className="ctl" type="date" value={validUpto}
                onChange={(e) => setValidUpto(e.target.value)} />
            </Field>
            <Field label={t("prule.priority")} htmlFor="pr-prio">
              <input id="pr-prio" className="ctl nn" type="number" min={1} value={priority}
                onChange={(e) => setPriority(parseNum(e.target.value))} />
            </Field>
            <Field label={t("prule.disable")}>
              <label className="toggle">
                <input type="checkbox" checked={disable === 1}
                  onChange={(e) => setDisable(e.target.checked ? 1 : 0)} />
                {t("prule.disable")}
              </label>
            </Field>
          </div>
        </Card>
      </FormLayout>
    </>
  );
}
