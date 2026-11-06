import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function ItemList() {
  return (
    <DocList
      doctype={DT.item}
      routeBase="/catalogue/items"
      title={t("item.title")}
      newLabel={t("item.new")}
      searchPlaceholder={t("item.search")}
      emptyLabel={t("item.empty")}
    />
  );
}
