/**
 * AddressDetail — Phase 12.
 * Callers: App.tsx /addresses/:name
 * API: taxmate.api.resource.get on "Address" (_CORE_MASTERS)
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

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/addresses")}>
            {t("addr.title")}
          </button>
        }
        title={data.address_title || data.name}
        actions={
          <>
            <DocHistory doctype="Address" name={name} />
            <IfCanWrite>
              <button
                type="button"
                className="btn ghost"
                onClick={() => nav(`/addresses/${encodeURIComponent(name)}/edit`)}
              >
                {t("edit")}
              </button>
            </IfCanWrite>
          </>
        }
      />

      <DocTabShell doctype={"Address"} name={name} doc={data as unknown as Record<string, unknown>}>
      </DocTabShell>
    </>
  );
}
