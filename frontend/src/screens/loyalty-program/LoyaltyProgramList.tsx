import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function LoyaltyProgramList() {
  return (
    <DocList
      doctype={DT.loyaltyProgram}
      routeBase="/loyalty-programs"
      title={t("lp.title")}
      newLabel={t("lp.new")}
      searchPlaceholder={t("lp.search")}
      emptyLabel={t("lp.empty")}
    />
  );
}
