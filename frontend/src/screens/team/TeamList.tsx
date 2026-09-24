/**
 * Team list. Catalog list_users — User is not a resource doctype.
 * Roles are multi-select; Frappe unions DocPerms across Has Role rows.
 */
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";
import { useNavigate } from "react-router-dom";

import { DataTable, type Column } from "../../components/DataTable";
import { Card, ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import { t } from "../../i18n/strings";
import { METHOD } from "../../lib/frappe";
import { canManageUsers, canViewTeam, SPA_ROLES, type SpaRole } from "../../lib/roles";
import { useSession } from "../../lib/session";

type TeamUser = {
  name: string;
  email?: string;
  full_name?: string;
  mobile_no?: string | null;
  enabled?: number;
  spa_role?: SpaRole;
  spa_roles?: SpaRole[];
  extra_roles?: string[];
  last_active?: string | null;
};

function RoleChecklist({
  spaRoles,
  extraRoles,
  addonRoles,
  disabled,
  onChange,
}: {
  spaRoles: SpaRole[];
  extraRoles: string[];
  addonRoles: string[];
  disabled?: boolean;
  onChange: (spaRoles: SpaRole[], extraRoles: string[]) => void;
}) {
  function toggleSpa(role: SpaRole) {
    const next = spaRoles.includes(role)
      ? spaRoles.filter((r) => r !== role)
      : [...spaRoles, role];
    if (!next.length) return;
    onChange(next, extraRoles);
  }

  function toggleExtra(role: string) {
    const next = extraRoles.includes(role)
      ? extraRoles.filter((r) => r !== role)
      : [...extraRoles, role];
    onChange(spaRoles, next);
  }

  return (
    <div className="stack" style={{ gap: 6, minWidth: 180 }} onClick={(e) => e.stopPropagation()}>
      {SPA_ROLES.map((role) => (
        <label key={role} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={spaRoles.includes(role)}
            disabled={disabled}
            onChange={() => toggleSpa(role)}
          />
          {t(`role.${role}`)}
        </label>
      ))}
      {addonRoles.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{t("team.roles.addons")}</div>
          {addonRoles.map((role) => (
            <label key={role} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={extraRoles.includes(role)}
                disabled={disabled}
                onChange={() => toggleExtra(role)}
              />
              {t(`role.${role}`)}
            </label>
          ))}
        </>
      )}
    </div>
  );
}

export default function TeamList() {
  const nav = useNavigate();
  const session = useSession();
  const owner = canManageUsers(session);
  const allowed = canViewTeam(session);
  const list = useFrappeGetCall<{ message: TeamUser[] }>(
    METHOD.listUsers,
    undefined,
    allowed ? "team-users" : null,
    { revalidateOnFocus: false },
  );
  const flags = useFrappeGetCall<{ message: { addon_roles?: string[] } }>(
    METHOD.getFeatureFlags,
    undefined,
    "team-feature-flags",
    { revalidateOnFocus: false },
  );
  const setRole = useFrappePostCall<{ message: TeamUser }>(METHOD.setUserRole);
  const setEnabled = useFrappePostCall<{ message: TeamUser }>(METHOD.setUserEnabled);
  const rows = allowed ? (list.data?.message ?? []) : [];
  const addonRoles = flags.data?.message?.addon_roles ?? [];

  if (!session.user) return <Loading />;

  async function changeRoles(user: string, spa_roles: SpaRole[], extra_roles: string[]) {
    await setRole.call({
      user,
      spa_roles: JSON.stringify(spa_roles),
      extra_roles: JSON.stringify(extra_roles),
    });
    await list.mutate();
  }

  async function changeEnabled(user: string, enabled: number) {
    await setEnabled.call({ user, enabled });
    await list.mutate();
  }

  const columns: Column<TeamUser>[] = [
    { key: "name", header: t("team.col.name"), cell: (u) => u.full_name || u.name },
    { key: "email", header: t("team.col.email"), className: "mono", cell: (u) => u.email || u.name },
    { key: "mobile", header: t("team.col.mobile"), cell: (u) => u.mobile_no || "—" },
    {
      key: "role",
      header: t("team.col.role"),
      cell: (u) => {
        const spaRoles = (u.spa_roles?.length ? u.spa_roles : [u.spa_role || "viewer"]) as SpaRole[];
        const extra = u.extra_roles ?? [];
        if (owner && u.name !== session.user) {
          return (
            <RoleChecklist
              spaRoles={spaRoles}
              extraRoles={extra}
              addonRoles={addonRoles}
              onChange={(nextSpa, nextExtra) => void changeRoles(u.name, nextSpa, nextExtra)}
            />
          );
        }
        const labels = [
          ...spaRoles.map((r) => t(`role.${r}`)),
          ...extra.map((r) => t(`role.${r}`)),
        ];
        return <Pill cls="p-open">{labels.join(", ")}</Pill>;
      },
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
        actions={
          owner ? (
            <button type="button" className="btn" onClick={() => nav("/team/new")}>
              {t("team.invite")}
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
