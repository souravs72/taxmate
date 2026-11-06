import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function QuotationList() {
  return (
    <DocList
      doctype={DT.quotation}
      routeBase="/quotations"
      title={t("quot.title")}
      newLabel={t("quot.new")}
      searchPlaceholder={t("quot.search")}
      emptyLabel={t("quot.empty")}
    />
  );
}
