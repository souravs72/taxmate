/**
 * Own profile. Catalog get_profile / update_profile / change_password.
 * Importers: App.tsx /profile. Callers: rail footer, search /profile.
 * Schema: User first_name, last_name, email, mobile_no; password via change_password.
 * User: "how will someone manage password, and other things when they login?
 * And other details such as phone, etc?"
 */
import { useEffect, useState } from "react";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

import { METHOD } from "../../lib/frappe";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormLayout } from "../../components/form";

type Profile = {
  name: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  mobile_no?: string | null;
};

export default function Profile() {
  const load = useFrappeGetCall<{ message: Profile }>(METHOD.getProfile);
  const save = useFrappePostCall<{ message: Profile }>(METHOD.updateProfile);
  const password = useFrappePostCall<{ message: { ok: string } }>(METHOD.changePassword);
  const row = load.data?.message;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);

  useEffect(() => {
    if (!row) return;
    const parts = (row.full_name || "").trim().split(/\s+/).filter(Boolean);
    setFirstName(row.first_name || parts[0] || "");
    setLastName(row.last_name || parts.slice(1).join(" "));
    setMobile(row.mobile_no || "");
  }, [row]);

  async function saveDetails() {
    if (!firstName.trim()) return;
    setBusy(true);
    setSaved(false);
    try {
      await save.call({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        mobile_no: mobile.trim(),
      });
      await load.mutate();
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    if (!current || !next || next !== confirm) return;
    setPwBusy(true);
    setPwSaved(false);
    try {
      await password.call({ old_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setPwSaved(true);
    } finally {
      setPwBusy(false);
    }
  }

  if (load.isLoading && !row) return <Loading />;

  return (
    <>
      <PageHead title={t("profile.title")} />
      {load.error && <ErrorBox error={load.error} onRetry={() => load.mutate()} />}
      {save.error && <ErrorBox error={save.error} />}
      {password.error && <ErrorBox error={password.error} />}
      <FormLayout>
        <Card title={t("profile.details")}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void saveDetails(); }}>
            <div className="grid2">
              <Field label={t("team.firstName")} required htmlFor="me-first">
                <input id="me-first" name="first_name" className="ctl" value={firstName}
                  autoComplete="given-name" onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field label={t("team.lastName")} htmlFor="me-last">
                <input id="me-last" name="last_name" className="ctl" value={lastName}
                  autoComplete="family-name" onChange={(e) => setLastName(e.target.value)} />
              </Field>
              <Field label={t("team.col.email")} htmlFor="me-email">
                <input id="me-email" className="ctl readonly" value={row?.email || ""} readOnly />
              </Field>
              <Field label={t("team.col.mobile")} htmlFor="me-mobile">
                <input id="me-mobile" name="mobile_no" className="ctl" type="tel" value={mobile}
                  autoComplete="tel" onChange={(e) => setMobile(e.target.value)} />
              </Field>
            </div>
            <div className="acts">
              <button type="submit" className="btn" disabled={busy || !firstName.trim()}>
                {busy ? t("soc.saving") : t("profile.save")}
              </button>
              {saved && <span className="hint">{t("profile.saved")}</span>}
            </div>
          </form>
        </Card>
        <Card title={t("profile.password")}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void savePassword(); }}>
            <Field label={t("profile.current")} required htmlFor="me-current">
              <input id="me-current" className="ctl" type="password" value={current}
                autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} />
            </Field>
            <div className="grid2">
              <Field label={t("profile.new")} required htmlFor="me-new">
                <input id="me-new" className="ctl" type="password" value={next}
                  autoComplete="new-password" onChange={(e) => setNext(e.target.value)} />
              </Field>
              <Field label={t("profile.confirm")} required htmlFor="me-confirm">
                <input id="me-confirm" className="ctl" type="password" value={confirm}
                  autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} />
              </Field>
            </div>
            <div className="acts">
              <button
                type="submit"
                className="btn"
                disabled={pwBusy || !current || !next || next !== confirm}
              >
                {pwBusy ? t("soc.saving") : t("profile.savePassword")}
              </button>
              {pwSaved && <span className="hint">{t("profile.saved")}</span>}
            </div>
          </form>
        </Card>
      </FormLayout>
    </>
  );
}
