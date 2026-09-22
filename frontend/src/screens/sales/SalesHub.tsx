import { useNavigate } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDocCount } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { PageHead, StatTile, Card, Loading, ErrorBox } from "../../components/ui";

type HomeKpi = { name: string; label: string; value: number };

function monthStart(): string {
  const d = new Date();
  return toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export default function SalesHub() {
  const nav = useNavigate();
  const session = useSession();
  const home = useFrappeGetCall<{ message: { kpis: HomeKpi[] } }>(METHOD.getHome);
  const overdue = useDocCount(DT.salesInvoice, [["status", "=", "Overdue"]]);
  const paid = useDocCount(DT.paymentEntry, [
    ["payment_type", "=", "Receive"],
    ["docstatus", "=", 1],
    ["posting_date", ">=", monthStart()],
  ]);

  const kpis = home.data?.message?.kpis ?? [];
  const draft = kpis.find((k) => k.name === "Draft Sales Invoices")?.value;
  const failed = kpis.find((k) => k.name === "Failed E-Invoices")?.value;

  return (
    <>
      <PageHead
        title={t("hub.title")}
        actions={
          <>
            <button className="btn ghost" onClick={() => nav("/customers/new")}>{t("hub.newCustomer")}</button>
            <button className="btn ghost" onClick={() => nav("/payments/new")}>{t("hub.receive")}</button>
            <button className="btn" onClick={() => nav("/invoices/new")}>{t("hub.newSale")}</button>
          </>
        }
      />

      {home.error && <ErrorBox error={home.error} onRetry={() => home.mutate()} />}
      {home.isLoading ? <Loading /> : (
        <div className="tiles">
          <button className="tilebtn" onClick={() => nav("/invoices?status=Draft")}>
            <StatTile colour="var(--warn)" tint="rgba(217,119,6,.12)"
              icon='<path d="M3.5 2.5h8l3 3v10h-11z"/>'
              label={t("hub.draft")} value={draft ?? "—"} foot={t("hub.draftFoot")} />
          </button>
          <button className="tilebtn" onClick={() => nav("/receivables")}>
            <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)"
              icon='<path d="M9 2.5 16 15H2z"/><path d="M9 7v3.5M9 12.2v.6"/>'
              label={t("hub.overdue")} value={overdue.data ?? "—"} foot={t("hub.overdueFoot")} />
          </button>
          <button className="tilebtn" onClick={() => nav("/invoices?einvoice=Failed")}>
            <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)"
              icon='<path d="M9 2.5l5.5 2.2V10c0 3.3-2.4 5.7-5.5 6.5C5.9 15.7 3.5 13.3 3.5 10V4.7z"/>'
              label={t("hub.failed")} value={failed ?? "—"} foot={t("hub.failedFoot")} />
          </button>
          <button className="tilebtn" onClick={() => nav("/payments")}>
            <StatTile colour="var(--ok)" tint="rgba(22,163,74,.13)"
              icon='<path d="M2.5 5h13v8h-13z"/><path d="M2.5 8h13"/>'
              label={t("hub.paid")} value={paid.data ?? "—"}
              foot={`${session.currency || "—"} · ${t("hub.paidFoot")}`} />
          </button>
        </div>
      )}

      <Card title={t("hub.daily")}>
        <p className="sub" style={{ margin: 0 }}>{t("hub.dailyBody")}</p>
      </Card>
    </>
  );
}
