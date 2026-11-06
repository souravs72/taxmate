/**
 * Desk-style form tabs (form-tabs-list / nav-link).
 * Callers: DocTabShell for every sidebar DocType detail/form.
 * Schema: tabs[{id,label}]; mirrors frappe/public/scss/desk/form.scss .form-tabs.
 * User: keep the design of documents, tabs, and fields similar to frappe/erpnext.
 */
import type { DocTab } from "../lib/docLayout";

type Props = {
  tabs: DocTab[];
  active: string;
  onChange: (id: string) => void;
};

export default function DocTabs({ tabs, active, onChange }: Props) {
  if (tabs.length <= 1) return null;
  return (
    <div className="tm-form-tabs-list" role="tablist">
      <ul className="tm-form-tabs">
        {tabs.map((tab) => {
          const on = active === tab.id;
          return (
            <li key={tab.id} className="tm-nav-item">
              <button
                type="button"
                role="tab"
                aria-selected={on}
                className={`tm-nav-link${on ? " active" : ""}`}
                onClick={() => onChange(tab.id)}
              >
                {tab.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
