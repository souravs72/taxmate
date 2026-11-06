import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function CtFilingList() {
  return (
    <DocList
      doctype={DT.ctFiling}
      routeBase="/ct-filings"
      title={t("ct.title")}
      searchPlaceholder={t("ct.search")}
      emptyLabel={t("ct.empty")}
    />
  );
}
