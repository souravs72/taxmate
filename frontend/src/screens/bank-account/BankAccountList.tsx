import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function BankAccountList() {
  return (
    <DocList
      doctype={DT.bankAccount}
      routeBase="/bank-accounts"
      title={t("ba.title")}
      newLabel={t("ba.new")}
      searchPlaceholder={t("ba.search")}
      emptyLabel={t("ba.empty")}
    />
  );
}
