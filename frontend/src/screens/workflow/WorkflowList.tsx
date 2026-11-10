/**
 * Workflow list — Desk-style list chrome (PageHead + FilterBar + DataTable).
 * API: taxmate.api.workflow.get_workflows / create_custom_workflow / toggle_active.
 * Not a DocList: Workflow is company-scoped via custom API, not resource.get_list.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/filters";
import { Card, ErrorBox, PageHead, Pill } from "../../components/ui";
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

const PAGE = 20;

export default function WorkflowList() {
  const nav = useNavigate();
  const session = useSession();
  const activeCompany = session.company || "";

  const [q, setQ] = useState("");
  const [filterDocType, setFilterDocType] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);

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
      const matchDoc = !filterDocType || w.document_type === filterDocType;
      const matchStatus =
        !statusFilter ||
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

  const pageRows = useMemo(
    () => filtered.slice(page * PAGE, page * PAGE + PAGE),
    [filtered, page],
  );

  async function handleToggle(w: WorkflowItem, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await toggleActive.call({ name: w.name, is_active: w.is_active ? 0 : 1 });
      void list.mutate();
    } catch {
      // SDK surfaces the error
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
    setDocType("Sales Invoice");
    setWfName(
      activeCompany
        ? `${activeCompany.split(" ")[0]} - Sales Invoice Approval`
        : "Sales Invoice Approval",
    );
    setCreateErr(null);
    setModalOpen(true);
  }

  const columns: Column<WorkflowItem>[] = [
    {
      key: "workflow_name",
      header: "Workflow Name",
      role: "title",
      cell: (w) => w.workflow_name,
    },
    {
      key: "document_type",
      header: "Document Type",
      role: "subtitle",
      cell: (w) => w.document_type,
    },
    {
      key: "company",
      header: "Company",
      role: "meta",
      cell: (w) => w.company || "Global",
    },
    {
      key: "states",
      header: "States",
      role: "meta",
      cell: (w) => `${w.states_count} · ${w.transitions_count} transitions`,
    },
    {
      key: "is_active",
      header: "Status",
      role: "status",
      cell: (w) => (
        <Pill cls={w.is_active ? "p-done" : "p-flat"}>
          {w.is_active ? "Active" : "Inactive"}
        </Pill>
      ),
    },
    {
      key: "modified",
      header: "Modified",
      role: "meta",
      cell: (w) => date(w.modified),
    },
    {
      key: "action",
      header: "",
      role: "hide",
      cell: (w) => (
        <button
          type="button"
          className="btn ghost sm"
          onClick={(e) => void handleToggle(w, e)}
        >
          {w.is_active ? "Deactivate" : "Activate"}
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="Workflows"
        actions={
          <button type="button" className="btn" onClick={openCreateModal}>
            New
          </button>
        }
      />

      {activeCompany ? (
        <p className="muted" style={{ margin: 0 }}>
          Scoped to {activeCompany}
        </p>
      ) : null}

      <Card bodyClass={null as unknown as string}>
        <div className="list-toolbar">
          <FilterBar>
            <SearchFilter
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(0);
              }}
              placeholder="Search workflows"
            />
            {docTypes.length > 0 ? (
              <SelectFilter
                value={filterDocType}
                onChange={(v) => {
                  setFilterDocType(v);
                  setPage(0);
                }}
                allLabel="Document Type"
                options={docTypes.map((dt) => ({ value: dt, label: dt }))}
              />
            ) : null}
            <SelectFilter
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                setPage(0);
              }}
              allLabel="Status"
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          </FilterBar>
        </div>

        <DataTable<WorkflowItem>
          rows={pageRows}
          rowKey={(w) => w.name}
          onOpen={(w) => nav(`/workflows/${encodeURIComponent(w.name)}`)}
          state={{
            isLoading: list.isLoading && !list.data,
            error: list.error,
            onRetry: () => {
              void list.mutate();
            },
          }}
          emptyLabel="No workflows match these filters."
          columns={columns}
        />

        <ListFooter
          shown={pageRows.length}
          total={filtered.length}
          page={page}
          pageSize={PAGE}
          onPage={setPage}
        />
      </Card>

      {modalOpen ? (
        <div
          className="tm-modal-scrim"
          role="presentation"
          onClick={() => !isSubmitting && setModalOpen(false)}
        >
          <div
            className="tm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-wf-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="tm-modal-head">
              <h3 id="new-wf-title">New Workflow</h3>
              <button
                type="button"
                className="btn ghost sm"
                aria-label="Close"
                disabled={isSubmitting}
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>

            {createErr != null ? (
              <div className="tm-modal-err">
                <ErrorBox error={createErr} />
              </div>
            ) : null}

            <form className="tm-modal-body" onSubmit={(e) => void handleCreate(e)}>
              <label className="tm-field">
                <span>Workflow Name</span>
                <input
                  type="text"
                  required
                  className="ctl"
                  placeholder="e.g. Sales Invoice Approval"
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                />
              </label>

              <label className="tm-field">
                <span>Document Type</span>
                <select
                  className="ctl"
                  value={docType}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDocType(next);
                    if (activeCompany) {
                      setWfName(`${activeCompany.split(" ")[0]} - ${next} Approval`);
                    }
                  }}
                >
                  {COMMON_DOCTYPES.map((dt) => (
                    <option key={dt} value={dt}>
                      {dt}
                    </option>
                  ))}
                </select>
              </label>

              <label className="tm-field">
                <span>Company</span>
                <input
                  type="text"
                  disabled
                  className="ctl"
                  value={activeCompany || "Global (All entities)"}
                />
              </label>

              <div className="tm-modal-foot">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={isSubmitting}
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={isSubmitting || !wfName.trim()}
                >
                  {isSubmitting ? "Saving…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
