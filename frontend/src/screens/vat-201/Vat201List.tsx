import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function Vat201List() {
  return (
    <DocList
      doctype={DT.vat201}
      routeBase="/vat-201"
      title={t("v201.title")}
      newLabel={t("v201.new")}
      searchPlaceholder={t("v201.search")}
      emptyLabel={t("v201.empty")}
    />
  );
}
