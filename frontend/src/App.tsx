/**
 * TaxMate SPA root router.
 * Callers: main.tsx mounts <App />. Routes DeliveryNoteForm at /delivery-notes/new and /:name/edit.
 * Schema: React Router paths only; DN form uses DT.deliveryNote + METHOD.submit.
 * User: "Implement the plan as specified, it is attached for your reference… complete all the to-dos."
 */
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useFrappeAuth } from "frappe-react-sdk";

import AppShell from "./components/AppShell";
import { ErrorBox, Loading } from "./components/ui";
import { hasCsrfToken } from "./lib/frappe";
import { LangProvider } from "./lib/i18n";
import { SessionProvider } from "./lib/session";
import SalesOrderList from "./screens/sales-order/SalesOrderList";
import SalesOrderDetail from "./screens/sales-order/SalesOrderDetail";
import SalesOrderCreate from "./screens/sales-order/SalesOrderCreate";
import Dashboard from "./screens/dashboard/Dashboard";
import SalesHub from "./screens/sales/SalesHub";
import CustomerList from "./screens/customer/CustomerList";
import CustomerForm from "./screens/customer/CustomerForm";
import SupplierList from "./screens/supplier/SupplierList";
import SupplierForm from "./screens/supplier/SupplierForm";
import InvoiceList from "./screens/invoice/InvoiceList";
import InvoiceForm from "./screens/invoice/InvoiceForm";
import InvoiceDetail from "./screens/invoice/InvoiceDetail";
import CreditNoteForm from "./screens/invoice/CreditNoteForm";
import PaymentList from "./screens/payment/PaymentList";
import PaymentForm from "./screens/payment/PaymentForm";
import PaymentDetail from "./screens/payment/PaymentDetail";
import Receivables from "./screens/receivables/Receivables";
import Payables from "./screens/payables/Payables";
import ItemList from "./screens/item/ItemList";
import ItemForm from "./screens/item/ItemForm";
import ItemGroupList from "./screens/item-group/ItemGroupList";
import ItemGroupForm from "./screens/item-group/ItemGroupForm";
import BrandList from "./screens/brand/BrandList";
import BrandForm from "./screens/brand/BrandForm";
import UomList from "./screens/uom/UomList";
import UomForm from "./screens/uom/UomForm";
import DeliveryNoteList from "./screens/delivery-note/DeliveryNoteList";
import DeliveryNoteDetail from "./screens/delivery-note/DeliveryNoteDetail";
import DeliveryNoteForm from "./screens/delivery-note/DeliveryNoteForm";
import DeliveryNoteReturn from "./screens/delivery-note/DeliveryNoteReturn";
import StockEntryList from "./screens/stock-entry/StockEntryList";
import StockEntryForm from "./screens/stock-entry/StockEntryForm";
import StockEntryDetail from "./screens/stock-entry/StockEntryDetail";
import StockReconciliationList from "./screens/stock-reconciliation/StockReconciliationList";
import StockReconciliationForm from "./screens/stock-reconciliation/StockReconciliationForm";
import StockReconciliationDetail from "./screens/stock-reconciliation/StockReconciliationDetail";
import QuotationList from "./screens/quotation/QuotationList";
import QuotationForm from "./screens/quotation/QuotationForm";
import QuotationDetail from "./screens/quotation/QuotationDetail";
import MaterialRequestList from "./screens/material-request/MaterialRequestList";
import MaterialRequestForm from "./screens/material-request/MaterialRequestForm";
import MaterialRequestDetail from "./screens/material-request/MaterialRequestDetail";
import WarehouseForm from "./screens/warehouse/WarehouseForm";
import PurchaseInvoiceList from "./screens/purchase-invoice/PurchaseInvoiceList";
import PurchaseInvoiceForm from "./screens/purchase-invoice/PurchaseInvoiceForm";
import PurchaseInvoiceDetail from "./screens/purchase-invoice/PurchaseInvoiceDetail";
import DebitNoteForm from "./screens/purchase-invoice/DebitNoteForm";
import IncomingInvoiceList from "./screens/incoming-invoice/IncomingInvoiceList";
// Callers: App Routes /purchase-invoices/:name/return. No other DebitNote. User: Implement the plan… complete all the to-dos.
import IncomingInvoiceDetail from "./screens/incoming-invoice/IncomingInvoiceDetail";
import PurchaseOrderList from "./screens/purchase-order/PurchaseOrderList";
import PurchaseOrderDetail from "./screens/purchase-order/PurchaseOrderDetail";
import PurchaseOrderForm from "./screens/purchase-order/PurchaseOrderForm";
import PurchaseReceiptList from "./screens/purchase-receipt/PurchaseReceiptList";
import PurchaseReceiptDetail from "./screens/purchase-receipt/PurchaseReceiptDetail";
import PurchaseReceiptForm from "./screens/purchase-receipt/PurchaseReceiptForm";
import PurchaseReceiptReturn from "./screens/purchase-receipt/PurchaseReceiptReturn";
import JournalEntryList from "./screens/journal-entry/JournalEntryList";
import JournalEntryDetail from "./screens/journal-entry/JournalEntryDetail";
import JournalEntryForm from "./screens/journal-entry/JournalEntryForm";
import ChartOfAccounts from "./screens/account/ChartOfAccounts";
import AccountDetail from "./screens/account/AccountDetail";
import ReportList from "./screens/reports/ReportList";
import ReportRunner from "./screens/reports/ReportRunner";
import WarehouseList from "./screens/warehouse/WarehouseList";
import WarehouseDetail from "./screens/warehouse/WarehouseDetail";
import TaxTemplateList from "./screens/tax-template/TaxTemplateList";
import TaxTemplateDetail from "./screens/tax-template/TaxTemplateDetail";
import EInvoiceLog from "./screens/compliance/EInvoiceLog";
import TaxSettings from "./screens/compliance/TaxSettings";
import Vat201List from "./screens/vat-201/Vat201List";
import Vat201Detail from "./screens/vat-201/Vat201Detail";
import Vat201Form from "./screens/vat-201/Vat201Form";
import CtFilingList from "./screens/ct-filing/CtFilingList";
import CtFilingDetail from "./screens/ct-filing/CtFilingDetail";
import EsrFilingList from "./screens/esr/EsrFilingList";
import EsrFilingDetail from "./screens/esr/EsrFilingDetail";
import UboRegisterList from "./screens/ubo/UboRegisterList";
import UboRegisterDetail from "./screens/ubo/UboRegisterDetail";
import LateFilingList from "./screens/late-filing/LateFilingList";
import LateFilingDetail from "./screens/late-filing/LateFilingDetail";
import TeamList from "./screens/team/TeamList";
import TeamInvite from "./screens/team/TeamInvite";
import Profile from "./screens/team/Profile";
import BankAccountList from "./screens/bank-account/BankAccountList";
import BankAccountDetail from "./screens/bank-account/BankAccountDetail";
import BankAccountForm from "./screens/bank-account/BankAccountForm";
import ModeOfPaymentList from "./screens/mode-of-payment/ModeOfPaymentList";
import ModeOfPaymentDetail from "./screens/mode-of-payment/ModeOfPaymentDetail";
import ModeOfPaymentForm from "./screens/mode-of-payment/ModeOfPaymentForm";
import PaymentTermsTemplateList from "./screens/payment-terms-template/PaymentTermsTemplateList";
import PaymentTermsTemplateForm from "./screens/payment-terms-template/PaymentTermsTemplateForm";
import PaymentTermsTemplateDetail from "./screens/payment-terms-template/PaymentTermsTemplateDetail";
import PriceListList from "./screens/price-list/PriceListList";
import PriceListForm from "./screens/price-list/PriceListForm";
import PriceListDetail from "./screens/price-list/PriceListDetail";
import SerialNoList from "./screens/serial-no/SerialNoList";
import SerialNoDetail from "./screens/serial-no/SerialNoDetail";
import BatchList from "./screens/batch/BatchList";
import BatchDetail from "./screens/batch/BatchDetail";
import LandedCostVoucherList from "./screens/landed-cost-voucher/LandedCostVoucherList";
import LandedCostVoucherForm from "./screens/landed-cost-voucher/LandedCostVoucherForm";
import LandedCostVoucherDetail from "./screens/landed-cost-voucher/LandedCostVoucherDetail";
import PricingRuleList from "./screens/pricing-rule/PricingRuleList";
import PricingRuleForm from "./screens/pricing-rule/PricingRuleForm";
import PricingRuleDetail from "./screens/pricing-rule/PricingRuleDetail";
import CustomerGroupList from "./screens/customer-group/CustomerGroupList";
import CustomerGroupForm from "./screens/customer-group/CustomerGroupForm";
import SupplierGroupList from "./screens/supplier-group/SupplierGroupList";
import SupplierGroupForm from "./screens/supplier-group/SupplierGroupForm";
import TerritoryList from "./screens/territory/TerritoryList";
import TerritoryForm from "./screens/territory/TerritoryForm";
import TaxTemplateForm from "./screens/tax-template/TaxTemplateForm";
import TaxCategoryList from "./screens/tax-category/TaxCategoryList";
import TaxCategoryForm from "./screens/tax-category/TaxCategoryForm";
import ItemTaxTemplateList from "./screens/item-tax-template/ItemTaxTemplateList";
import ItemTaxTemplateDetail from "./screens/item-tax-template/ItemTaxTemplateDetail";
import AddressList from "./screens/address/AddressList";
import AddressForm from "./screens/address/AddressForm";
import AddressDetail from "./screens/address/AddressDetail";
import ContactList from "./screens/contact/ContactList";
import ContactForm from "./screens/contact/ContactForm";
import ContactDetail from "./screens/contact/ContactDetail";
import FiscalYearList from "./screens/fiscal-year/FiscalYearList";
import FiscalYearDetail from "./screens/fiscal-year/FiscalYearDetail";
import AccountForm from "./screens/account/AccountForm";
import BankReconciliation from "./screens/bank-reconciliation/BankReconciliation";
import TermsAndConditionsList from "./screens/terms/TermsAndConditionsList";
import TermsAndConditionsForm from "./screens/terms/TermsAndConditionsForm";
import SupplierQuotationList from "./screens/supplier-quotation/SupplierQuotationList";
import SupplierQuotationForm from "./screens/supplier-quotation/SupplierQuotationForm";
import SupplierQuotationDetail from "./screens/supplier-quotation/SupplierQuotationDetail";
import BomList from "./screens/bom/BomList";
import BomForm from "./screens/bom/BomForm";
import BomDetail from "./screens/bom/BomDetail";
import WorkOrderList from "./screens/work-order/WorkOrderList";
import WorkOrderForm from "./screens/work-order/WorkOrderForm";
import WorkOrderDetail from "./screens/work-order/WorkOrderDetail";
import LeadList from "./screens/lead/LeadList";
import LeadForm from "./screens/lead/LeadForm";
import LeadDetail from "./screens/lead/LeadDetail";
import NotFound from "./screens/NotFound";

export default function App() {
  const { currentUser, isLoading, error } = useFrappeAuth();
  const needsLogin = !isLoading && (!!error || !currentUser || currentUser === "Guest");

  useEffect(() => {
    if (!needsLogin) return;
    const back = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?redirect-to=${back}`;
  }, [needsLogin]);

  if (isLoading || needsLogin) return <Loading />;

  return (
    <LangProvider>
    <SessionProvider>
      <AppShell>
        {!hasCsrfToken() && (
          <ErrorBox error={{ message:
            "This page was served without a CSRF token, so saving will fail. " +
            "It usually means index.html was served statically instead of rendered " +
            "by Frappe — check taxmate/www/taxmate.py and that the build copied " +
            "index.html to www/taxmate.html." }} />
        )}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<SalesOrderList />} />
          <Route path="/orders/new" element={<SalesOrderCreate />} />
          <Route path="/orders/:name" element={<SalesOrderDetail />} />
          <Route path="/delivery-notes" element={<DeliveryNoteList />} />
          <Route path="/delivery-notes/new" element={<DeliveryNoteForm />} />
          <Route path="/delivery-notes/:name/return" element={<DeliveryNoteReturn />} />
          <Route path="/delivery-notes/:name/edit" element={<DeliveryNoteForm />} />
          <Route path="/delivery-notes/:name" element={<DeliveryNoteDetail />} />
          <Route path="/customers" element={<CustomerList />} />
          <Route path="/customers/:name" element={<CustomerForm />} />
          <Route path="/suppliers" element={<SupplierList />} />
          <Route path="/suppliers/:name" element={<SupplierForm />} />
          <Route path="/incoming-invoices" element={<IncomingInvoiceList />} />
          <Route path="/incoming-invoices/:name" element={<IncomingInvoiceDetail />} />
          <Route path="/purchase-orders" element={<PurchaseOrderList />} />
          <Route path="/purchase-orders/new" element={<PurchaseOrderForm />} />
          <Route path="/purchase-orders/:name" element={<PurchaseOrderDetail />} />
          <Route path="/purchase-receipts" element={<PurchaseReceiptList />} />
          <Route path="/purchase-receipts/new" element={<PurchaseReceiptForm />} />
          <Route path="/purchase-receipts/:name/return" element={<PurchaseReceiptReturn />} />
          <Route path="/purchase-receipts/:name/edit" element={<PurchaseReceiptForm />} />
          <Route path="/purchase-receipts/:name" element={<PurchaseReceiptDetail />} />
          <Route path="/purchase-invoices" element={<PurchaseInvoiceList />} />
          <Route path="/purchase-invoices/new" element={<PurchaseInvoiceForm />} />
          <Route path="/purchase-invoices/:name/return" element={<DebitNoteForm />} />
          <Route path="/purchase-invoices/:name/edit" element={<PurchaseInvoiceForm />} />
          <Route path="/purchase-invoices/:name" element={<PurchaseInvoiceDetail />} />
          <Route path="/invoices" element={<InvoiceList />} />
          <Route path="/invoices/new" element={<InvoiceForm />} />
          <Route path="/invoices/:name/return" element={<CreditNoteForm />} />
          <Route path="/invoices/:name/edit" element={<InvoiceForm />} />
          <Route path="/invoices/:name" element={<InvoiceDetail />} />
          <Route path="/payments" element={<PaymentList />} />
          <Route path="/payments/new" element={<PaymentForm />} />
          <Route path="/payments/:name/edit" element={<PaymentForm />} />
          <Route path="/payments/:name" element={<PaymentDetail />} />
          <Route path="/receivables" element={<Receivables />} />
          <Route path="/payables" element={<Payables />} />
          <Route path="/journals" element={<JournalEntryList />} />
          <Route path="/journals/new" element={<JournalEntryForm />} />
          <Route path="/journals/:name/edit" element={<JournalEntryForm />} />
          <Route path="/journals/:name" element={<JournalEntryDetail />} />
          <Route path="/accounts" element={<ChartOfAccounts />} />
          <Route path="/accounts/:name" element={<AccountDetail />} />
          <Route path="/reports" element={<ReportList />} />
          <Route path="/reports/:report" element={<ReportRunner />} />
          <Route path="/warehouses" element={<WarehouseList />} />
          <Route path="/warehouses/new" element={<WarehouseForm />} />
          <Route path="/warehouses/:name/edit" element={<WarehouseForm />} />
          <Route path="/warehouses/:name" element={<WarehouseDetail />} />
          <Route path="/tax-templates" element={<TaxTemplateList />} />
          <Route path="/tax-templates/:kind/:name" element={<TaxTemplateDetail />} />
          <Route path="/catalogue/items" element={<ItemList />} />
          <Route path="/catalogue/items/:name" element={<ItemForm />} />
          <Route path="/catalogue/item-groups" element={<ItemGroupList />} />
          <Route path="/catalogue/item-groups/new" element={<ItemGroupForm />} />
          <Route path="/catalogue/item-groups/:name" element={<ItemGroupForm />} />
          <Route path="/catalogue/brands" element={<BrandList />} />
          <Route path="/catalogue/brands/new" element={<BrandForm />} />
          <Route path="/catalogue/brands/:name" element={<BrandForm />} />
          <Route path="/catalogue/uoms" element={<UomList />} />
          <Route path="/catalogue/uoms/new" element={<UomForm />} />
          <Route path="/catalogue/uoms/:name" element={<UomForm />} />
          <Route path="/vat-201" element={<Vat201List />} />
          <Route path="/vat-201/new" element={<Vat201Form />} />
          <Route path="/vat-201/:name" element={<Vat201Detail />} />
          <Route path="/ct-filings" element={<CtFilingList />} />
          <Route path="/ct-filings/:name" element={<CtFilingDetail />} />
          <Route path="/esr" element={<EsrFilingList />} />
          <Route path="/esr/:name" element={<EsrFilingDetail />} />
          <Route path="/ubo" element={<UboRegisterList />} />
          <Route path="/ubo/:name" element={<UboRegisterDetail />} />
          <Route path="/late-filings" element={<LateFilingList />} />
          <Route path="/late-filings/:name" element={<LateFilingDetail />} />
          <Route path="/e-invoice-log" element={<EInvoiceLog />} />
          <Route path="/tax-settings" element={<TaxSettings />} />
          <Route path="/team" element={<TeamList />} />
          <Route path="/team/new" element={<TeamInvite />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/sales" element={<SalesHub />} />
          <Route path="/sales/customers" element={<Navigate to="/customers" replace />} />
          <Route path="/sales/invoices" element={<Navigate to="/invoices" replace />} />
          <Route path="/sales/receivables" element={<Navigate to="/receivables" replace />} />
          <Route path="/stock-entries" element={<StockEntryList />} />
          <Route path="/stock-entries/new" element={<StockEntryForm />} />
          <Route path="/stock-entries/:name/edit" element={<StockEntryForm />} />
          <Route path="/stock-entries/:name" element={<StockEntryDetail />} />
          <Route path="/stock-reconciliations" element={<StockReconciliationList />} />
          <Route path="/stock-reconciliations/new" element={<StockReconciliationForm />} />
          <Route path="/stock-reconciliations/:name/edit" element={<StockReconciliationForm />} />
          <Route path="/stock-reconciliations/:name" element={<StockReconciliationDetail />} />
          <Route path="/quotations" element={<QuotationList />} />
          <Route path="/quotations/new" element={<QuotationForm />} />
          <Route path="/quotations/:name/edit" element={<QuotationForm />} />
          <Route path="/quotations/:name" element={<QuotationDetail />} />
          <Route path="/material-requests" element={<MaterialRequestList />} />
          <Route path="/material-requests/new" element={<MaterialRequestForm />} />
          <Route path="/material-requests/:name/edit" element={<MaterialRequestForm />} />
          <Route path="/material-requests/:name" element={<MaterialRequestDetail />} />
          <Route path="/orders/:name/edit" element={<SalesOrderCreate />} />
          <Route path="/purchase-orders/:name/edit" element={<PurchaseOrderForm />} />
          <Route path="/bank-accounts" element={<BankAccountList />} />
          <Route path="/bank-accounts/new" element={<BankAccountForm />} />
          <Route path="/bank-accounts/:name/edit" element={<BankAccountForm />} />
          <Route path="/bank-accounts/:name" element={<BankAccountDetail />} />
          <Route path="/modes-of-payment" element={<ModeOfPaymentList />} />
          <Route path="/modes-of-payment/new" element={<ModeOfPaymentForm />} />
          <Route path="/modes-of-payment/:name/edit" element={<ModeOfPaymentForm />} />
          <Route path="/modes-of-payment/:name" element={<ModeOfPaymentDetail />} />
          <Route path="/payment-terms-templates" element={<PaymentTermsTemplateList />} />
          <Route path="/payment-terms-templates/new" element={<PaymentTermsTemplateForm />} />
          <Route path="/payment-terms-templates/:name/edit" element={<PaymentTermsTemplateForm />} />
          <Route path="/payment-terms-templates/:name" element={<PaymentTermsTemplateDetail />} />
          <Route path="/price-lists" element={<PriceListList />} />
          <Route path="/price-lists/new" element={<PriceListForm />} />
          <Route path="/price-lists/:name/edit" element={<PriceListForm />} />
          <Route path="/price-lists/:name" element={<PriceListDetail />} />
          <Route path="/serial-nos" element={<SerialNoList />} />
          <Route path="/serial-nos/:name" element={<SerialNoDetail />} />
          <Route path="/batches" element={<BatchList />} />
          <Route path="/batches/:name" element={<BatchDetail />} />
          <Route path="/landed-cost-vouchers" element={<LandedCostVoucherList />} />
          <Route path="/landed-cost-vouchers/new" element={<LandedCostVoucherForm />} />
          <Route path="/landed-cost-vouchers/:name/edit" element={<LandedCostVoucherForm />} />
          <Route path="/landed-cost-vouchers/:name" element={<LandedCostVoucherDetail />} />
          <Route path="/pricing-rules" element={<PricingRuleList />} />
          <Route path="/pricing-rules/new" element={<PricingRuleForm />} />
          <Route path="/pricing-rules/:name/edit" element={<PricingRuleForm />} />
          <Route path="/pricing-rules/:name" element={<PricingRuleDetail />} />
          <Route path="/customer-groups" element={<CustomerGroupList />} />
          <Route path="/customer-groups/new" element={<CustomerGroupForm />} />
          <Route path="/customer-groups/:name/edit" element={<CustomerGroupForm />} />
          <Route path="/customer-groups/:name" element={<CustomerGroupForm />} />
          <Route path="/supplier-groups" element={<SupplierGroupList />} />
          <Route path="/supplier-groups/new" element={<SupplierGroupForm />} />
          <Route path="/supplier-groups/:name/edit" element={<SupplierGroupForm />} />
          <Route path="/supplier-groups/:name" element={<SupplierGroupForm />} />
          <Route path="/territories" element={<TerritoryList />} />
          <Route path="/territories/new" element={<TerritoryForm />} />
          <Route path="/territories/:name/edit" element={<TerritoryForm />} />
          <Route path="/territories/:name" element={<TerritoryForm />} />
          {/* Phase 11-15 wiring */}
          <Route path="/tax-templates/:kind/new" element={<TaxTemplateForm />} />
          <Route path="/tax-templates/:kind/:name/edit" element={<TaxTemplateForm />} />
          <Route path="/tax-categories" element={<TaxCategoryList />} />
          <Route path="/tax-categories/new" element={<TaxCategoryForm />} />
          <Route path="/tax-categories/:name/edit" element={<TaxCategoryForm />} />
          <Route path="/tax-categories/:name" element={<TaxCategoryForm />} />
          <Route path="/item-tax-templates" element={<ItemTaxTemplateList />} />
          <Route path="/item-tax-templates/:name" element={<ItemTaxTemplateDetail />} />
          <Route path="/addresses" element={<AddressList />} />
          <Route path="/addresses/new" element={<AddressForm />} />
          <Route path="/addresses/:name/edit" element={<AddressForm />} />
          <Route path="/addresses/:name" element={<AddressDetail />} />
          <Route path="/contacts" element={<ContactList />} />
          <Route path="/contacts/new" element={<ContactForm />} />
          <Route path="/contacts/:name/edit" element={<ContactForm />} />
          <Route path="/contacts/:name" element={<ContactDetail />} />
          <Route path="/fiscal-years" element={<FiscalYearList />} />
          <Route path="/fiscal-years/:name" element={<FiscalYearDetail />} />
          <Route path="/accounts/new" element={<AccountForm />} />
          <Route path="/accounts/:name/edit" element={<AccountForm />} />
          <Route path="/bank-reconciliation" element={<BankReconciliation />} />
          <Route path="/terms-and-conditions" element={<TermsAndConditionsList />} />
          <Route path="/terms-and-conditions/new" element={<TermsAndConditionsForm />} />
          <Route path="/terms-and-conditions/:name/edit" element={<TermsAndConditionsForm />} />
          <Route path="/terms-and-conditions/:name" element={<TermsAndConditionsForm />} />
          {/* Phase 16: Supplier Quotation */}
          <Route path="/supplier-quotations" element={<SupplierQuotationList />} />
          <Route path="/supplier-quotations/new" element={<SupplierQuotationForm />} />
          <Route path="/supplier-quotations/:name/edit" element={<SupplierQuotationForm />} />
          <Route path="/supplier-quotations/:name" element={<SupplierQuotationDetail />} />
          {/* Phase 18: BOM + Work Order */}
          <Route path="/boms" element={<BomList />} />
          <Route path="/boms/new" element={<BomForm />} />
          <Route path="/boms/:name/edit" element={<BomForm />} />
          <Route path="/boms/:name" element={<BomDetail />} />
          <Route path="/work-orders" element={<WorkOrderList />} />
          <Route path="/work-orders/new" element={<WorkOrderForm />} />
          <Route path="/work-orders/:name/edit" element={<WorkOrderForm />} />
          <Route path="/work-orders/:name" element={<WorkOrderDetail />} />
          {/* Phase 21: Lead */}
          <Route path="/leads" element={<LeadList />} />
          <Route path="/leads/new" element={<LeadForm />} />
          <Route path="/leads/:name/edit" element={<LeadForm />} />
          <Route path="/leads/:name" element={<LeadDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppShell>
    </SessionProvider>
    </LangProvider>
  );
}
