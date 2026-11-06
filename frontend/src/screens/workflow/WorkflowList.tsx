import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

import { Card, ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import { METHOD } from "../../lib/frappe";
import { useSession } from "../../lib/session";
import { date } from "../../lib/format";

export type WorkflowItem = {
  name: string;
  workflow_name: string;
  document_type: string;
  is_active: number;
  company: string | null;
  is_entity_specific: boolean;
  states_count: number;
  transitions_count: number;
  modified: string;
};

const COMMON_DOCTYPES = [
  "Sales Invoice",
  "Purchase Order",
  "Quotation",
  "Delivery Note",
  "Purchase Invoice",
  "Sales Order",
  "Purchase Receipt",
  "Material Request",
  "Journal Entry",
  "Payment Entry",
];

export default function WorkflowList() {
  const nav = useNavigate();
  const session = useSession();
  const activeCompany = session.company || "";

  const [q, setQ] = useState("");
  const [filterDocType, setFilterDocType] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [wfName, setWfName] = useState("");
  const [docType, setDocType] = useState("Sales Invoice");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createErr, setCreateErr] = useState<unknown>(null);

  const list = useFrappeGetCall<{ message: WorkflowItem[] }>(
    METHOD.getWorkflows,
    { company: activeCompany },
    activeCompany ? `workflows-${activeCompany}` : "workflows",
  );

  const toggleActive = useFrappePostCall<{ message: { name: string; is_active: number } }>(
    METHOD.toggleWorkflowActive,
  );

  const createCustom = useFrappePostCall<{ message: { name: string; created?: boolean } }>(
    METHOD.createWorkflow,
  );

  const workflows = list.data?.message ?? [];

  const docTypes = useMemo(() => {
    const set = new Set<string>();
    for (const w of workflows) {
      if (w.document_type) set.add(w.document_type);
    }
    return Array.from(set).sort();
  }, [workflows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return workflows.filter((w) => {
      const matchDoc = filterDocType === "all" || w.document_type === filterDocType;
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && w.is_active === 1) ||
        (statusFilter === "inactive" && w.is_active === 0);
      const matchQuery =
        !needle ||
        w.workflow_name.toLowerCase().includes(needle) ||
        w.document_type.toLowerCase().includes(needle) ||
        (w.company ?? "").toLowerCase().includes(needle);
      return matchDoc && matchStatus && matchQuery;
    });
  }, [workflows, q, filterDocType, statusFilter]);

  async function handleToggle(w: WorkflowItem, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await toggleActive.call({ name: w.name, is_active: w.is_active ? 0 : 1 });
      void list.mutate();
    } catch {
      // handled by SDK
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!wfName.trim()) return;
    setIsSubmitting(true);
    setCreateErr(null);
    try {
      const res = await createCustom.call({
        workflow_name: wfName.trim(),
        document_type: docType,
        company: activeCompany,
      });
      setModalOpen(false);
      setWfName("");
      await list.mutate();
      if (res.message?.name) {
        nav(`/workflows/${encodeURIComponent(res.message.name)}`);
      }
    } catch (err) {
      setCreateErr(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  function openCreateModal() {
    setWfName(activeCompany ? `${activeCompany.split(" ")[0]} - ${docType} Approval` : `${docType} Approval`);
    setCreateErr(null);
    setModalOpen(true);
  }

  return (
    <div className="page" style={{ maxWidth: "1200px", margin: "0 auto", padding: "16px 24px" }}>
      <PageHead
        title="Workflows"
        sub={activeCompany || "Approval rules"}
        actions={
          <button type="button" className="btn sm primary" onClick={openCreateModal}>
            + New Workflow
          </button>
        }
      />

      {/* Filters Toolbar */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" }}>
        <input
          type="search"
          className="ctl"
          placeholder="Search workflows..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: "240px", height: "32px", fontSize: "12.5px" }}
        />

        {docTypes.length > 0 && (
          <select
            className="ctl"
            value={filterDocType}
            onChange={(e) => setFilterDocType(e.target.value)}
            style={{ height: "32px", fontSize: "12.5px" }}
          >
            <option value="all">All Documents</option>
            {docTypes.map((dt) => (
              <option key={dt} value={dt}>
                {dt}
              </option>
            ))}
          </select>
        )}

        <select
          className="ctl"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          style={{ height: "32px", fontSize: "12.5px" }}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {list.error && <ErrorBox error={list.error} onRetry={() => list.mutate()} />}
      {list.isLoading && !list.data && <Loading />}

      {!list.isLoading && filtered.length === 0 && (
        <Card>
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: "13px" }}>
              No workflows found
            </p>
            <button type="button" className="btn sm" onClick={openCreateModal}>
              Create Workflow
            </button>
          </div>
        </Card>
      )}

      {filtered.length > 0 && (
        <Card bodyClass={null}>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ width: "100%", fontSize: "13px" }}>
              <thead>
                <tr>
                  <th>Workflow Name</th>
                  <th>Document Type</th>
                  <th>Company</th>
                  <th>States</th>
                  <th>Status</th>
                  <th>Modified</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => (
                  <tr key={w.name}>
                    <td>
                      <Link
                        to={`/workflows/${encodeURIComponent(w.name)}`}
                        style={{ fontWeight: 600, color: "var(--text)", textDecoration: "none" }}
                      >
                        {w.workflow_name}
                      </Link>
                    </td>
                    <td>
                      <span style={{ color: "var(--text-muted, var(--muted))" }}>{w.document_type}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                        {w.company || "Global"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                        {w.states_count} states · {w.transitions_count} transitions
                      </span>
                    </td>
                    <td>
                      <Pill cls={w.is_active ? "p-done" : "p-flat"}>
                        {w.is_active ? "Active" : "Inactive"}
                      </Pill>
                    </td>
                    <td>
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                        {date(w.modified)}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={(e) => void handleToggle(w, e)}
                        style={{ padding: "2px 8px", fontSize: "11.5px" }}
                      >
                        {w.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* New Workflow Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-wf-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(2px)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: "16px",
          }}
          onClick={() => !isSubmitting && setModalOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "420px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
              padding: "20px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 id="new-wf-title" style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>
                New Workflow
              </h3>
              <button
                type="button"
                className="btn ghost sm"
                style={{ padding: "2px 6px" }}
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>

            {createErr != null && (
              <div style={{ marginBottom: "12px" }}>
                <ErrorBox error={createErr} />
              </div>
            )}

            <form onSubmit={(e) => void handleCreate(e)}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label htmlFor="wf-name-input" style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                    Workflow Name
                  </label>
                  <input
                    id="wf-name-input"
                    type="text"
                    required
                    className="ctl"
                    style={{ width: "100%", height: "34px", fontSize: "13px" }}
                    placeholder="e.g. Sales Invoice Approval"
                    value={wfName}
                    onChange={(e) => setWfName(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="wf-doctype-select" style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                    Document Type
                  </label>
                  <select
                    id="wf-doctype-select"
                    className="ctl"
                    style={{ width: "100%", height: "34px", fontSize: "13px" }}
                    value={docType}
                    onChange={(e) => {
                      setDocType(e.target.value);
                      if (activeCompany) {
                        setWfName(`${activeCompany.split(" ")[0]} - ${e.target.value} Approval`);
                      }
                    }}
                  >
                    {COMMON_DOCTYPES.map((dt) => (
                      <option key={dt} value={dt}>
                        {dt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                    Company
                  </label>
                  <input
                    type="text"
                    disabled
                    className="ctl"
                    style={{ width: "100%", height: "34px", fontSize: "13px", opacity: 0.8 }}
                    value={activeCompany || "Global (All entities)"}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={isSubmitting}
                    onClick={() => setModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn sm primary"
                    disabled={isSubmitting || !wfName.trim()}
                  >
                    {isSubmitting ? "Saving..." : "Create"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
