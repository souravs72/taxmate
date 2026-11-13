/**
 * Subscription plans + trial clock.
 * API: taxmate.api.billing.list_plans + start_checkout.
 */
import { useMemo, useState } from "react";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

import { ErrorBox, Loading } from "../../components/ui";
import { METHOD } from "../../lib/frappe";
import { useSession } from "../../lib/session";

type Plan = {
  name: string;
  plan_name: string;
  is_popular?: number;
  currency?: string;
  monthly_amount: number;
  annual_amount: number;
  feature_bullets?: string;
  outlets_included?: number;
  back_office_users?: number;
  monthly_ai_scans?: number;
};

function money(amount: number, currency = "AED") {
  try {
    return new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatEnds(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

const FAQS = [
  {
    q: "When the trial ends?",
    a: "Sales, Purchase, Stock and VAT pause until the owner subscribes. Data stays. Staff are not billed separately.",
  },
  {
    q: "Card required for the trial?",
    a: "No. Pay only when you pick a plan.",
  },
  {
    q: "Monthly or annual?",
    a: "Annual is one payment and saves about two months. Prices AED, excl. VAT.",
  },
];

export default function Billing() {
  const session = useSession();
  const billing = session.billing;
  const [cycle, setCycle] = useState<"Monthly" | "Annual">("Annual");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);

  const plansCall = useFrappeGetCall<{ message: Plan[] }>(METHOD.listPlans, undefined, "tm-plans");
  const checkout = useFrappePostCall<{ message: { payment_url: string } }>(METHOD.startCheckout);

  const ordered = useMemo(() => {
    const rows = plansCall.data?.message ?? [];
    return [...rows].sort((a, b) => {
      const ao = a.name === "starter" ? 0 : a.name === "retail" ? 1 : 2;
      const bo = b.name === "starter" ? 0 : b.name === "retail" ? 1 : 2;
      return ao - bo;
    });
  }, [plansCall.data]);

  async function subscribe(plan: string) {
    if (!billing?.can_manage_billing) return;
    setBusy(plan);
    setErr(null);
    try {
      const res = await checkout.call({
        plan,
        billing_cycle: cycle,
        company: session.company || undefined,
      });
      const url = res.message?.payment_url;
      if (!url) throw new Error("No payment URL returned");
      window.location.assign(url);
    } catch (e) {
      setErr(e);
      setBusy(null);
    }
  }

  const trialActive = billing?.status === "Trial" && (billing.days_left ?? 0) > 0;
  const locked = billing?.enabled && billing.can_access === false;
  const days = billing?.days_left ?? 0;

  if (plansCall.isLoading && !plansCall.data) return <Loading label="Loading plans…" />;

  return (
    <div className="tm-billing">
      <header className="tm-bill-hero">
        {trialActive ? (
          <p className="tm-bill-kicker">Trial · {session.company}</p>
        ) : locked ? (
          <p className="tm-bill-kicker ended">Trial ended · {session.company}</p>
        ) : null}

        {trialActive ? (
          <div className="tm-trial-clock" aria-live="polite">
            <div className="tm-trial-clock-num">{days}</div>
            <div className="tm-trial-clock-meta">
              <strong>{days === 1 ? "day left" : "days left"}</strong>
              <span>{formatEnds(billing?.trial_ends_on) ? `Ends ${formatEnds(billing?.trial_ends_on)}` : "Paid plan required after"}</span>
            </div>
          </div>
        ) : (
          <h1 className="tm-billing-title">{locked ? "Subscribe to continue" : "Plans"}</h1>
        )}

        <p className="tm-billing-sub">
          {locked
            ? "Restore Sales, Purchase, Stock and VAT for this company."
            : trialActive
              ? "Paid plan required after the trial. AED, excl. VAT."
              : "AED, excl. VAT. Team seats included on the company plan."}
        </p>
      </header>

      <section className="tm-bill-plans" aria-labelledby="tm-plans-heading">
        <div className="tm-bill-plans-head">
          <h2 id="tm-plans-heading">Plans</h2>
          <div className="tm-billing-toggle" role="group" aria-label="Billing cycle">
            <button
              type="button"
              className={cycle === "Monthly" ? "on" : undefined}
              onClick={() => setCycle("Monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={cycle === "Annual" ? "on" : undefined}
              onClick={() => setCycle("Annual")}
            >
              Annual <span className="save">−2 mo</span>
            </button>
          </div>
        </div>

        {plansCall.error ? <ErrorBox error={plansCall.error} onRetry={() => plansCall.mutate()} /> : null}
        {err != null ? <ErrorBox error={err} /> : null}

        <div className="tm-billing-grid">
          {ordered.map((p) => {
            const amount = cycle === "Annual" ? p.annual_amount : p.monthly_amount;
            const period = cycle === "Annual" ? "/ year" : "/ month";
            const bullets = (p.feature_bullets || "")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            const popular = !!p.is_popular;
            const cta = busy === p.name ? "Opening…" : "Subscribe";
            return (
              <article key={p.name} className={`tm-plan-card${popular ? " popular" : ""}`}>
                {popular ? <span className="tm-plan-badge">Popular</span> : null}
                <h3>{p.plan_name}</h3>
                <p className="tm-plan-price">
                  <strong>{money(amount, p.currency || "AED")}</strong>
                  <span>{period}</span>
                </p>
                <p className="tm-plan-limits">
                  {p.outlets_included ?? "—"} outlet{(p.outlets_included ?? 1) === 1 ? "" : "s"}
                  {" · "}
                  {p.back_office_users ?? "—"} users
                  {" · "}
                  {p.monthly_ai_scans ?? "—"} scans / mo
                </p>
                <ul>
                  {bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                {billing?.can_manage_billing ? (
                  <button
                    type="button"
                    className={`btn${popular ? "" : " ghost"}`}
                    disabled={busy === p.name}
                    onClick={() => void subscribe(p.name)}
                  >
                    {cta}
                  </button>
                ) : (
                  <p className="tm-plan-ask">Owner must subscribe.</p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="tm-bill-faq" aria-labelledby="tm-faq-heading">
        <h2 id="tm-faq-heading">FAQ</h2>
        <dl>
          {FAQS.map((f) => (
            <div key={f.q} className="tm-faq-row">
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
