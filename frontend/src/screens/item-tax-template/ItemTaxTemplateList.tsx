import DocList from "../../components/DocList";
import { t } from "../../i18n/strings";

export default function ItemTaxTemplateList() {
  return (
    <DocList
      doctype={'Item Tax Template'}
      routeBase="/item-tax-templates"
      title={t("itt.title")}
      newLabel={t("itt.new")}
      searchPlaceholder={t("itt.search")}
      emptyLabel={t("itt.empty")}
    />
  );
}
