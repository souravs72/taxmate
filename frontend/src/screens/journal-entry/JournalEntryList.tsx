import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function JournalEntryList() {
  return (
    <DocList
      doctype={DT.journalEntry}
      routeBase="/journals"
      title={t("je.title")}
      newLabel={t("je.new")}
      searchPlaceholder={t("je.search")}
      emptyLabel={t("je.empty")}
    />
  );
}
