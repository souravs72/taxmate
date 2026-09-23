/**
 * Company Settings screen.
 *
 * Owner / Provider can read & save the Company document.
 * Accountant can read only (canManageCompany returns false).
 *
 * Fields: company_name, abbr (read-only once set), tax_id (TRN), country,
 *         default_currency, phone_no, email, website, accounts_frozen_till.
 *
 * API: taxmate.api.resource.get + taxmate.api.resource.save (via DT.company).
 * Both methods are in the TaxMate whitelist catalog.
 */

import { useState } from "react";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD, readableError } from "../../lib/frappe";
import { useSession } from "../../lib/session";
import { canManageCompany } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead } from "../../components/ui";

type CompanyDoc = {
  name: string;
  company_name: string;
  abbr: string;
  tax_id?: string | null;
  country?: string | null;
  default_currency?: string | null;
  phone_no?: string | null;
  email?: string | null;
  website?: string | null;
  date_of_establishment?: string | null;
  accounts_frozen_till?: string | null;
};

export default function CompanySettings() {
  const session = useSession();
  const canSave = canManageCompany(session);
  const company = session.company ?? "";

  const res = useFrappeGetCall<{ message: CompanyDoc }>(
    METHOD.get,
    { doctype: DT.company, name: company },
    company ? `company-${company}` : null,
    { revalidateOnFocus: false },
  );
  const save = useFrappePostCall<{ message: string }>(METHOD.save);

  const doc = res.data?.message;
  const [form, setForm] = useState<Partial<CompanyDoc>>({});
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<string[] | null>(null);

  // Merge server doc with local edits
  const val = (field: keyof CompanyDoc): string =>
    String((field in form ? form[field] : doc?.[field]) ?? "");

  const set = (field: keyof CompanyDoc) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setSaveErr(null);
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || !doc) return;
    setSaveErr(null);
    setSaved(false);
    try {
      await save.call({
        doctype: DT.company,
        name: doc.name,
        ...form,
      });
      setSaved(true);
      setForm({});
      void res.mutate();
    } catch (err) {
      setSaveErr(readableError(err));
    }
  }

  if (!company) return <div className="page"><p className="od-note">{t("od.noAccess")}</p></div>;
  if (res.error) return <div className="page"><ErrorBox error={res.error} onRetry={() => void res.mutate()} /></div>;
  if (!doc) return <div className="page"><Loading /></div>;

  const abbr = doc.abbr;

  return (
    <div className="odash">
      <PageHead title={t("nav.companySettings")} sub={doc.company_name} />

      <form onSubmit={(e) => void handleSave(e)}>
        <section className="card">
          <div className="chead"><h2>{t("cs.identity")}</h2></div>
          <div className="cbody">
            <div className="grid2">
              <div className="f">
                <label>{t("cs.companyName")} <span className="req">*</span></label>
                <input className="ctl" value={val("company_name")} onChange={set("company_name")} disabled={!canSave} required />
              </div>
              <div className="f">
                <label>{t("cs.abbr")}</label>
                {/* abbr is read-only once set */}
                <input className={`ctl${abbr ? " readonly" : ""}`} value={val("abbr")} onChange={set("abbr")} disabled={!canSave || !!abbr} readOnly={!!abbr} />
                {abbr && <span className="f help">{t("cs.abbrLocked")}</span>}
              </div>
              <div className="f">
                <label>{t("cs.taxId")}</label>
                <input className="ctl" value={val("tax_id")} onChange={set("tax_id")} disabled={!canSave} placeholder="100XXXXXXXXX0003" />
              </div>
              <div className="f">
                <label>{t("cs.country")}</label>
                <input className="ctl" value={val("country")} onChange={set("country")} disabled={!canSave} />
              </div>
              <div className="f">
                <label>{t("cs.currency")}</label>
                <input className="ctl" value={val("default_currency")} onChange={set("default_currency")} disabled={!canSave} />
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="chead"><h2>{t("cs.contact")}</h2></div>
          <div className="cbody">
            <div className="grid2">
              <div className="f">
                <label>{t("cs.phone")}</label>
                <input className="ctl" type="tel" value={val("phone_no")} onChange={set("phone_no")} disabled={!canSave} />
              </div>
              <div className="f">
                <label>{t("cs.email")}</label>
                <input className="ctl" type="email" value={val("email")} onChange={set("email")} disabled={!canSave} />
              </div>
              <div className="f">
                <label>{t("cs.website")}</label>
                <input className="ctl" type="url" value={val("website")} onChange={set("website")} disabled={!canSave} placeholder="https://" />
              </div>
              {doc.date_of_establishment !== undefined && (
                <div className="f">
                  <label>{t("cs.dateOfEstablishment")}</label>
                  <input className="ctl" type="date" value={val("date_of_establishment")} onChange={set("date_of_establishment")} disabled={!canSave} />
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="card">
          <div className="chead"><h2>{t("cs.booksLock")}</h2></div>
          <div className="cbody">
            <div className="f" style={{ maxWidth: 240 }}>
              <label>{t("cs.frozenTill")}</label>
              <input
                className="ctl"
                type="date"
                value={val("accounts_frozen_till")}
                onChange={set("accounts_frozen_till")}
                disabled={!canSave}
              />
              <span className="f help">{t("cs.frozenTillHelp")}</span>
            </div>
          </div>
        </section>

        {saveErr && (
          <div className="card">
            <div className="cbody">
              {saveErr.map((e, i) => <p key={i} className="od-bad">{e}</p>)}
            </div>
          </div>
        )}

        {saved && (
          <div className="card">
            <div className="cbody"><p className="od-ok">{t("cs.saved")}</p></div>
          </div>
        )}

        {canSave && (
          <div style={{ display: "flex", gap: 10, paddingBlockStart: 4 }}>
            <button type="submit" className="btn" disabled={save.loading || Object.keys(form).length === 0}>
              {save.loading ? "…" : t("common.save")}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
