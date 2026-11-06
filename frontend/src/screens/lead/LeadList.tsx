import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function LeadList() {
  return (
    <DocList
      doctype={DT.lead}
      routeBase="/leads"
      title={t("lead.title")}
      newLabel={t("lead.new")}
      searchPlaceholder={t("lead.search")}
      emptyLabel={t("lead.empty")}
    />
  );
}
