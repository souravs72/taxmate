import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function PosProfileList() {
  return (
    <DocList
      doctype={DT.posProfile}
      routeBase="/pos-profiles"
      title={t("posp.title")}
      searchPlaceholder={t("posp.search")}
      emptyLabel={t("posp.empty")}
    />
  );
}
