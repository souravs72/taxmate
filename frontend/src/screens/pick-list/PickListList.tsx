import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function PickListList() {
  return (
    <DocList
      doctype={DT.pickList}
      routeBase="/pick-lists"
      title={t("picklist.title")}
      newLabel={t("picklist.new")}
      searchPlaceholder={t("picklist.search")}
      emptyLabel={t("picklist.empty")}
    />
  );
}
