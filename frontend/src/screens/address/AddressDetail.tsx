/**
 * AddressDetail — Phase 12.
 * Callers: App.tsx /addresses/:name
 * API: taxmate.api.resource.get on "Address" (_CORE_MASTERS)
 */
import { useNavigate, useParams } from "react-router-dom";

import { useDoc } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, ReadRow } from "../../components/ui";
import { IfCanWrite } from "../../components/RoleGate";

type LinkEntry = { link_doctype?: string; link_name?: string };
type Doc = {
  name: string;
  address_title?: string;
  address_type?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  emirate?: string;
  country?: string;
  email_id?: string;
  phone?: string;
  links?: LinkEntry[];
};

export default function AddressDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const { data, error, isLoading, mutate } = useDoc<Doc>("Address", name);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const addr = [data.address_line1, data.address_line2, data.city, data.emirate, data.country]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/addresses")}>
            {t("addr.title")}
          </button>
        }
        title={data.address_title || data.name}
      >
        <IfCanWrite>
          <button
            className="btn ghost"
            onClick={() => nav(`/addresses/${encodeURIComponent(name)}/edit`)}
          >
            {t("edit")}
          </button>
        </IfCanWrite>
      </PageHead>
      <Card>
        <div className="fg">
          <ReadRow k={t("addr.col.type")} v={data.address_type || "—"} />
          <ReadRow k={t("addr.col.line1")} v={addr || "—"} />
          {data.email_id ? <ReadRow k={t("addr.col.email")} v={data.email_id} /> : null}
          {data.phone ? <ReadRow k={t("addr.col.phone")} v={data.phone} /> : null}
        </div>
      </Card>
      {(data.links ?? []).length > 0 && (
        <Card title={t("addr.links")}>
          <div className="fg">
            {(data.links ?? []).map((l, i) => (
              <ReadRow key={i} k={l.link_doctype || ""} v={l.link_name || "—"} />
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
