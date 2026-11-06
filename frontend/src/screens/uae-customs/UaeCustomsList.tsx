import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function UaeCustomsList() {
  return (
    <DocList
      doctype={DT.uaeCustoms}
      routeBase="/uae-customs-declarations"
      title={t("ucd.title")}
      newLabel={t("ucd.new")}
      emptyLabel={t("ucd.empty")}
    />
  );
}
