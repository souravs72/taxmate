import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function TerritoryList() {
  return (
    <DocList
      doctype={DT.territory}
      routeBase="/territories"
      title={t("ter.title")}
      newLabel={t("ter.new")}
      searchPlaceholder={t("ter.search")}
      emptyLabel={t("ter.empty")}
    />
  );
}
