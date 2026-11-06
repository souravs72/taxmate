import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function DeliveryNoteList() {
  return (
    <DocList
      doctype={DT.deliveryNote}
      routeBase="/delivery-notes"
      title={t("dn.listTitle")}
      newLabel={t("dn.new")}
      searchPlaceholder={t("dn.search")}
      emptyLabel={t("dn.empty")}
    />
  );
}
