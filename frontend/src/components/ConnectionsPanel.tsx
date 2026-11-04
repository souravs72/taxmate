/**
 * Desk Connections groups with open/total counts. SPA routes only — no /app/.
 * Callers: detail screens on the Connections tab (SalesOrderDetail, etc.).
 * API: METHOD.connectionsOpenCount → taxmate.api.connections.open_count
 * Schema: groups[{label, items[{doctype,count,open_count,spa_path,fieldname}]}]
 * User: Implement the plan as specified... completed all the to-dos.
 */
import { Link } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "../lib/frappe";
import { t } from "../i18n/strings";
import { Card, ErrorBox, Loading } from "./ui";

export type ConnItem = {
  doctype: string;
  count: number;
  open_count: number;
  spa_path?: string | null;
  fieldname?: string | null;
};

export type ConnGroup = { label: string; items: ConnItem[] };

type Props = {
  doctype: string;
  name: string;
  filterValue?: string;
};

export default function ConnectionsPanel({ doctype, name, filterValue }: Props) {
  const { data, error, isLoading } = useFrappeGetCall<{
    message: { groups: ConnGroup[]; fieldname?: string };
  }>(
    METHOD.connectionsOpenCount,
    { doctype, name },
    name ? `conn-${doctype}-${name}` : null,
  );

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const groups = data?.message?.groups ?? [];
  const defaultField = data?.message?.fieldname;

  if (!groups.length) {
    return (
      <Card title={t("sod.linked")}>
        <p className="conn-muted">—</p>
      </Card>
    );
  }

  return (
    <div className="conn-groups">
      {groups.map((group) => (
        <Card key={group.label || "group"} title={group.label || t("sod.linked")}>
          <ul className="conn-list">
            {group.items.map((item) => {
              const field = item.fieldname || defaultField;
              const href =
                item.spa_path && field && (filterValue || name)
                  ? `${item.spa_path}?${encodeURIComponent(field)}=${encodeURIComponent(filterValue || name)}`
                  : item.spa_path || null;
              const label = `${item.doctype} (${item.count}${item.open_count ? ` · ${item.open_count} open` : ""})`;
              return (
                <li key={item.doctype} className="conn-item">
                  {href ? (
                    <Link to={href} className="conn-link">
                      {label}
                    </Link>
                  ) : (
                    <span className="conn-muted">{label}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
