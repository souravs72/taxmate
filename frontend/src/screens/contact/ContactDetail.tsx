/**
 * ContactDetail — Phase 12.
 * Callers: App.tsx /contacts/:name
 * API: taxmate.api.resource.get on "Contact" (_CORE_MASTERS)
 */
import { useNavigate, useParams } from "react-router-dom";

import { useDoc } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, ReadRow } from "../../components/ui";
import { IfCanWrite } from "../../components/RoleGate";

type LinkEntry = { link_doctype?: string; link_name?: string };
type Doc = {
  name: string;
  first_name?: string;
  last_name?: string;
  email_id?: string;
  phone?: string;
  mobile_no?: string;
  gender?: string;
  links?: LinkEntry[];
};

export default function ContactDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const { data, error, isLoading, mutate } = useDoc<Doc>("Contact", name);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.name;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/contacts")}>
            {t("cnt.title")}
          </button>
        }
        title={fullName}
      >
        <IfCanWrite>
          <button
            className="btn ghost"
            onClick={() => nav(`/contacts/${encodeURIComponent(name)}/edit`)}
          >
            {t("edit")}
          </button>
        </IfCanWrite>
      </PageHead>
      <Card>
        <div className="fg">
          {data.gender ? <ReadRow k={t("cnt.col.gender")} v={data.gender} /> : null}
          {data.email_id ? <ReadRow k={t("cnt.col.email")} v={data.email_id} /> : null}
          {data.phone ? <ReadRow k={t("cnt.col.phone")} v={data.phone} /> : null}
          {data.mobile_no ? <ReadRow k={t("cnt.col.mobile")} v={data.mobile_no} /> : null}
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
