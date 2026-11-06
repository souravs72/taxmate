/**
 * Desk-style Connections (form-links / document-link badges). SPA routes only.
 * Callers: DocTabShell Connections tab for sidebar DocTypes.
 * API: METHOD.connectionsOpenCount → taxmate.api.connections.open_count
 * User: keep the design of documents, tabs, and fields similar to frappe/erpnext.
 */
import { Link } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "../lib/frappe";
import { t } from "../i18n/strings";
import { ErrorBox, Loading } from "./ui";

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
      <div className="tm-form-page">
        <section className="tm-form-section">
          <div className="tm-section-head">
            <span className="tm-section-title">{t("sod.linked")}</span>
          </div>
          <div className="tm-section-body">
            <p className="tm-form-empty">—</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="tm-form-page tm-form-links">
      {groups.map((group) => (
        <section key={group.label || "group"} className="tm-form-section">
          {group.label ? (
            <div className="tm-section-head">
              <span className="tm-section-title">{group.label}</span>
            </div>
          ) : null}
          <div className="tm-section-body tm-connections-body">
            {group.items.map((item) => {
              const field = item.fieldname || defaultField;
              const href =
                item.spa_path && field && (filterValue || name)
                  ? `${item.spa_path}?${encodeURIComponent(field)}=${encodeURIComponent(filterValue || name)}`
                  : item.spa_path || null;
              const badge = (
                <>
                  <span className="tm-conn-count">{item.count}</span>
                  <span className="tm-conn-name">{item.doctype}</span>
                  {item.open_count > 0 ? (
                    <span className="tm-conn-open">{item.open_count} Open</span>
                  ) : null}
                </>
              );
              return (
                <div key={item.doctype} className="tm-document-link">
                  {href ? (
                    <Link to={href} className="tm-document-link-badge">
                      {badge}
                    </Link>
                  ) : (
                    <span className="tm-document-link-badge muted">{badge}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
