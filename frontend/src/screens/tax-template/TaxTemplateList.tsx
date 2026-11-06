import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function TaxTemplateList() {
  return (
    <DocList
      doctype={DT.taxTemplate}
      routeBase="/tax-templates"
      title={t("tx.title")}
      searchPlaceholder={t("tx.search")}
      emptyLabel={t("tx.empty")}
    />
  );
}
