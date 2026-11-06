import DocList from "../../components/DocList";
import { t } from "../../i18n/strings";

export default function FiscalYearList() {
  return (
    <DocList
      doctype={'Fiscal Year'}
      routeBase="/fiscal-years"
      title={t("fy.title")}
      emptyLabel={t("fy.empty")}
    />
  );
}
