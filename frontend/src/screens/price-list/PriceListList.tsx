import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function PriceListList() {
  return (
    <DocList
      doctype={DT.priceList}
      routeBase="/price-lists"
      title={t("pl.title")}
      newLabel={t("pl.new")}
      emptyLabel={t("pl.empty")}
    />
  );
}
