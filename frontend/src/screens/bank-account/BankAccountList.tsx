/**
 * Bank Account list.
 * Callers: App.tsx /bank-accounts.
 * API: taxmate.api.resource.get_list on "Bank Account" (in _CORE_MASTERS → catalog).
 * Schema: { name, account_name, bank, account, company, is_company_account, disabled }
 */
import { useNavigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { Card, Loading, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

const PAGE = 30;

type Row = {
  name: string;
  account_name?: string;
  bank?: string;
  account?: string;
  company?: string;
  is_company_account?: number;
  disabled?: number;
};

export default function BankAccountList() {
  const nav = useNavigate();
  const session = useSession();
  const writable = canWrite(session);
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters: [string, string, string | number][] = q.trim()
    ? [["account_name", "like", `%${q.trim()}%`]]
    : [];

  const list = useDocList<Row>(DT.bankAccount, {
    fields: ["name", "account_name", "bank", "account", "company", "is_company_account", "disabled"],
    filters: filters as never,
    orderBy: { field: "account_name", order: "asc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.bankAccount, filters as never);

  const columns: Column<Row>[] = [
    { key: "account_name", header: t("ba.col.accountName"), cell: (r) => <span className="ordno">{r.account_name || r.name}</span> },
    { key: "bank", header: t("ba.col.bank"), cell: (r) => r.bank || "—" },
    { key: "account", header: t("ba.col.account"), cell: (r) => r.account || "—" },
    { key: "company", header: t("ba.col.company"), cell: (r) => r.company || "—" },
    { key: "disabled", header: t("ba.col.disabled"), cell: (r) => r.disabled ? t("yes") : t("no") },
  ];

  return (
    <>
      <PageHead
        title={t("ba.title")}
        sub={t("ba.sub")}
        actions={
          writable ? (
            <button type="button" className="btn" onClick={() => nav("/bank-accounts/new")}>
              {t("ba.new")}
            </button>
          ) : undefined
        }
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("ba.search")} />
        </FilterBar>
        {list.isLoading ? (
          <Loading />
        ) : (
          <DataTable<Row>
            rows={list.data ?? []}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/bank-accounts/${encodeURIComponent(r.name)}`)}
            state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
            emptyLabel={t("ba.empty")}
            columns={columns}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
