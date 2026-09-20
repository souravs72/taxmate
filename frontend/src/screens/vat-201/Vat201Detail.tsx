/**
 * Importers: App.tsx /vat-201/:name. Callers: list row, dashboard deadline queue, search.
 * API: taxmate.api.resource.get (parent includes boxes); generate_vat_201; taxmate.api.workflow.submit.
 * Schema: UAE VAT 201 Filing Log + child UAE VAT 201 Box Detail (box_no, legend, amount, vat_amount).
 * User: "Task 14: VAT 201 list + detail (then wire dashboard rows to it)"
 */
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales } from "../../lib/roles";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow, SumRow } from "../../components/ui";
import { FormLayout } from "../../components/form";

type Box = {
  name?: string;
  box_no?: string;
  legend?: string;
  amount?: number;
  vat_amount?: number;
  is_subtotal?: number;
};

type Doc = {
  name: string;
  company?: string;
  period_start?: string;
  period_end?: string;
  filing_due_date?: string;
  status?: string;
  deadline_status?: string;
  company_trn?: string;
  vat_group?: string;
  tax_currency?: string;
  net_vat_due?: number;
  generated_on?: string;
  filed_on?: string;
  filed_by?: string;
  notes?: string;
  docstatus?: 0 | 1 | 2;
  boxes?: Box[];
};

function statusPill(status?: string): string {
  if (status === "Filed") return "p-done";
  if (status === "Reviewed") return "p-open";
  return "p-draft";
}

function deadlinePill(status?: string): string {
  if (status === "Overdue") return "p-overdue";
  if (status === "Due") return "p-warn";
  if (status === "Filed") return "p-done";
  return "p-open";
}

export default function Vat201Detail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.vat201, name);
  const generate = useFrappePostCall(METHOD.generateVat201);
  const submitCall = useFrappePostCall(METHOD.submit);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const cur = data.tax_currency || session.currency || "";
  const draft = data.docstatus === 0;
  const canSubmit = canSubmitSales(session.roles);
  const boxes = data.boxes ?? [];
  const busyError = generate.error || submitCall.error;

  async function regenerate() {
    await generate.call({ name });
    await mutate();
  }

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/vat-201")}>
            {t("nav.vat201")}
          </button>
        }
        title={data.name}
        actions={
          <>
            {draft && (
              <button type="button" className="btn ghost" disabled={generate.loading}
                onClick={() => void regenerate()}>
                {generate.loading ? t("soc.saving") : t("v201.generate")}
              </button>
            )}
            {draft && canSubmit && (
              <button type="button" className="btn" disabled={submitCall.loading}
                onClick={() => void submitCall.call({ doc: { doctype: DT.vat201, name } }).then(() => mutate())}>
                {t("inv.submit")}
              </button>
            )}
          </>
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <Pill cls={statusPill(data.status)}>{data.status ? t(`v201.status.${data.status}`) : "—"}</Pill>
          <Pill cls={deadlinePill(data.deadline_status)}>{data.deadline_status || "—"}</Pill>
        </p>
      </PageHead>
      {busyError && <ErrorBox error={busyError} />}
      <FormLayout
        aside={
          <Card title={t("v201.summary")}>
            <SumRow k={t("v201.col.net")} v={`${cur} ${money(data.net_vat_due)}`} />
            <ReadRow k={t("v201.col.due")} v={date(data.filing_due_date)} />
            <ReadRow k={t("v201.generated")} v={data.generated_on ? date(data.generated_on) : "—"} />
            <ReadRow k={t("v201.filedOn")} v={data.filed_on ? date(data.filed_on) : "—"} />
            <ReadRow k={t("v201.filedBy")} v={data.filed_by || "—"} />
          </Card>
        }
      >
        <Card>
          <ReadRow k={t("coa.company")} v={data.company || "—"} />
          <ReadRow k={t("v201.col.period")} v={`${date(data.period_start)} – ${date(data.period_end)}`} />
          <ReadRow k={t("v201.trn")} v={data.company_trn || "—"} />
          <ReadRow k={t("v201.group")} v={data.vat_group || "—"} />
          {data.notes ? <ReadRow k={t("v201.notes")} v={data.notes} /> : null}
        </Card>
        <Card title={t("v201.boxes")}>
          {boxes.length === 0 ? (
            <p className="sub">{t("v201.noBoxes")}</p>
          ) : (
            <div className="twrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("v201.box")}</th>
                    <th>{t("v201.legend")}</th>
                    <th className="n">{t("v201.amount")}</th>
                    <th className="n">{t("v201.vat")}</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes.map((b) => (
                    <tr key={b.name || b.box_no}>
                      <td className="ordno">{b.box_no || "—"}</td>
                      <td>{b.legend || "—"}</td>
                      <td className="n">{money(b.amount)}</td>
                      <td className="n">{money(b.vat_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </FormLayout>
    </>
  );
}
