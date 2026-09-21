/**
 * Team list. Catalog list_users — User is not a resource doctype.
 * Importers: App.tsx /team. Callers: rail nav.team, search /team.
 * Schema: {name, email, full_name, enabled, spa_role}.
 * User: "how to manage the Users in the company and their roles?"
 */
import { useNavigate } from "react-router-dom";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

import { METHOD } from "../../lib/frappe";
import { canManageUsers, canViewTeam, SPA_ROLES, type SpaRole } from "../../lib/roles";
import { useSession } from "../../lib/session";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, PageHead, Pill } from "../../components/ui";
import { DataTable, type Column } from "../../components/DataTable";

type TeamUser = {
  name: string;
  email?: string;
  full_name?: string;
  enabled?: number;
  spa_role?: SpaRole;
  last_active?: string | null;
};

export default function TeamList() {
  const nav = useNavigate();
  const session = useSession();
  const owner = canManageUsers(session);
  const allowed = canViewTeam(session);
  const list = useFrappeGetCall<{ message: TeamUser[] }>(METHOD.listUsers, undefined, undefined, {
    isPaused: () => !allowed,
  });
  const setRole = useFrappePostCall<{ message: TeamUser }>(METHOD.setUserRole);
  const setEnabled = useFrappePostCall<{ message: TeamUser }>(METHOD.setUserEnabled);
  const rows = allowed ? (list.data?.message ?? []) : [];

  async function changeRole(user: string, spa_role: SpaRole) {
    await setRole.call({ user, spa_role });
    await list.mutate();
  }

  async function changeEnabled(user: string, enabled: number) {
    await setEnabled.call({ user, enabled });
    await list.mutate();
  }

  const columns: Column<TeamUser>[] = [
    { key: "name", header: t("team.col.name"), cell: (u) => u.full_name || u.name },
    { key: "email", header: t("team.col.email"), className: "mono", cell: (u) => u.email || u.name },
    {
      key: "role",
      header: t("team.col.role"),
      cell: (u) =>
        owner && u.name !== session.user ? (
          <select
            className="ctl"
            name={`spa_role-${u.name}`}
            aria-label={`${t("team.col.role")} ${u.email || u.name}`}
            value={u.spa_role || "clerk"}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => void changeRole(u.name, e.target.value as SpaRole)}
          >
            {SPA_ROLES.map((role) => (
              <option key={role} value={role}>{t(`role.${role}`)}</option>
            ))}
          </select>
        ) : (
          <Pill cls="p-open">{t(`role.${u.spa_role || "viewer"}`)}</Pill>
        ),
    },
    {
      key: "enabled",
      header: t("team.col.status"),
      cell: (u) =>
        owner && u.name !== session.user ? (
          <button
            type="button"
            className="btn ghost sm"
            onClick={(e) => {
              e.stopPropagation();
              void changeEnabled(u.name, u.enabled ? 0 : 1);
            }}
          >
            {u.enabled ? t("team.disable") : t("team.enable")}
          </button>
        ) : (
          <Pill cls={u.enabled ? "p-done" : "p-flat"}>
            {u.enabled ? t("team.active") : t("team.disabled")}
          </Pill>
        ),
    },
  ];

  return (
    <>
      <PageHead
        title={t("team.title")}
        sub={t("team.sub")}
        actions={
          owner ? (
            <button type="button" className="btn" onClick={() => nav("/team/new")}>
              ＋ {t("team.invite")}
            </button>
          ) : null
        }
      />
      {!allowed && <ErrorBox error={{ message: t("team.denied") }} />}
      {(list.error || setRole.error || setEnabled.error) && (
        <ErrorBox error={list.error || setRole.error || setEnabled.error} onRetry={() => list.mutate()} />
      )}
      {allowed && (
        <Card bodyClass={null as unknown as string}>
          <DataTable<TeamUser>
            rows={rows}
            rowKey={(u) => u.name}
            state={{ isLoading: list.isLoading, error: null, onRetry: () => list.mutate() }}
            emptyLabel={t("team.empty")}
            columns={columns}
          />
        </Card>
      )}
    </>
  );
}
