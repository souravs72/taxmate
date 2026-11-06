import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function UaeCapitalGoodsList() {
  return (
    <DocList
      doctype={DT.uaeCapitalGoods}
      routeBase="/uae-capital-goods-adjustments"
      title={t("ucg.title")}
      newLabel={t("ucg.new")}
      emptyLabel={t("ucg.empty")}
    />
  );
}
