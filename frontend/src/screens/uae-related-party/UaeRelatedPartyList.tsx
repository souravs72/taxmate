import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function UaeRelatedPartyList() {
  return (
    <DocList
      doctype={DT.uaeRelatedParty}
      routeBase="/uae-related-parties"
      title={t("urp.title")}
      newLabel={t("urp.new")}
      emptyLabel={t("urp.empty")}
    />
  );
}
