import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "../../lib/frappe";
import { CORE_BOOK_REPORTS, UAE_CATALOG_REPORTS } from "../../lib/bookReports";
import { t } from "../../i18n/strings";
import { Card, Empty, ErrorBox, Loading, PageHead } from "../../components/ui";

type CatalogReport = { label: string; report: string };

export default function ReportList() {
  const nav = useNavigate();
  const catalog = useFrappeGetCall<{ message: CatalogReport[] }>(METHOD.listReports);
  const books = useMemo(() => {
    const all = catalog.data?.message ?? [];
    const allowed = new Set<string>(CORE_BOOK_REPORTS);
    return all.filter((row) => allowed.has(row.report));
  }, [catalog.data]);
  const uae = useMemo(() => {
    const all = catalog.data?.message ?? [];
    const allowed = new Set<string>(UAE_CATALOG_REPORTS);
    return all.filter((row) => allowed.has(row.report));
  }, [catalog.data]);

  return (
    <>
      <PageHead title={t("rpt.title")} />
      {catalog.error && <ErrorBox error={catalog.error} onRetry={() => catalog.mutate()} />}
      {catalog.isLoading ? <Loading /> : books.length + uae.length === 0 ? (
        <Card><Empty label={t("rpt.empty")} /></Card>
      ) : (
        <>
          {books.length > 0 && (
            <div className="stack">
              <h2 style={{ margin: "0 0 8px", fontSize: 13.5, fontWeight: 600 }}>{t("rpt.books")}</h2>
              {books.map((row) => (
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
          {uae.length > 0 && (
            <div className="stack" style={{ marginTop: 24 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 13.5, fontWeight: 600 }}>{t("rpt.uae")}</h2>
              {uae.map((row) => (
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
      )}
    </>
  );
}
