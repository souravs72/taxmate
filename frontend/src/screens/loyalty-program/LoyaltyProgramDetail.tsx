/**
 * Loyalty Program detail.
 * Importers: App.tsx route /loyalty-programs/:name.
 * API: taxmate.api.resource.get on Loyalty Program.
 * Schema: name, loyalty_program_type, company, from_date, to_date, conversion_factor.
 * User: "Implement the plan… complete all the to-dos."
 */
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead } from "../../components/ui";
import DetailActions from "../../components/DetailActions";
import DocTabShell from "../../components/DocTabShell";

type Doc = {
  name: string;
  loyalty_program_type?: string;
  company?: string;
  from_date?: string;
  to_date?: string;
  conversion_factor?: number;
  expiry_duration?: number;
};

export default function LoyaltyProgramDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.loyaltyProgram, name);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  return (
    <>
      <PageHead
        title={data.name}
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/loyalty-programs")}>{t("lp.title")}</button>}
        actions={
          <DetailActions
            doctype={DT.loyaltyProgram}
            name={name}
            draft={true}
            submitted={false}
            canSubmit={false}
            canCancel={false}
            canWrite={canWrite(session)}
            onEdit={() => nav(`/loyalty-programs/${encodeURIComponent(name)}/edit`)}
            busy={false}
          />
        }
      />

      <DocTabShell doctype={DT.loyaltyProgram} name={name} doc={data as unknown as Record<string, unknown>}>
      </DocTabShell>
    </>
  );
}
