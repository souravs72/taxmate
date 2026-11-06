import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function BomList() {
  return (
    <DocList
      doctype={DT.bom}
      routeBase="/boms"
      title={t("bom.title")}
      newLabel={t("bom.new")}
      searchPlaceholder={t("bom.search")}
      emptyLabel={t("bom.empty")}
    />
  );
}
