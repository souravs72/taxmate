/**
 * Price List detail view showing prices by item.
 * Callers: App.tsx /price-lists/:name
 * API: taxmate.api.resource.get on "Price List"; get_list on "Item Price" filtered by price list.
 */
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useDocList } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead } from "../../components/ui";
import DetailActions from "../../components/DetailActions";

type PriceDoc = { name: string; price_list_name?: string; currency?: string; selling?: number; buying?: number; enabled?: number };
type PriceRow = { name: string; item_code?: string; price_list_rate?: number; uom?: string; customer?: string; supplier?: string };

export default function PriceListDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const doc = useDoc<PriceDoc>(DT.priceList, name, name);
  const prices = useDocList<PriceRow>(DT.itemPrice, {
    fields: ["name", "item_code", "price_list_rate", "uom", "customer", "supplier"],
    filters: [["price_list", "=", name]],
    orderBy: { field: "item_code", order: "asc" },
    limit: 200,
  });

  if (doc.isLoading) return <Loading />;
  if (doc.error) return <ErrorBox error={doc.error} onRetry={() => doc.mutate()} />;
  const d = doc.data;
  if (!d) return null;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/price-lists")}>
            {t("pl.title")}
          </button>
        }
        title={d.price_list_name || d.name}
        actions={
          <DetailActions
            draft
            canSubmit={false}
            canCancel={false}
            canWrite
            busy={false}
            onEdit={() => nav(`/price-lists/${encodeURIComponent(name)}/edit`)}
          />
        }
      />
      <Card title={t("pl.info")}>
        <div className="fg">
          <div className="kv-row">
            <span className="kv-label">{t("pl.col.currency")}</span>
            <span>{d.currency || "—"}</span>
          </div>
          <div className="kv-row">
            <span className="kv-label">{t("pl.col.selling")}</span>
            <span>{d.selling ? t("yes") : t("no")}</span>
          </div>
          <div className="kv-row">
            <span className="kv-label">{t("pl.col.buying")}</span>
            <span>{d.buying ? t("yes") : t("no")}</span>
          </div>
          <div className="kv-row">
            <span className="kv-label">{t("pl.col.enabled")}</span>
            <span>{d.enabled ? t("yes") : t("no")}</span>
          </div>
        </div>
      </Card>
      <Card title={t("pl.prices")}>
        {prices.isLoading ? (
          <Loading />
        ) : (prices.data ?? []).length === 0 ? (
          <p style={{ color: "var(--faint)" }}>{t("pl.noPrices")}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("pl.price.item")}</th>
                <th>{t("pl.price.rate")}</th>
                <th>{t("pl.price.uom")}</th>
                <th>{t("pl.price.customer")}</th>
                <th>{t("pl.price.supplier")}</th>
              </tr>
            </thead>
            <tbody>
              {(prices.data ?? []).map((r) => (
                <tr key={r.name}>
                  <td>{r.item_code || "—"}</td>
                  <td>{r.price_list_rate ?? "—"}</td>
                  <td>{r.uom || "—"}</td>
                  <td>{r.customer || "—"}</td>
                  <td>{r.supplier || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
