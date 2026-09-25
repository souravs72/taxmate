import LinkField from "./LinkField";
import { Field } from "./ui";
import { DT } from "../lib/frappe";
import { money, parseNum } from "../lib/format";
import { t } from "../i18n/strings";
import type { PartyDetails, TxnLine, TxnSide } from "../lib/txn";

function partyFilters(side: TxnSide, partyName: string) {
  const linkDoctype = side === "buying" ? "Supplier" : "Customer";
  if (!partyName) return undefined;
  return [
    ["Dynamic Link", "link_doctype", "=", linkDoctype],
    ["Dynamic Link", "link_name", "=", partyName],
  ];
}

/** Billing, shipping, and contact. Filled by get_party_details; the user can change them. */
export function PartyFields({
  side,
  partyName,
  party,
  onChange,
  disabled,
}: {
  side: TxnSide;
  partyName: string;
  party: PartyDetails;
  onChange: (patch: Partial<PartyDetails>) => void;
  disabled?: boolean;
}) {
  const filters = partyFilters(side, partyName);
  const billing = side === "buying" ? party.supplier_address : party.customer_address;
  const billingKey = side === "buying" ? "supplier_address" : "customer_address";
  return (
    <div className="grid3" style={{ marginBlockStart: 14 }}>
      <Field label={t("f.address")}>
        <LinkField
          doctype={DT.address}
          value={billing ?? ""}
          disabled={disabled || !partyName}
          filters={filters}
          onChange={(v) => onChange({ [billingKey]: v })}
        />
      </Field>
      {side === "selling" && (
        <Field label={t("f.shipping")}>
          <LinkField
            doctype={DT.address}
            value={party.shipping_address_name ?? ""}
            disabled={disabled || !partyName}
            filters={filters}
            onChange={(v) => onChange({ shipping_address_name: v })}
          />
        </Field>
      )}
      <Field label={t("f.contact")}>
        <LinkField
          doctype={DT.contact}
          value={party.contact_person ?? ""}
          disabled={disabled || !partyName}
          filters={filters}
          onChange={(v) => onChange({ contact_person: v })}
        />
      </Field>
    </div>
  );
}

/** Shown only when the document currency is not the company currency. */
export function ExchangeRateField({
  currency,
  companyCurrency,
  value,
  onChange,
  disabled,
}: {
  currency?: string;
  companyCurrency?: string;
  value: number;
  onChange: (rate: number) => void;
  disabled?: boolean;
}) {
  if (!currency || !companyCurrency || currency === companyCurrency) return null;
  return (
    <Field label={t("f.conversionRate")}>
      <input
        className="ctl"
        type="number"
        min={0}
        step={0.000001}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseNum(e.target.value) || 0)}
      />
    </Field>
  );
}

/** Batch, serial, and margin-scheme price. Rendered only when the item needs them. */
export function LineTrack({
  line,
  onChange,
  disabled,
}: {
  line: TxnLine;
  onChange: (patch: Partial<TxnLine>) => void;
  disabled?: boolean;
}) {
  const batch = !!line.has_batch_no;
  const serial = !!line.has_serial_no;
  const margin = !!line.uae_is_margin_scheme;
  if (!batch && !serial && !margin && !line.is_free_item) return null;
  return (
    <div className="grid3" style={{ marginTop: 6 }}>
      {!!line.is_free_item && <span className="infochip">{t("txn.freeItem")}</span>}
      {batch && (
        <Field label={t("dn.batchNo")}>
          <LinkField
            doctype={DT.batch}
            value={line.batch_no ?? ""}
            disabled={disabled}
            filters={line.item_code ? { item: line.item_code } : undefined}
            onChange={(v) => onChange({ batch_no: v })}
          />
        </Field>
      )}
      {serial && (
        <Field label={t("dn.serialNo")}>
          <input
            className="ctl"
            value={line.serial_no ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ serial_no: e.target.value })}
          />
        </Field>
      )}
      {margin && (
        <Field label={t("txn.marginPrice")}>
          <input
            className="ctl"
            type="number"
            min={0}
            step="0.01"
            value={line.uae_purchase_price ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ uae_purchase_price: parseNum(e.target.value) })}
          />
        </Field>
      )}
    </div>
  );
}

export type ScheduleRow = {
  payment_term?: string;
  description?: string;
  due_date?: string;
  invoice_portion?: number;
  payment_amount?: number;
};

/** Compact payment schedule from the selected terms template. */
export function PaymentScheduleTable({ rows }: { rows: ScheduleRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="twrap" style={{ marginBlockStart: 14 }}>
      <table>
        <thead>
          <tr>
            <th>{t("txn.dueDate")}</th>
            <th>{t("f.paymentTerms")}</th>
            <th className="n">{t("txn.portion")}</th>
            <th className="n">{t("sod.col.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.due_date ?? ""}-${i}`}>
              <td>{r.due_date || "—"}</td>
              <td>{r.payment_term || r.description || "—"}</td>
              <td className="n">{r.invoice_portion != null ? `${r.invoice_portion}%` : "—"}</td>
              <td className="n">{money(Number(r.payment_amount) || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Warning when projected receivables cross the customer credit limit. */
export function CreditLimitNotice({
  balance,
}: {
  balance: { credit_limit: number; projected: number; remaining: number | null; crossed: boolean } | null;
}) {
  if (!balance?.credit_limit || !balance.crossed) return null;
  return (
    <div className="note" role="status" style={{ marginBlockStart: 12 }}>
      <svg className="ic" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="8" cy="8" r="6.5" /><path d="M8 7.5v4M8 4.8v.6" />
      </svg>
      <span>
        <b>{t("txn.creditCrossed")}</b>
        <span>
          {" "}
          {t("txn.creditDetail")
            .replace("{projected}", money(balance.projected))
            .replace("{limit}", money(balance.credit_limit))}
        </span>
      </span>
    </div>
  );
}
