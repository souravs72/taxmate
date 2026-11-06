import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function LandedCostVoucherList() {
  return (
    <DocList
      doctype={DT.landedCostVoucher}
      routeBase="/landed-cost-vouchers"
      title={t("lcv.title")}
      newLabel={t("lcv.new")}
      searchPlaceholder={t("lcv.search")}
      emptyLabel={t("lcv.empty")}
    />
  );
}
