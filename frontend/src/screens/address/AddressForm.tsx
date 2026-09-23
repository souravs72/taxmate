/**
 * AddressForm — Phase 12.
 * Callers: App.tsx /addresses/new, /addresses/:name/edit
 * API: taxmate.api.resource.insert / save on "Address" (_CORE_MASTERS)
 * Fields: address_title, address_type, address_line1, address_line2,
 *         city, state, emirate, pincode, country, email_id, phone,
 *         links[{link_doctype, link_name}]
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useDoc, useInsert, useSave } from "../../lib/resource";
import { UAE_EMIRATES } from "../../types/uae";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";

const ADDRESS_TYPES = ["Billing", "Shipping", "Office", "Personal", "Other"];
const LINK_DOCTYPES = ["Customer", "Supplier", "Company"];

type LinkRow = { _key: string; link_doctype: string; link_name: string };
type Doc = {
  name: string;
  address_title?: string;
  address_type?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  emirate?: string;
  pincode?: string;
  country?: string;
  email_id?: string;
  phone?: string;
  links?: { link_doctype?: string; link_name?: string }[];
};

let _k = 0;
const newKey = () => `al${++_k}`;
const emptyLink = (): LinkRow => ({ _key: newKey(), link_doctype: "Customer", link_name: "" });

export default function AddressForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";

  const existing = useDoc<Doc>("Address", isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const create = useInsert();
  const update = useSave();

  const [form, setForm] = useState({
    address_title: "",
    address_type: "Billing",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    emirate: "",
    pincode: "",
    country: "United Arab Emirates",
    email_id: "",
    phone: "",
  });
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setForm({
      address_title: d.address_title || d.name || "",
      address_type: d.address_type || "Billing",
      address_line1: d.address_line1 || "",
      address_line2: d.address_line2 || "",
      city: d.city || "",
      state: d.state || "",
      emirate: d.emirate || "",
      pincode: d.pincode || "",
      country: d.country || "United Arab Emirates",
      email_id: d.email_id || "",
      phone: d.phone || "",
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

  const ready = !!form.address_title.trim() && !!form.address_line1.trim() && !!form.city.trim();

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
        const doc = (await create.createDoc("Address", payload)) as { name: string };
        nav(`/addresses/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc("Address", name, payload);
        nav(`/addresses/${encodeURIComponent(name)}`);
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
          <button type="button" className="btn quiet" onClick={() => nav("/addresses")}>
            {t("addr.title")}
          </button>
        }
        title={isNew ? t("addr.new") : form.address_title || name}
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("addr.col.title")} required>
              <input
                className="ctl"
                value={form.address_title}
                onChange={(e) => setField("address_title", e.target.value)}
                placeholder={t("addr.titlePh")}
              />
            </Field>
            <Field label={t("addr.col.type")}>
              <select
                className="ctl"
                value={form.address_type}
                onChange={(e) => setField("address_type", e.target.value)}
              >
                {ADDRESS_TYPES.map((at) => (
                  <option key={at} value={at}>
                    {at}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>
        <Card title={t("addr.location")}>
          <div className="fg">
            <Field label={t("addr.col.line1")} required>
              <input
                className="ctl"
                value={form.address_line1}
                onChange={(e) => setField("address_line1", e.target.value)}
              />
            </Field>
            <Field label={t("addr.col.line2")}>
              <input
                className="ctl"
                value={form.address_line2}
                onChange={(e) => setField("address_line2", e.target.value)}
              />
            </Field>
            <Field label={t("addr.col.city")} required>
              <input
                className="ctl"
                value={form.city}
                onChange={(e) => setField("city", e.target.value)}
              />
            </Field>
            <Field label={t("addr.col.emirate")}>
              <select
                className="ctl"
                value={form.emirate}
                onChange={(e) => setField("emirate", e.target.value)}
              >
                <option value="">{t("addr.emiratePh")}</option>
                {UAE_EMIRATES.map((em) => (
                  <option key={em} value={em}>
                    {em}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("addr.col.country")}>
              <input
                className="ctl"
                value={form.country}
                onChange={(e) => setField("country", e.target.value)}
              />
            </Field>
          </div>
        </Card>
        <Card title={t("addr.contact")}>
          <div className="fg">
            <Field label={t("addr.col.email")}>
              <input
                className="ctl"
                type="email"
                value={form.email_id}
                onChange={(e) => setField("email_id", e.target.value)}
              />
            </Field>
            <Field label={t("addr.col.phone")}>
              <input
                className="ctl"
                type="tel"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
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
          onDiscard={() => nav(isNew ? "/addresses" : `/addresses/${encodeURIComponent(name)}`)}
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
