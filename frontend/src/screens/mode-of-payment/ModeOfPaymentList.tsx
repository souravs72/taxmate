import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function ModeOfPaymentList() {
  return (
    <DocList
      doctype={DT.modeOfPayment}
      routeBase="/modes-of-payment"
      title={t("mop.title")}
      newLabel={t("mop.new")}
      searchPlaceholder={t("mop.search")}
      emptyLabel={t("mop.empty")}
    />
  );
}
