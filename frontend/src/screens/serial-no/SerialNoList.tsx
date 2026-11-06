import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function SerialNoList() {
  return (
    <DocList
      doctype={DT.serialNo}
      routeBase="/serial-nos"
      title={t("sn.title")}
      searchPlaceholder={t("sn.search")}
      emptyLabel={t("sn.empty")}
    />
  );
}
