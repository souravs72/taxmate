/**
 * UBO register detail.
 */
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";
import DocHistory from "../../components/DocHistory";
import LineItems, { type LineField } from "../../components/LineItems";

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
        actions={<DocHistory doctype={DT.uboRegister} name={name} />}
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
          /* A list of people, but still a flat read-only table: five columns,
             one row per owner, no totals. Collapse off so nationality-level
             detail is not hidden behind a toggle on a register you read. */
          <LineItems<Owner>
            rows={owners}
            collapse={false}
            fields={[
              {
                key: "owner", label: t("ubo.owner"), slot: "title",
                render: (o) => <>{o.full_name || "—"}</>,
              },
              {
                key: "type", label: t("ubo.type"),
                render: (o) => <>{o.person_type || "—"}</>,
              },
              {
                key: "pct", label: t("ubo.pct"), slot: "primary", numeric: true,
                render: (o) => <>{o.ownership_percentage ?? "—"}</>,
              },
              {
                key: "control", label: t("ubo.control"),
                render: (o) => <>{o.control_basis || "—"}</>,
              },
              {
                key: "status", label: t("so.col.status"),
                render: (o) => (
                  <Pill cls={o.is_active ? "p-done" : "p-flat"}>{o.is_active ? t("wh.active") : t("ubo.inactive")}</Pill>
                ),
              },
            ] as LineField<Owner>[]}
          />
        )}
      </Card>
    </>
  );
}
