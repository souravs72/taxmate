import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function BrandList() {
  return (
    <DocList
      doctype={DT.brand}
      routeBase="/catalogue/brands"
      title={t("brand.title")}
      newLabel={t("brand.new")}
      searchPlaceholder={t("brand.search")}
      emptyLabel={t("brand.empty")}
    />
  );
}
