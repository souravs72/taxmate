import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function UboRegisterList() {
  return (
    <DocList
      doctype={DT.uboRegister}
      routeBase="/ubo"
      title={t("ubo.title")}
      searchPlaceholder={t("ubo.search")}
      emptyLabel={t("ubo.empty")}
    />
  );
}
