import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function UaeBadDebtList() {
  return (
    <DocList
      doctype={DT.uaeBadDebt}
      routeBase="/uae-bad-debt-relief"
      title={t("ubd.title")}
      newLabel={t("ubd.new")}
      emptyLabel={t("ubd.empty")}
    />
  );
}
