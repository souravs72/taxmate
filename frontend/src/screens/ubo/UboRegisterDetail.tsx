/**
 * UBO register detail.
 */
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { t, tStatus } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import DocHistory from "../../components/DocHistory";
import DocTabShell from "../../components/DocTabShell";

type Owner = {
  name?: string; full_name?: string; person_type?: string; ownership_percentage?: number;
  nationality?: string; control_basis?: string; is_active?: number; is_nominee?: number;
};
type Doc = {
  name: string; company?: string; licence_authority?: string; status?: string;
  last_reviewed_on?: string; notes?: string; beneficial_owners?: Owner[];
};

function uboPill(status?: string): string {
  if (status === "Overdue") return "p-overdue";
  if (status === "Update Reporting Due") return "p-warn";
  return "p-done";
}

export default function UboRegisterDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.uboRegister, name);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;
  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/ubo")}>{t("nav.ubo")}</button>}
        title={data.company || data.name}
        actions={<DocHistory doctype={DT.uboRegister} name={name} />}
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <Pill cls={uboPill(data.status)}>{tStatus(data.status)}</Pill>
        </p>
      </PageHead>

      <DocTabShell doctype={DT.uboRegister} name={name} doc={data as unknown as Record<string, unknown>}>
      </DocTabShell>
    </>
  );
}
