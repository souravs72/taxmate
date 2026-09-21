/**
 * Invite a teammate. Catalog invite_user — User is not a resource doctype.
 * Importers: App.tsx /team/new. Owner only.
 * Schema: email, first_name, last_name, mobile_no, spa_role.
 * User: "as many fields possible as necessary. Not just the mandatory fields."
 * "No verbosity on any screen." "frontend will not have Administrator role.
 * Instead Admin role."
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { METHOD } from "../../lib/frappe";
import { canManageUsers, SPA_ROLES, type SpaRole } from "../../lib/roles";
import { useSession } from "../../lib/session";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormLayout } from "../../components/form";

export default function TeamInvite() {
  const nav = useNavigate();
  const session = useSession();
  const owner = canManageUsers(session);
  const invite = useFrappePostCall<{ message: { name: string } }>(METHOD.inviteUser);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState<SpaRole>("clerk");
  const [busy, setBusy] = useState(false);

  if (!session.user) return <Loading />;

  const ready = owner && firstName.trim() && email.trim();

  async function submit() {
    if (!ready) return;
    setBusy(true);
    try {
      await invite.call({
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        mobile_no: mobile.trim(),
        spa_role: role,
        send_welcome_email: 1,
      });
      nav("/team");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/team")}>
            {t("nav.team")}
          </button>
        }
        title={t("team.invite")}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav("/team")}>{t("soc.discard")}</button>
            <button
              type="button"
              className="btn"
              disabled={busy || invite.loading || !ready}
              onClick={() => void submit()}
            >
              {busy || invite.loading ? t("soc.saving") : t("team.sendInvite")}
            </button>
          </>
        }
      />
      {!owner && <ErrorBox error={{ message: t("team.denied") }} />}
      {invite.error && <ErrorBox error={invite.error} />}
      <FormLayout>
        <Card>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div className="grid2">
              <Field label={t("team.firstName")} required htmlFor="team-first-name">
                <input id="team-first-name" name="first_name" className="ctl" value={firstName}
                  autoComplete="given-name" onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field label={t("team.lastName")} htmlFor="team-last-name">
                <input id="team-last-name" name="last_name" className="ctl" value={lastName}
                  autoComplete="family-name" onChange={(e) => setLastName(e.target.value)} />
              </Field>
              <Field label={t("team.col.email")} required htmlFor="team-email">
                <input id="team-email" name="email" className="ctl" type="email" value={email}
                  autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label={t("team.col.mobile")} htmlFor="team-mobile">
                <input id="team-mobile" name="mobile_no" className="ctl" type="tel" value={mobile}
                  autoComplete="tel" onChange={(e) => setMobile(e.target.value)} />
              </Field>
            </div>
            <Field label={t("team.col.role")} required htmlFor="team-spa-role">
              <select id="team-spa-role" name="spa_role" className="ctl" aria-label={t("team.col.role")}
                value={role} onChange={(e) => setRole(e.target.value as SpaRole)}>
                {SPA_ROLES.map((r) => (
                  <option key={r} value={r}>{t(`role.${r}`)}</option>
                ))}
              </select>
            </Field>
          </form>
        </Card>
      </FormLayout>
    </>
  );
}
