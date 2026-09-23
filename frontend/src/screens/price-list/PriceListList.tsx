/**
 * Price List list screen.
 * Callers: App.tsx /price-lists
 * API: taxmate.api.resource.get_list on "Price List"
 */
import { useNavigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDocList } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Empty, ErrorBox, Loading, PageHead } from "../../components/ui";
import { IfCanWrite } from "../../components/RoleGate";

type Row = { name: string; currency?: string; selling?: number; buying?: number; enabled?: number };

export default function PriceListList() {
  const nav = useNavigate();
  const list = useDocList<Row>(DT.priceList, {
    fields: ["name", "currency", "selling", "buying", "enabled"],
    orderBy: { field: "modified", order: "desc" },
    limit: 100,
  });

  if (list.isLoading) return <Loading />;
  if (list.error) return <ErrorBox error={list.error} onRetry={() => list.mutate()} />;
  const rows = list.data ?? [];

  return (
    <>
      <PageHead
        title={t("pl.title")}
        actions={
          <IfCanWrite>
            <button className="btn" onClick={() => nav("/price-lists/new")}>
              {t("pl.new")}
            </button>
          </IfCanWrite>
        }
      />
      {rows.length === 0 ? (
        <Empty label={t("pl.empty")} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("pl.col.name")}</th>
              <th>{t("pl.col.currency")}</th>
              <th>{t("pl.col.selling")}</th>
              <th>{t("pl.col.buying")}</th>
              <th>{t("pl.col.enabled")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} onClick={() => nav(`/price-lists/${encodeURIComponent(r.name)}`)}>
                <td>{r.name}</td>
                <td>{r.currency || "—"}</td>
                <td>{r.selling ? t("yes") : t("no")}</td>
                <td>{r.buying ? t("yes") : t("no")}</td>
                <td>{r.enabled ? t("yes") : t("no")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
