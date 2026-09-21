/**
 * Importers: App.tsx /ubo/:name. Callers: UBO list, search.
 * API: catalog get parent UAE UBO Register (beneficial_owners nested UAE UBO Owner).
 * Schema: owners full_name, ownership_percentage, nationality, is_active, control_basis.
 * User: "Task 15: CT filing, ESR, UBO, late filing — one DocType list at a time"
 */
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";

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
  const owners = data.beneficial_owners ?? [];
  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/ubo")}>{t("nav.ubo")}</button>}
        title={data.company || data.name}
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <Pill cls={uboPill(data.status)}>{data.status || "—"}</Pill>
        </p>
      </PageHead>
      <Card>
        <div className="fg">
          <ReadRow k={t("coa.company")} v={data.company || "—"} />
          <ReadRow k={t("esr.col.auth")} v={data.licence_authority || "—"} />
          <ReadRow k={t("ubo.col.reviewed")} v={date(data.last_reviewed_on)} />
        </div>
        {data.notes ? (
          <div>
            <ReadRow k={t("v201.notes")} v={data.notes} />
          </div>
        ) : null}
      </Card>
      <Card title={t("ubo.owners")}>
        {owners.length === 0 ? <p className="sub">{t("ubo.noOwners")}</p> : (
          <div className="twrap"><table>
            <thead><tr><th>{t("ubo.owner")}</th><th>{t("ubo.type")}</th><th className="n">{t("ubo.pct")}</th><th>{t("ubo.control")}</th><th>{t("so.col.status")}</th></tr></thead>
            <tbody>{owners.map((o) => (
              <tr key={o.name}>
                <td>{o.full_name || "—"}</td>
                <td>{o.person_type || "—"}</td>
                <td className="n">{o.ownership_percentage ?? "—"}</td>
                <td>{o.control_basis || "—"}</td>
                <td><Pill cls={o.is_active ? "p-done" : "p-flat"}>{o.is_active ? t("wh.active") : t("ubo.inactive")}</Pill></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
