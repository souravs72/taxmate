import DocList from "../../components/DocList";
import { t } from "../../i18n/strings";

export default function TermsAndConditionsList() {
  return (
    <DocList
      doctype={'Terms and Conditions'}
      routeBase="/terms-and-conditions"
      title={t("tc.title")}
      newLabel={t("tc.new")}
      searchPlaceholder={t("tc.search")}
      emptyLabel={t("tc.empty")}
    />
  );
}
