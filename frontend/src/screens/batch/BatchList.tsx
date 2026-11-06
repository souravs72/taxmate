import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function BatchList() {
  return (
    <DocList
      doctype={DT.batch}
      routeBase="/batches"
      title={t("batch.title")}
      searchPlaceholder={t("batch.search")}
      emptyLabel={t("batch.empty")}
    />
  );
}
