import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function UomList() {
  return (
    <DocList
      doctype={DT.uom}
      routeBase="/catalogue/uoms"
      title={t("uom.title")}
      newLabel={t("uom.new")}
      searchPlaceholder={t("uom.search")}
      emptyLabel={t("uom.empty")}
    />
  );
}
