import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

import { Card, Empty, ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import { METHOD } from "../../lib/frappe";

export type WorkflowState = {
  state: string;
  doc_status: string | number;
  allow_edit: string;
  is_optional_state?: number;
};

export type WorkflowTransition = {
  state: string;
  action: string;
  next_state: string;
  allowed: string;
  allow_self_approval?: number;
  condition?: string | null;
};

export type WorkflowDetailData = {
  name: string;
  workflow_name: string;
  document_type: string;
  is_active: number;
  workflow_state_field: string;
  company: string | null;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
};

function stateColor(name: string, docStatus: string | number): "p-done" | "p-open" | "p-bad" | "p-flat" {
  const s = (name || "").toLowerCase();
  const ds = String(docStatus);
  if (ds === "1" || s.includes("approved") || s.includes("completed")) return "p-done";
  if (s.includes("reject") || ds === "2") return "p-bad";
  if (s.includes("pending") || s.includes("review")) return "p-open";
  return "p-flat";
}

function docStatusText(status: string | number): string {
  const s = String(status);
  if (s === "0") return "Draft";
  if (s === "1") return "Submitted";
  if (s === "2") return "Cancelled";
  return s;
}

export default function WorkflowDetail() {
  const { name } = useParams<{ name: string }>();
  const [toggleBusy, setToggleBusy] = useState(false);

  const wfCall = useFrappeGetCall<{ message: WorkflowDetailData }>(
    METHOD.getWorkflow,
    { name: name || "" },
    name ? `wf-detail-${name}` : undefined,
  );

  const toggleActive = useFrappePostCall<{ message: { name: string; is_active: number } }>(
    METHOD.toggleWorkflowActive,
  );

  const data = wfCall.data?.message;

  async function handleToggleActive() {
    if (!data) return;
    setToggleBusy(true);
    try {
      await toggleActive.call({
        name: data.name,
        is_active: data.is_active ? 0 : 1,
      });
      await wfCall.mutate();
    } finally {
      setToggleBusy(false);
    }
  }

  if (wfCall.isLoading && !data) {
    return <Loading label="Loading workflow..." />;
  }

  if (wfCall.error) {
    return (
      <div className="page" style={{ maxWidth: "1200px", margin: "0 auto", padding: "16px 24px" }}>
        <div style={{ marginBottom: "12px" }}>
          <Link to="/workflows" className="btn ghost sm">
            ← Workflows
          </Link>
        </div>
        <ErrorBox error={wfCall.error} onRetry={() => wfCall.mutate()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page" style={{ maxWidth: "1200px", margin: "0 auto", padding: "16px 24px" }}>
        <div style={{ marginBottom: "12px" }}>
          <Link to="/workflows" className="btn ghost sm">
            ← Workflows
          </Link>
        </div>
        <Empty label="Workflow not found" />
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: "1200px", margin: "0 auto", padding: "16px 24px" }}>
      {/* Back navigation */}
      <div style={{ marginBottom: "10px" }}>
        <Link to="/workflows" className="btn ghost sm" style={{ color: "var(--muted)" }}>
          ← Workflows
        </Link>
      </div>

      <PageHead
        title={data.workflow_name || data.name}
        sub={`${data.document_type} · ${data.company || "Global (All entities)"}`}
        actions={
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Pill cls={data.is_active ? "p-done" : "p-flat"}>
              {data.is_active ? "Active" : "Inactive"}
            </Pill>
            <button
              type="button"
              className="btn sm"
              disabled={toggleBusy}
              onClick={() => void handleToggleActive()}
            >
              {data.is_active ? "Deactivate" : "Activate"}
            </button>
          </div>
        }
      />

      {/* Metadata strip */}
      <div
        style={{
          display: "flex",
          gap: "24px",
          padding: "10px 16px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r)",
          marginBottom: "16px",
          fontSize: "12.5px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <span style={{ color: "var(--muted)" }}>Document: </span>
          <span style={{ fontWeight: 600 }}>{data.document_type}</span>
        </div>
        <div>
          <span style={{ color: "var(--muted)" }}>Company: </span>
          <span style={{ fontWeight: 600 }}>{data.company || "Global"}</span>
        </div>
        <div>
          <span style={{ color: "var(--muted)" }}>State Field: </span>
          <code style={{ fontSize: "12px" }}>{data.workflow_state_field}</code>
        </div>
        <div>
          <span style={{ color: "var(--muted)" }}>States: </span>
          <span style={{ fontWeight: 600 }}>{data.states.length}</span>
        </div>
        <div>
          <span style={{ color: "var(--muted)" }}>Transitions: </span>
          <span style={{ fontWeight: 600 }}>{data.transitions.length}</span>
        </div>
      </div>

      {/* Pipeline Progression */}
      <Card title="Lifecycle Flow">
        <div style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {data.states.map((st, idx) => (
              <div key={st.state} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 10px",
                    background: "var(--sunk)",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    fontSize: "12.5px",
                  }}
                >
                  <Pill cls={stateColor(st.state, st.doc_status)}>{st.state}</Pill>
                  <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                    ({docStatusText(st.doc_status)})
                  </span>
                </div>
                {idx < data.states.length - 1 && (
                  <span style={{ color: "var(--faint)", fontSize: "14px" }}>→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div style={{ height: "16px" }} />

      {/* Transitions */}
      <Card title="Transitions">
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ width: "100%", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={{ width: "20%" }}>State</th>
                <th style={{ width: "18%" }}>Action</th>
                <th style={{ width: "20%" }}>Next State</th>
                <th style={{ width: "18%" }}>Allowed</th>
                <th style={{ width: "10%" }}>Self Approval</th>
                <th style={{ width: "14%" }}>Condition</th>
              </tr>
            </thead>
            <tbody>
              {data.transitions.map((tr, i) => (
                <tr key={`${tr.state}-${tr.action}-${tr.next_state}-${i}`}>
                  <td>
                    <Pill cls={stateColor(tr.state, 0)}>{tr.state}</Pill>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600 }}>{tr.action}</span>
                  </td>
                  <td>
                    <Pill cls={stateColor(tr.next_state, 1)}>{tr.next_state}</Pill>
                  </td>
                  <td>{tr.allowed}</td>
                  <td>{Boolean(tr.allow_self_approval) ? "Yes" : "No"}</td>
                  <td>
                    {tr.condition ? (
                      <code style={{ fontSize: "11px", background: "var(--sunk)", padding: "1px 5px", borderRadius: "3px" }}>
                        {tr.condition}
                      </code>
                    ) : (
                      <span style={{ color: "var(--faint)", fontSize: "12px" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ height: "16px" }} />

      {/* Document States */}
      <Card title="Document States">
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ width: "100%", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={{ width: "30%" }}>State</th>
                <th style={{ width: "25%" }}>Doc Status</th>
                <th style={{ width: "30%" }}>Only Allow Edit For</th>
                <th style={{ width: "15%" }}>Optional</th>
              </tr>
            </thead>
            <tbody>
              {data.states.map((st) => (
                <tr key={st.state}>
                  <td>
                    <Pill cls={stateColor(st.state, st.doc_status)}>{st.state}</Pill>
                  </td>
                  <td>{docStatusText(st.doc_status)}</td>
                  <td>{st.allow_edit || "—"}</td>
                  <td>{Boolean(st.is_optional_state) ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
