/**
 * Desk-parity tab list for detail/form screens (ftabs).
 * Callers: SalesOrderDetail and other DocType screens via useDocLayout.
 * Schema: tabs[{id,label}]; no data I/O.
 * User: Implement the plan as specified... completed all the to-dos.
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
    <div className="ftabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`ftab${active === tab.id ? " on" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
