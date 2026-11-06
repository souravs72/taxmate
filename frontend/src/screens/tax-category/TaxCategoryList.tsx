import DocList from "../../components/DocList";
import { t } from "../../i18n/strings";

export default function TaxCategoryList() {
  return (
    <DocList
      doctype={'Tax Category'}
      routeBase="/tax-categories"
      title={t("txc.title")}
      newLabel={t("txc.new")}
      searchPlaceholder={t("txc.search")}
      emptyLabel={t("txc.empty")}
    />
  );
}
