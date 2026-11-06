import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function LoyaltyPointEntryList() {
  return (
    <DocList
      doctype={DT.loyaltyPointEntry}
      routeBase="/loyalty-point-entries"
      title={t("lpe.title")}
      searchPlaceholder={t("lpe.search")}
      emptyLabel={t("lpe.empty")}
    />
  );
}
