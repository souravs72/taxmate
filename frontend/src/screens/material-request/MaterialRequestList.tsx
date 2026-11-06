import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function MaterialRequestList() {
  return (
    <DocList
      doctype={DT.materialRequest}
      routeBase="/material-requests"
      title={t("mr.title")}
      newLabel={t("mr.new")}
      searchPlaceholder={t("mr.search")}
      emptyLabel={t("mr.empty")}
    />
  );
}
