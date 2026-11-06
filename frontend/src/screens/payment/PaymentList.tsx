import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";
import type { PayType } from "../../lib/payments";

export default function PaymentList() {
  return (
    <DocList
      doctype={DT.paymentEntry}
      routeBase="/payments"
      title={t("pay.title")}
      newLabel={t("pay.new")}
      searchPlaceholder={t("pay.search")}
      emptyLabel={t("pay.empty")}
    />
  );
}

/** Money in vs money out — used on PaymentDetail. */
export function DirChip({ type }: { type: PayType }) {
  const inbound = type === "Receive";
  return (
    <span className={`dir ${inbound ? "in" : "out"}`}>
      <span className="ar">{inbound ? "↓" : "↑"}</span>
      {t(`pay.type.${type}`)}
    </span>
  );
}
