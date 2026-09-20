import { useDoc } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, ReadRow } from "../../components/ui";

type Settings = {
  name?: string;
  asp_provider?: string;
  sandbox_mode?: number;
  base_url?: string;
  sla_days?: number;
  archive_retention_years?: number;
};

export default function TaxSettings() {
  const { data, error, isLoading, mutate } = useDoc<Settings>("UAE Tax Settings", "UAE Tax Settings");

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;

  return (
    <>
      <PageHead title={t("nav.taxSettings")} sub={t("tax.sub")} />
      <Card title={t("tax.asp")}>
        <ReadRow k={t("tax.provider")} v={data?.asp_provider || "—"} />
        <ReadRow k={t("tax.sandbox")} v={data?.sandbox_mode ? t("yes") : t("no")} />
        <ReadRow k={t("tax.baseUrl")} v={data?.base_url || "—"} />
        <ReadRow k={t("tax.sla")} v={data?.sla_days != null ? String(data.sla_days) : "—"} />
        <ReadRow k={t("tax.retention")} v={data?.archive_retention_years != null ? String(data.archive_retention_years) : "—"} />
      </Card>
    </>
  );
}
