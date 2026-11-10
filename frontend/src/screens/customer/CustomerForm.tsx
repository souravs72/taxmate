/**
 * Customer create/edit. Callers: App.tsx /customers/new, /customers/:name.
 * API: taxmate.api.resource.insert/save on Customer, Address, Contact.
 * Customer fields use Desk layout (form_layout.get). Address stays in the Details after slot.
 */
import { useEffect, useId, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";
import { DT, METHOD } from "../../lib/frappe";
import { isValidUaeTrn } from "../../lib/trn";
import { useOpenMapped } from "../../lib/openMapped";
import { deskPayload, useDeskForm } from "../../lib/deskForm";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { UAE_EMIRATES } from "../../types/uae";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { CreateMenu } from "../../components/ActionMenu";
import DocHistory from "../../components/DocHistory";
import DocTabShell from "../../components/DocTabShell";
import { useSession } from "../../lib/session";

type AddressDoc = {
  name?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  emirate?: string;
  email_id?: string;
  phone?: string;
};

export default function CustomerForm() {
  const session = useSession();
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const addrId = useId();
  const desk = useDeskForm(DT.customer, name);
  const { isNew, existing, values, setField, seed } = desk;

  const settings = useDoc<{ customer_group?: string; territory?: string; selling_price_list?: string }>(
    DT.sellingSettings,
    DT.sellingSettings,
  );
  const create = useInsert();
  const remove = useFrappePostCall(METHOD.delete);
  const makeQuote = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.makeCustomerQuotation);
  const makeOpp = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.makeOpportunityFromCustomer);
  const opportunity = useOpenMapped("/opportunities");
  const update = useSave();

  const [addr, setAddr] = useState({
    address_line1: "",
    city: "",
    state: "",
    email_id: "",
    phone: "",
  });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [savedNotice, setSavedNotice] = useState(!!(location.state as { saved?: boolean } | null)?.saved);

  useEffect(() => {
    if (!isNew) return;
    seed({
      custom_company: session.company || "",
      customer_type: "Company",
      customer_group: settings.data?.customer_group || "",
      territory: settings.data?.territory || "",
      selling_price_list: settings.data?.selling_price_list || "",
    });
  }, [isNew, seed, session.company, settings.data]);

  const addrName = existing.data?.customer_primary_address as string | undefined;
  const address = useDoc<AddressDoc>(DT.address, addrName, addrName || null, {
    isPaused: () => !addrName,
  });
  useEffect(() => {
    const a = address.data;
    if (!a) return;
    setAddr({
      address_line1: a.address_line1 || "",
      city: a.city || "",
      state: a.emirate || a.state || "",
      email_id: a.email_id || "",
      phone: a.phone || "",
    });
  }, [address.data]);

  const group = String(values.customer_group || settings.data?.customer_group || "");
  const territory = String(values.territory || settings.data?.territory || "");
  const ready = !!String(values.customer_name || "").trim()
    && !!values.customer_type
    && !!group
    && !!territory
    && !!addr.address_line1
    && !!addr.city
    && !!addr.state;

  async function save() {
    setBusy(true);
    setSaveError(null);
    setSavedNotice(false);
    let createdName: string | undefined;
    try {
      const taxId = String(values.tax_id || "");
      if (taxId && !isValidUaeTrn(taxId)) throw new Error(t("cust.trnInvalid"));
      const payload = {
        ...deskPayload(values),
        custom_company: values.custom_company || session.company || undefined,
        customer_group: group,
        territory,
      };
      const cust = isNew
        ? await create.createDoc(DT.customer, payload)
        : await update.updateDoc(DT.customer, name, payload);
      const custName = String((cust as { name: string }).name);
      if (isNew) createdName = custName;

      const addrPayload = {
        address_title: values.customer_name,
        address_type: "Billing",
        address_line1: addr.address_line1,
        city: addr.city,
        state: addr.state,
        emirate: addr.state,
        country: "United Arab Emirates",
        email_id: addr.email_id || undefined,
        phone: addr.phone || undefined,
        links: [{ link_doctype: "Customer", link_name: custName }],
      };
      let primaryAddress = existing.data?.customer_primary_address as string | undefined;
      if (primaryAddress) {
        await update.updateDoc(DT.address, primaryAddress, addrPayload);
      } else {
        const created = await create.createDoc(DT.address, addrPayload);
        primaryAddress = String((created as { name: string }).name);
      }

      let primaryContact = existing.data?.customer_primary_contact as string | undefined;
      if (addr.email_id || addr.phone) {
        const contactPayload = {
          first_name: values.customer_name,
          email_id: addr.email_id || undefined,
          mobile_no: addr.phone || undefined,
          links: [{ link_doctype: "Customer", link_name: custName }],
        };
        if (primaryContact) {
          await update.updateDoc(DT.contact, primaryContact, contactPayload);
        } else {
          const contact = await create.createDoc(DT.contact, contactPayload);
          primaryContact = String((contact as { name: string }).name);
        }
      }

      await update.updateDoc(DT.customer, custName, {
        customer_primary_address: primaryAddress,
        customer_primary_contact: primaryContact,
      });
      if (isNew) {
        nav(`/customers/${encodeURIComponent(custName)}`, { state: { saved: true } });
      } else {
        setSavedNotice(true);
      }
    } catch (err) {
      if (createdName) {
        await remove.call({ doctype: DT.customer, name: createdName }).catch(() => undefined);
      }
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
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/customers")}>{t("nav.customers")}</button>}
        title={isNew ? t("cust.new") : String(values.customer_name || name)}
        actions={
          <>
            {!isNew ? (
              <CreateMenu
                items={[
                  {
                    key: "quotation",
                    label: t("nav.quotations"),
                    onClick: () => {
                      void makeQuote.call({ source_name: name }).then(async (res) => {
                        const mapped = res?.message;
                        if (!mapped) throw new Error(t("doc.err.mapFailed"));
                        const body: Record<string, unknown> = { ...mapped };
                        delete body.name; delete body.doctype; delete body.__islocal; delete body.__unsaved;
                        const created = await create.createDoc(DT.quotation, body) as { name: string };
                        nav(`/quotations/${encodeURIComponent(created.name)}/edit`);
                      }).catch((err) => setSaveError(err));
                    },
                  },
                  {
                    key: "so",
                    label: t("nav.salesOrders"),
                    onClick: () => nav("/orders/new", { state: { mapped: { customer: name } } }),
                  },
                  {
                    key: "opportunity",
                    label: t("doc.opportunity"),
                    disabled: opportunity.busy,
                    onClick: () => { void opportunity.open(() => makeOpp.call({ source_name: name })); },
                  },
                  {
                    key: "payment",
                    label: t("sod.createPayment"),
                    onClick: () => nav(`/payments/new?type=Receive&party=${encodeURIComponent(name)}`),
                  },
                ]}
              />
            ) : null}
            {!isNew ? <DocHistory doctype={DT.customer} name={name} /> : null}
            <button type="button" className="btn ghost" onClick={() => nav("/customers")}>{t("soc.discard")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void save()}>
              {busy ? t("soc.saving") : t("form.save")}
            </button>
          </>
        }
      />

      <DocTabShell
        doctype={DT.customer}
        name={isNew ? "" : name}
        doc={values}
        onChange={setField}
        after={
          <Card title={t("cust.address")}>
            <div className="grid2">
              <Field label={t("cust.line")} required htmlFor={`${addrId}-line`}>
                <input id={`${addrId}-line`} className="ctl" value={addr.address_line1} onChange={(e) => setAddr((a) => ({ ...a, address_line1: e.target.value }))} />
              </Field>
              <Field label={t("cust.col.city")} required htmlFor={`${addrId}-city`}>
                <input id={`${addrId}-city`} className="ctl" value={addr.city} onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))} />
              </Field>
              <Field label={t("f.emirate")} required htmlFor={`${addrId}-emirate`}>
                <select id={`${addrId}-emirate`} className="ctl" value={addr.state} onChange={(e) => setAddr((a) => ({ ...a, state: e.target.value }))}>
                  <option value="" />
                  {UAE_EMIRATES.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </Field>
              <Field label={t("cust.email")} htmlFor={`${addrId}-email`}>
                <input id={`${addrId}-email`} className="ctl" type="email" value={addr.email_id} onChange={(e) => setAddr((a) => ({ ...a, email_id: e.target.value }))} />
              </Field>
              <Field label={t("cust.phone")} htmlFor={`${addrId}-phone`}>
                <input id={`${addrId}-phone`} className="ctl" value={addr.phone} onChange={(e) => setAddr((a) => ({ ...a, phone: e.target.value }))} />
              </Field>
            </div>
          </Card>
        }
      >
        {savedNotice ? (
          <div className="alert" role="status" style={{ background: "var(--ok-bg)" }}>
            <b>{t("form.saved")}</b>
          </div>
        ) : null}
        {(saveError || opportunity.error) ? <ErrorBox error={saveError || opportunity.error} /> : null}
      </DocTabShell>
    </>
  );
}
