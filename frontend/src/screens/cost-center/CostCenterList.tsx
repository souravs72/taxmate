import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function CostCenterList() {
  return (
    <DocList
      doctype={DT.costCenter}
      routeBase="/cost-centers"
      title={t("cc.title")}
      newLabel={t("cc.new")}
      emptyLabel={t("cc.empty")}
    />
  );
}
