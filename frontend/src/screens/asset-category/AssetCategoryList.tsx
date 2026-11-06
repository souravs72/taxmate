import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function AssetCategoryList() {
  return (
    <DocList
      doctype={DT.assetCategory}
      routeBase="/asset-categories"
      title={t("ac.title")}
      newLabel={t("ac.new")}
      searchPlaceholder={t("ac.search")}
      emptyLabel={t("ac.empty")}
    />
  );
}
