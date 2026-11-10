/**
 * Price List detail view showing prices by item.
 * Callers: App.tsx /price-lists/:name
 * API: taxmate.api.resource.get on "Price List"; get_list on "Item Price" filtered by price list.
 */
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead } from "../../components/ui";
import DetailActions from "../../components/DetailActions";
import DocTabShell from "../../components/DocTabShell";

type PriceDoc = { name: string; price_list_name?: string; currency?: string; selling?: number; buying?: number; enabled?: number };

export default function PriceListDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const doc = useDoc<PriceDoc>(DT.priceList, name, name);

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
            doctype={DT.priceList}
            name={name}
            draft
            canSubmit={false}
            canCancel={false}
            canWrite
            busy={false}
            onEdit={() => nav(`/price-lists/${encodeURIComponent(name)}/edit`)}
          />
        }
      />

      <DocTabShell doctype={DT.priceList} name={name} doc={d as unknown as Record<string, unknown>}>
      </DocTabShell>
    </>
  );
}
