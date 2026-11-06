import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function LateFilingList() {
  return (
    <DocList
      doctype={DT.lateFiling}
      routeBase="/late-filings"
      title={t("lf.title")}
      searchPlaceholder={t("lf.search")}
      emptyLabel={t("lf.empty")}
    />
  );
}
