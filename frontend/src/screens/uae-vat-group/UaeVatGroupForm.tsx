/**
 * UaeVatGroupForm — Phase 22. Create/edit UAE VAT Group.
 * Callers: App.tsx /uae-vat-groups/new, /:name/edit, /:name
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, CheckField, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";
import LinkField from "../../components/LinkField";

type Member = { _key: string; company: string; from_date: string; to_date: string; is_representative: 0 | 1 };
let _mk = 0;
const memberKey = () => `m${++_mk}`;
const blankMember = (): Member => ({ _key: memberKey(), company: "", from_date: "", to_date: "", is_representative: 0 });

export default function UaeVatGroupForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";
  const existing = useDoc(DT.uaeVatGroup, isNew ? undefined : name, isNew ? null : name, { isPaused: () => isNew });
  const create = useInsert();
  const update = useSave();
  const [form, setForm] = useState({ representative_company: "", group_trn: "", election_date: "", notes: "" });
  const [members, setMembers] = useState<Member[]>([blankMember()]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const d = existing.data as Record<string, unknown> | undefined;
    if (!d || loaded) return;
    setForm({ representative_company: String(d.representative_company || ""), group_trn: String(d.group_trn || ""), election_date: String(d.election_date || ""), notes: String(d.notes || "") });
    const rows = (d.members as { company?: string; from_date?: string; to_date?: string; is_representative?: number }[] | undefined) ?? [];
    setMembers(rows.length ? rows.map((r) => ({ _key: memberKey(), company: r.company || "", from_date: r.from_date || "", to_date: r.to_date || "", is_representative: r.is_representative ? 1 : 0 })) : [blankMember()]);
    setLoaded(true);
  }, [existing.data, loaded]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const ready = !!form.representative_company && members.some((m) => m.company && m.from_date);
  const payload = {
    ...form,
    members: members.filter((m) => m.company && m.from_date).map(({ _key: _drop, ...m }) => m),
  };

  async function saveFn() {
    if (!ready) return;
    setBusy(true); setSaveError(null);
    try {
      if (isNew) {
        const doc = (await create.createDoc(DT.uaeVatGroup, payload)) as { name: string };
        nav(`/uae-vat-groups/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc(DT.uaeVatGroup, name, payload);
        nav(`/uae-vat-groups/${encodeURIComponent(name)}`);
      }
    } catch (err) { setSaveError(err); }
    finally { setBusy(false); }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/uae-vat-groups")}>{t("uvg.title")}</button>}
        title={isNew ? t("uvg.new") : (form.representative_company || name)}
      />
      {saveError ? <ErrorBox error={saveError} /> : null}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("uvg.col.representative")} required><input className="ctl" value={form.representative_company} onChange={(e) => set("representative_company", e.target.value)} /></Field>
            <Field label={t("uvg.col.trn")}><input className="ctl" value={form.group_trn} onChange={(e) => set("group_trn", e.target.value)} /></Field>
            <Field label={t("uvg.col.electionDate")}><input className="ctl" type="date" value={form.election_date} onChange={(e) => set("election_date", e.target.value)} /></Field>
            <Field label={t("ucd.col.notes")}><textarea className="ctl" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
          </div>
        </Card>
        <Card title={t("uvg.members")}>
          <div className="fg">
            {members.map((m) => (
              <div className="grid2" key={m._key}>
                <Field label={t("coa.company")} required>
                  <LinkField doctype={DT.company} value={m.company} onChange={(v) => setMembers((rows) => rows.map((r) => r._key === m._key ? { ...r, company: v } : r))} />
                </Field>
                <Field label={t("uvg.memberFrom")} required>
                  <input className="ctl" type="date" value={m.from_date} onChange={(e) => setMembers((rows) => rows.map((r) => r._key === m._key ? { ...r, from_date: e.target.value } : r))} />
                </Field>
                <Field label={t("uvg.memberTo")}>
                  <input className="ctl" type="date" value={m.to_date} onChange={(e) => setMembers((rows) => rows.map((r) => r._key === m._key ? { ...r, to_date: e.target.value } : r))} />
                </Field>
                <CheckField label={t("uvg.representative")} checked={!!m.is_representative} onChange={(on) => setMembers((rows) => rows.map((r) => r._key === m._key ? { ...r, is_representative: on ? 1 : 0 } : r))} />
              </div>
            ))}
            <button type="button" className="btn quiet" onClick={() => setMembers((rows) => [...rows, blankMember()])}>{t("tx.addRow")}</button>
          </div>
        </Card>
        <FormActions onSave={() => void saveFn()} onDiscard={() => nav(isNew ? "/uae-vat-groups" : `/uae-vat-groups/${encodeURIComponent(name)}`)} busy={busy} ready={ready} />
      </FormLayout>
    </>
  );
}
