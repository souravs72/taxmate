import DocList from "../../components/DocList";
import { t } from "../../i18n/strings";

export default function PeriodClosingList() {
  return (
    <DocList
      doctype={"Period Closing Voucher"}
      routeBase="/period-closing"
      title={t("pcv.title")}
      emptyLabel={t("pcv.empty")}
    />
  );
}
