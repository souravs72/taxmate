import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function AssetList() {
  return (
    <DocList
      doctype={DT.asset}
      routeBase="/assets"
      title={t("ast.title")}
      newLabel={t("ast.new")}
      searchPlaceholder={t("ast.search")}
      emptyLabel={t("ast.empty")}
    />
  );
}
