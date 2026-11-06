import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function CurrencyExchangeList() {
  return (
    <DocList
      doctype={DT.currencyExchange}
      routeBase="/currency-exchanges"
      title={t("cx.title")}
      newLabel={t("cx.new")}
      searchPlaceholder={t("cx.search")}
      emptyLabel={t("cx.empty")}
    />
  );
}
