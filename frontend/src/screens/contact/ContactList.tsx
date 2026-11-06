import DocList from "../../components/DocList";
import { t } from "../../i18n/strings";

export default function ContactList() {
  return (
    <DocList
      doctype={'Contact'}
      routeBase="/contacts"
      title={t("cnt.title")}
      newLabel={t("cnt.new")}
      searchPlaceholder={t("cnt.search")}
      emptyLabel={t("cnt.empty")}
    />
  );
}
