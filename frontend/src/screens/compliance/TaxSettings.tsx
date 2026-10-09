/**
 * Site-wide UAE e-invoice ASP settings (UAE Tax Settings Single).
 *
 * Importers: App.tsx /tax-settings. API: get_uae_tax_settings / save_uae_tax_settings
 * on get_catalog(). Not company VAT rates — those are Company Settings + Item Tax Templates.
 * User instruction: Fix Tax Settings — robust, from findings; production standard.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

import { METHOD, readableError } from "../../lib/frappe";
import { useSession } from "../../lib/session";
import { canEditTaxSettings } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { Card, CheckField, ErrorBox, Field, Loading, PageHead, ReadRow } from "../../components/ui";
import DocHistory from "../../components/DocHistory";

type Settings = {
  name?: string;
  asp_provider?: string;
  sandbox_mode?: number;
  base_url?: string;
  participant_id?: string;
  client_id?: string;
  exclude_b2c_e_invoices?: number;
  auto_draft_incoming_pi?: number;
  sla_days?: number;
  archive_retention_years?: number;
  uae_storage_note?: string;
  webhook_subscription_id?: string;
  token_expiry?: string;
  participant_details?: string;
  has_client_id?: boolean;
  has_client_secret?: boolean;
  has_auth_key?: boolean;
  has_webhook_secret?: boolean;
};

type FormState = {
  asp_provider: string;
  sandbox_mode: boolean;
  base_url: string;
  participant_id: string;
  client_id: string;
  client_secret: string;
  auth_key: string;
  webhook_secret: string;
  exclude_b2c_e_invoices: boolean;
  auto_draft_incoming_pi: boolean;
  sla_days: string;
  archive_retention_years: string;
  uae_storage_note: string;
};

function fromDoc(d: Settings): FormState {
  return {
    asp_provider: d.asp_provider || "Sandbox",
    sandbox_mode: !!d.sandbox_mode,
    base_url: d.base_url || "",
    participant_id: d.participant_id || "",
    client_id: d.client_id || "",
    client_secret: "",
    auth_key: "",
    webhook_secret: "",
    exclude_b2c_e_invoices: d.exclude_b2c_e_invoices !== 0,
    auto_draft_incoming_pi: !!d.auto_draft_incoming_pi,
    sla_days: d.sla_days != null ? String(d.sla_days) : "14",
    archive_retention_years: d.archive_retention_years != null ? String(d.archive_retention_years) : "5",
    uae_storage_note: d.uae_storage_note || "",
  };
}

function secretHint(set: boolean | undefined): string {
  return set ? t("tax.secretSet") : t("tax.secretUnset");
}

export default function TaxSettings() {
  const session = useSession();
  const canEdit = canEditTaxSettings(session);
  const errRef = useRef<HTMLDivElement>(null);
  const errTitleId = useId();

  const load = useFrappeGetCall<{ message: Settings }>(
    METHOD.getUaeTaxSettings,
    {},
    "uae-tax-settings",
    { revalidateOnFocus: false },
  );
  const saveCall = useFrappePostCall<{ message: Settings }>(METHOD.saveUaeTaxSettings);

  const doc = load.data?.message;
  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<string[] | null>(null);

  useEffect(() => {
    if (doc) setForm(fromDoc(doc));
  }, [doc]);

  useEffect(() => {
    if (saveErr && errRef.current) errRef.current.focus();
  }, [saveErr]);

  const patch = (partial: Partial<FormState>) => {
    setForm((prev) => (prev ? { ...prev, ...partial } : prev));
    setSaved(false);
  };

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !canEdit) return;
    const sla = Number(form.sla_days);
    const years = Number(form.archive_retention_years);
    const problems: string[] = [];
    if (!Number.isFinite(sla) || sla < 1) problems.push(t("tax.err.sla"));
    if (!Number.isFinite(years) || years < 5) problems.push(t("tax.err.retention"));
    if (form.asp_provider === "Flick" && !form.sandbox_mode && !form.base_url.trim()) {
      problems.push(t("tax.err.baseUrl"));
    }
    const url = form.base_url.trim();
    if (url && !/^https:\/\//i.test(url)) {
      problems.push(t("tax.err.https"));
    }
    if (problems.length) {
      setSaveErr(problems);
      return;
    }
    setSaveErr(null);
    setSaved(false);
    const payload: Record<string, unknown> = {
      asp_provider: form.asp_provider,
      sandbox_mode: form.sandbox_mode ? 1 : 0,
      base_url: form.base_url.trim(),
      participant_id: form.participant_id.trim(),
      client_id: form.client_id.trim(),
      exclude_b2c_e_invoices: form.exclude_b2c_e_invoices ? 1 : 0,
      auto_draft_incoming_pi: form.auto_draft_incoming_pi ? 1 : 0,
      sla_days: sla,
      archive_retention_years: years,
      uae_storage_note: form.uae_storage_note.trim(),
    };
    if (form.client_secret.trim()) payload.client_secret = form.client_secret.trim();
    if (form.auth_key.trim()) payload.auth_key = form.auth_key.trim();
    if (form.webhook_secret.trim()) payload.webhook_secret = form.webhook_secret.trim();
    try {
      const res = await saveCall.call({ doc: payload });
      const next = res.message;
      if (next) setForm(fromDoc(next));
      setSaved(true);
      void load.mutate();
    } catch (err) {
      setSaveErr(readableError(err));
    }
  }

  if (load.isLoading && !doc) return <Loading />;
  if (load.error) return <ErrorBox error={load.error} onRetry={() => void load.mutate()} />;
  if (!form) return <Loading />;

  const busy = saveCall.loading;

  return (
    <>
      <PageHead
        title={t("nav.taxSettings")}
        sub={t("tax.sub")}
        actions={
          <>
            <DocHistory doctype="UAE Tax Settings" name="UAE Tax Settings" />
            {canEdit ? (
              <button type="submit" form="tax-asp-form" className="btn" disabled={busy}>
                {busy ? t("soc.saving") : t("tax.save")}
              </button>
            ) : null}
          </>
        }
      />

      <p className="od-note" style={{ marginBottom: 16 }}>
        {t("tax.siteWide")}
      </p>

      <Card title={t("tax.elsewhere")} bodyClass="cbody">
        <ul className="od-note" style={{ margin: 0, paddingInlineStart: "1.2rem" }}>
          <li>
            <Link to="/company">{t("tax.link.company")}</Link>
            {" — "}
            {t("tax.link.companyHint")}
          </li>
          <li>
            <Link to="/item-tax-templates">{t("tax.link.itemTax")}</Link>
            {" — "}
            {t("tax.link.itemTaxHint")}
          </li>
          <li>
            <Link to="/vat-201">{t("tax.link.vat201")}</Link>
            {" — "}
            {t("tax.link.vat201Hint")}
          </li>
        </ul>
      </Card>

      {saveErr && (
        <div
          ref={errRef}
          className="errbox"
          role="alert"
          tabIndex={-1}
          aria-labelledby={errTitleId}
          style={{ marginBottom: 16 }}
        >
          <strong id={errTitleId}>{t("tax.err.title")}</strong>
          <ul style={{ margin: "8px 0 0", paddingInlineStart: "1.2rem" }}>
            {saveErr.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}
      {saved && !saveErr && (
        <p className="od-note" role="status" style={{ marginBottom: 16 }}>{t("tax.saved")}</p>
      )}

      <form id="tax-asp-form" onSubmit={(e) => void onSave(e)}>
        <Card title={t("tax.asp")} hint={t("tax.aspHint")}>
          <div className="grid2">
            <Field label={t("tax.provider")}>
              <select
                className="ctl"
                value={form.asp_provider}
                disabled={!canEdit}
                onChange={(e) => patch({ asp_provider: e.target.value })}
              >
                <option value="Sandbox">Sandbox</option>
                <option value="Flick">Flick</option>
              </select>
            </Field>
            <Field label={t("tax.participantId")} hint={t("tax.participantIdHint")}>
              <input
                className="ctl"
                value={form.participant_id}
                disabled={!canEdit}
                onChange={(e) => patch({ participant_id: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <Field label={t("tax.baseUrl")} hint={t("tax.baseUrlHint")}>
              <input
                className="ctl"
                type="url"
                value={form.base_url}
                disabled={!canEdit}
                onChange={(e) => patch({ base_url: e.target.value })}
                placeholder="https://"
                autoComplete="off"
              />
            </Field>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
              <CheckField
                label={t("tax.sandbox")}
                hint={t("tax.sandboxHint")}
                checked={form.sandbox_mode}
                disabled={!canEdit}
                onChange={(on) => patch({ sandbox_mode: on })}
              />
            </div>
          </div>
        </Card>

        <Card title={t("tax.mandate")} hint={t("tax.mandateHint")}>
          <div className="grid2">
            <CheckField
              label={t("tax.excludeB2c")}
              hint={t("tax.excludeB2cHint")}
              checked={form.exclude_b2c_e_invoices}
              disabled={!canEdit}
              onChange={(on) => patch({ exclude_b2c_e_invoices: on })}
            />
            <CheckField
              label={t("tax.autoDraftPi")}
              hint={t("tax.autoDraftPiHint")}
              checked={form.auto_draft_incoming_pi}
              disabled={!canEdit}
              onChange={(on) => patch({ auto_draft_incoming_pi: on })}
            />
            <Field label={t("tax.sla")} hint={t("tax.slaHint")}>
              <input
                className="ctl"
                type="number"
                min={1}
                step={1}
                value={form.sla_days}
                disabled={!canEdit}
                onChange={(e) => patch({ sla_days: e.target.value })}
              />
            </Field>
            <Field label={t("tax.retention")} hint={t("tax.retentionHint")}>
              <input
                className="ctl"
                type="number"
                min={5}
                step={1}
                value={form.archive_retention_years}
                disabled={!canEdit}
                onChange={(e) => patch({ archive_retention_years: e.target.value })}
              />
            </Field>
            <Field label={t("tax.storageNote")}>
              <textarea
                className="ctl"
                rows={3}
                value={form.uae_storage_note}
                disabled={!canEdit}
                onChange={(e) => patch({ uae_storage_note: e.target.value })}
              />
            </Field>
          </div>
        </Card>

        <Card title={t("tax.auth")} hint={t("tax.authHint")}>
          <div className="grid2">
            <Field label={t("tax.clientId")}>
              <input
                className="ctl"
                value={form.client_id}
                disabled={!canEdit}
                onChange={(e) => patch({ client_id: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <Field label={t("tax.clientSecret")} hint={secretHint(doc?.has_client_secret)}>
              <input
                className="ctl"
                type="password"
                value={form.client_secret}
                disabled={!canEdit}
                onChange={(e) => patch({ client_secret: e.target.value })}
                placeholder={doc?.has_client_secret ? "••••••••" : ""}
                autoComplete="new-password"
              />
            </Field>
            <Field label={t("tax.authKey")} hint={secretHint(doc?.has_auth_key)}>
              <input
                className="ctl"
                type="password"
                value={form.auth_key}
                disabled={!canEdit}
                onChange={(e) => patch({ auth_key: e.target.value })}
                placeholder={doc?.has_auth_key ? "••••••••" : ""}
                autoComplete="new-password"
              />
            </Field>
            {doc?.token_expiry ? (
              <ReadRow k={t("tax.tokenExpiry")} v={doc.token_expiry} />
            ) : null}
          </div>
        </Card>

        <Card title={t("tax.webhooks")} hint={t("tax.webhooksHint")}>
          <div className="grid2">
            <Field label={t("tax.webhookSecret")} hint={secretHint(doc?.has_webhook_secret)}>
              <input
                className="ctl"
                type="password"
                value={form.webhook_secret}
                disabled={!canEdit}
                onChange={(e) => patch({ webhook_secret: e.target.value })}
                placeholder={doc?.has_webhook_secret ? "••••••••" : ""}
                autoComplete="new-password"
              />
            </Field>
            <ReadRow k={t("tax.webhookSub")} v={doc?.webhook_subscription_id || "—"} />
          </div>
        </Card>

        {doc?.participant_details ? (
          <Card title={t("tax.participant")} hint={t("tax.participantHint")}>
            <pre
              className="ctl"
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 240,
                overflow: "auto",
                fontSize: 12,
              }}
            >
              {doc.participant_details}
            </pre>
          </Card>
        ) : null}

        {canEdit ? (
          <div style={{ marginTop: 8, marginBottom: 24 }}>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? t("soc.saving") : t("tax.save")}
            </button>
          </div>
        ) : (
          <p className="od-note">{t("tax.readOnly")}</p>
        )}
      </form>
    </>
  );
}
