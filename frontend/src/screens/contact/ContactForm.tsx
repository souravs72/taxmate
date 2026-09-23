/**
 * ContactForm — Phase 12.
 * Callers: App.tsx /contacts/new, /contacts/:name/edit
 * API: taxmate.api.resource.insert / save on "Contact" (_CORE_MASTERS)
 * Fields: first_name, last_name, email_id, phone, mobile_no, gender,
 *         links[{link_doctype, link_name}]
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useDoc, useInsert, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";

const LINK_DOCTYPES = ["Customer", "Supplier", "Company"];
const GENDERS = ["", "Male", "Female", "Other"];

type LinkRow = { _key: string; link_doctype: string; link_name: string };
type Doc = {
  name: string;
  first_name?: string;
  last_name?: string;
  email_id?: string;
  phone?: string;
  mobile_no?: string;
  gender?: string;
  links?: { link_doctype?: string; link_name?: string }[];
};

let _k = 0;
const newKey = () => `cl${++_k}`;
const emptyLink = (): LinkRow => ({ _key: newKey(), link_doctype: "Customer", link_name: "" });

export default function ContactForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";

  const existing = useDoc<Doc>("Contact", isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const create = useInsert();
  const update = useSave();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email_id: "",
    phone: "",
    mobile_no: "",
    gender: "",
  });
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setForm({
      first_name: d.first_name || "",
      last_name: d.last_name || "",
      email_id: d.email_id || "",
      phone: d.phone || "",
      mobile_no: d.mobile_no || "",
      gender: d.gender || "",
    });
    setLinks(
      (d.links ?? []).map((l) => ({
        _key: newKey(),
        link_doctype: l.link_doctype || "Customer",
        link_name: l.link_name || "",
      })),
    );
  }, [existing.data]);

  const setField = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setLink = (key: string, field: keyof Omit<LinkRow, "_key">, value: string) =>
    setLinks((ls) => ls.map((l) => (l._key === key ? { ...l, [field]: value } : l)));
  const addLink = () => setLinks((ls) => [...ls, emptyLink()]);
  const removeLink = (key: string) => setLinks((ls) => ls.filter((l) => l._key !== key));

  const ready = !!form.first_name.trim();

  async function saveFn() {
    if (!ready) return;
    setBusy(true);
    setSaveError(null);
    try {
      const payload = {
        ...form,
        links: links.filter((l) => l.link_name).map(({ _key: _k2, ...l }) => l),
      };
      if (isNew) {
        const doc = (await create.createDoc("Contact", payload)) as { name: string };
        nav(`/contacts/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc("Contact", name, payload);
        nav(`/contacts/${encodeURIComponent(name)}`);
      }
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/contacts")}>
            {t("cnt.title")}
          </button>
        }
        title={
          isNew
            ? t("cnt.new")
            : [form.first_name, form.last_name].filter(Boolean).join(" ") || name
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("cnt.col.firstName")} required>
              <input
                className="ctl"
                value={form.first_name}
                onChange={(e) => setField("first_name", e.target.value)}
              />
            </Field>
            <Field label={t("cnt.col.lastName")}>
              <input
                className="ctl"
                value={form.last_name}
                onChange={(e) => setField("last_name", e.target.value)}
              />
            </Field>
            <Field label={t("cnt.col.gender")}>
              <select
                className="ctl"
                value={form.gender}
                onChange={(e) => setField("gender", e.target.value)}
              >
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g || t("cnt.genderPh")}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>
        <Card title={t("cnt.contactInfo")}>
          <div className="fg">
            <Field label={t("cnt.col.email")}>
              <input
                className="ctl"
                type="email"
                value={form.email_id}
                onChange={(e) => setField("email_id", e.target.value)}
              />
            </Field>
            <Field label={t("cnt.col.phone")}>
              <input
                className="ctl"
                type="tel"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
              />
            </Field>
            <Field label={t("cnt.col.mobile")}>
              <input
                className="ctl"
                type="tel"
                value={form.mobile_no}
                onChange={(e) => setField("mobile_no", e.target.value)}
              />
            </Field>
          </div>
        </Card>
        <Card title={t("addr.links")}>
          {links.map((l) => (
            <div key={l._key} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select
                className="ctl"
                style={{ flex: "0 0 150px" }}
                value={l.link_doctype}
                onChange={(e) => setLink(l._key, "link_doctype", e.target.value)}
              >
                {LINK_DOCTYPES.map((ld) => (
                  <option key={ld} value={ld}>
                    {ld}
                  </option>
                ))}
              </select>
              <input
                className="ctl"
                style={{ flex: 1 }}
                value={l.link_name}
                onChange={(e) => setLink(l._key, "link_name", e.target.value)}
                placeholder={t("addr.linkNamePh")}
              />
              <button type="button" className="btn ghost" onClick={() => removeLink(l._key)}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn ghost" onClick={addLink}>
            {t("addr.addLink")}
          </button>
        </Card>
        <FormActions
          onSave={() => void saveFn()}
          onDiscard={() => nav(isNew ? "/contacts" : `/contacts/${encodeURIComponent(name)}`)}
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
