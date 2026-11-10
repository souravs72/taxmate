/**
 * ContactDetail — Phase 12.
 * Callers: App.tsx /contacts/:name
 * API: taxmate.api.resource.get on "Contact" (_CORE_MASTERS)
 */
import { useNavigate, useParams } from "react-router-dom";

import { useDoc } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead } from "../../components/ui";
import DocHistory from "../../components/DocHistory";
import DocTabShell from "../../components/DocTabShell";
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
        actions=<DocHistory doctype="Contact" name={name} />
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

      <DocTabShell doctype={"Contact"} name={name} doc={data as unknown as Record<string, unknown>}>
      </DocTabShell>
    </>
  );
}
