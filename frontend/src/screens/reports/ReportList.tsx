import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "../../lib/frappe";
import { CORE_BOOK_REPORTS } from "../../lib/bookReports";
import { t } from "../../i18n/strings";
import { Card, Empty, ErrorBox, Loading, PageHead } from "../../components/ui";

type CatalogReport = { label: string; report: string };

export default function ReportList() {
  const nav = useNavigate();
  const catalog = useFrappeGetCall<{ message: CatalogReport[] }>(METHOD.listReports);
  const rows = useMemo(() => {
    const all = catalog.data?.message ?? [];
    const allowed = new Set<string>(CORE_BOOK_REPORTS);
    return all.filter((row) => allowed.has(row.report));
  }, [catalog.data]);

  return (
    <>
      <PageHead title={t("rpt.title")} sub={t("rpt.sub")} />
      {catalog.error && <ErrorBox error={catalog.error} onRetry={() => catalog.mutate()} />}
      {catalog.isLoading ? <Loading /> : rows.length === 0 ? (
        <Card><Empty label={t("rpt.empty")} /></Card>
      ) : (
        <div className="stack">
          {rows.map((row) => (
            <Card key={row.report}>
              <button
                type="button"
                className="btn quiet"
                style={{ width: "100%", justifyContent: "flex-start", textAlign: "start" }}
                onClick={() => nav(`/reports/${encodeURIComponent(row.report)}`)}
              >
                <span style={{ display: "block", fontWeight: 600 }}>{row.label}</span>
                <span className="sub" style={{ margin: "4px 0 0" }}>{row.report}</span>
              </button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
