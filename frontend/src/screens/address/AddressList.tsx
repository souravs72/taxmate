import DocList from "../../components/DocList";
import { t } from "../../i18n/strings";

export default function AddressList() {
  return (
    <DocList
      doctype={'Address'}
      routeBase="/addresses"
      title={t("addr.title")}
      newLabel={t("addr.new")}
      searchPlaceholder={t("addr.search")}
      emptyLabel={t("addr.empty")}
    />
  );
}
