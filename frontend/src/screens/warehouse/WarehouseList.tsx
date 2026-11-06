import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function WarehouseList() {
  return (
    <DocList
      doctype={DT.warehouse}
      routeBase="/warehouses"
      title={t("wh.title")}
      searchPlaceholder={t("wh.search")}
      emptyLabel={t("wh.empty")}
    />
  );
}
