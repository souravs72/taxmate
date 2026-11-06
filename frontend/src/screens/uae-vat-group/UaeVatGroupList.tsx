import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function UaeVatGroupList() {
  return (
    <DocList
      doctype={DT.uaeVatGroup}
      routeBase="/uae-vat-groups"
      title={t("uvg.title")}
      newLabel={t("uvg.new")}
      emptyLabel={t("uvg.empty")}
    />
  );
}
