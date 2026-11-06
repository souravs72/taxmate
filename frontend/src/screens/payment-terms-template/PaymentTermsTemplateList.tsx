import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function PaymentTermsTemplateList() {
  return (
    <DocList
      doctype={DT.paymentTerms}
      routeBase="/payment-terms-templates"
      title={t("ptt.title")}
      newLabel={t("ptt.new")}
      emptyLabel={t("ptt.empty")}
    />
  );
}
