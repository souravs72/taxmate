import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function EsrFilingList() {
  return (
    <DocList
      doctype={DT.esrFiling}
      routeBase="/esr"
      title={t("esr.title")}
      searchPlaceholder={t("esr.search")}
      emptyLabel={t("esr.empty")}
    />
  );
}
