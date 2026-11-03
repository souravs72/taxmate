/**
 * List, detail, and draft fields for the eight Desk documents that had no SPA screen.
 * Callers: RegisterList, RegisterDetail, RegisterForm, App.tsx routes.
 * API: taxmate.api.resource.get_list / get / insert / save, plus taxmate.api.linked_docs.
 * User: build Opportunity, Request for Quotation, Shipment, Installation Note,
 * Delivery Trip, Payment Request, and the two subcontracting documents.
 */

export type FieldKind = "text" | "date" | "datetime" | "number" | "select" | "link";

export type FieldSpec = {
  key: string;
  label: string;
  kind: FieldKind;
  link?: string;
  options?: string[];
  required?: boolean;
  readOnly?: boolean;
};

export type RegisterSpec = {
  doctype: string;
  titleKey: string;
  path: string;
  searchField: string;
  listFields: string[];
  columns: { key: string; label: string; field: string; date?: boolean; money?: boolean }[];
  facts: { key: string; label: string; field: string; date?: boolean; money?: boolean }[];
  fields: FieldSpec[];
  linesKey?: string;
  editLines?: boolean;
  suppliers?: boolean;
  submittable: boolean;
  /** True when Desk lets you start a blank document. The others open from a source document. */
  standalone: boolean;
  empty: string;
};

export const REGISTERS: Record<string, RegisterSpec> = {
  opportunity: {
    doctype: "Opportunity",
    titleKey: "reg.opportunity.title",
    path: "/opportunities",
    searchField: "party_name",
    listFields: ["name", "party_name", "status", "opportunity_type", "company", "transaction_date"],
    columns: [
      { key: "party", label: "reg.col.party", field: "party_name" },
      { key: "type", label: "reg.col.type", field: "opportunity_type" },
      { key: "date", label: "reg.col.date", field: "transaction_date", date: true },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    facts: [
      { key: "party", label: "reg.col.party", field: "party_name" },
      { key: "from", label: "reg.col.from", field: "opportunity_from" },
      { key: "type", label: "reg.col.type", field: "opportunity_type" },
      { key: "date", label: "reg.col.date", field: "transaction_date", date: true },
      { key: "company", label: "reg.col.company", field: "company" },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    fields: [
      { key: "opportunity_from", label: "reg.col.opportunityFrom", kind: "select", options: ["Lead", "Customer"], required: true },
      { key: "party_name", label: "reg.col.party", kind: "link", required: true },
      { key: "opportunity_type", label: "reg.col.type", kind: "text" },
      { key: "company", label: "reg.col.company", kind: "link", link: "Company", required: true },
      { key: "transaction_date", label: "reg.col.date", kind: "date", required: true },
      { key: "status", label: "reg.col.status", kind: "select", options: ["Open", "Replied", "Quotation", "Converted", "Lost", "Closed"], required: true },
    ],
    linesKey: "items",
    editLines: true,
    submittable: false,
    standalone: true,
    empty: "reg.opportunity.empty",
  },
  rfq: {
    doctype: "Request for Quotation",
    titleKey: "reg.rfq.title",
    path: "/request-for-quotations",
    searchField: "name",
    listFields: ["name", "transaction_date", "status", "company"],
    columns: [
      { key: "name", label: "reg.col.name", field: "name" },
      { key: "date", label: "reg.col.date", field: "transaction_date", date: true },
      { key: "company", label: "reg.col.company", field: "company" },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    facts: [
      { key: "date", label: "reg.col.date", field: "transaction_date", date: true },
      { key: "company", label: "reg.col.company", field: "company" },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    fields: [
      { key: "company", label: "reg.col.company", kind: "link", link: "Company", required: true },
      { key: "transaction_date", label: "reg.col.date", kind: "date", required: true },
    ],
    linesKey: "items",
    editLines: true,
    suppliers: true,
    submittable: true,
    standalone: true,
    empty: "reg.rfq.empty",
  },
  shipment: {
    doctype: "Shipment",
    titleKey: "reg.shipment.title",
    path: "/shipments",
    searchField: "name",
    listFields: ["name", "status", "pickup_date", "tracking_status"],
    columns: [
      { key: "name", label: "reg.col.name", field: "name" },
      { key: "date", label: "reg.col.pickup", field: "pickup_date", date: true },
      { key: "tracking", label: "reg.col.tracking", field: "tracking_status" },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    facts: [
      { key: "pickup", label: "reg.col.pickupDate", field: "pickup_date", date: true },
      { key: "from", label: "reg.col.pickupAddress", field: "pickup_address_name" },
      { key: "to", label: "reg.col.deliveryAddress", field: "delivery_address_name" },
      { key: "value", label: "reg.col.valueOfGoods", field: "value_of_goods", money: true },
      { key: "tracking", label: "reg.col.tracking", field: "tracking_status" },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    fields: [
      { key: "pickup_address_name", label: "reg.col.pickupAddress", kind: "link", link: "Address", required: true },
      { key: "delivery_address_name", label: "reg.col.deliveryAddress", kind: "link", link: "Address", required: true },
      { key: "pickup_date", label: "reg.col.pickupDate", kind: "date", required: true },
      { key: "value_of_goods", label: "reg.col.valueOfGoods", kind: "number", required: true },
      { key: "description_of_content", label: "reg.col.contents", kind: "text", required: true },
    ],
    linesKey: "shipment_delivery_note",
    submittable: true,
    standalone: false,
    empty: "reg.shipment.empty",
  },
  installation: {
    doctype: "Installation Note",
    titleKey: "reg.installation.title",
    path: "/installation-notes",
    searchField: "customer",
    listFields: ["name", "customer", "inst_date", "status", "company"],
    columns: [
      { key: "customer", label: "reg.col.customer", field: "customer" },
      { key: "date", label: "reg.col.date", field: "inst_date", date: true },
      { key: "company", label: "reg.col.company", field: "company" },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    facts: [
      { key: "customer", label: "reg.col.customer", field: "customer" },
      { key: "date", label: "reg.col.installDate", field: "inst_date", date: true },
      { key: "territory", label: "reg.col.territory", field: "territory" },
      { key: "company", label: "reg.col.company", field: "company" },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    fields: [
      { key: "customer", label: "reg.col.customer", kind: "link", link: "Customer", required: true },
      { key: "inst_date", label: "reg.col.installDate", kind: "date", required: true },
      { key: "territory", label: "reg.col.territory", kind: "link", link: "Territory", required: true },
      { key: "company", label: "reg.col.company", kind: "link", link: "Company", required: true },
    ],
    linesKey: "items",
    submittable: true,
    standalone: false,
    empty: "reg.installation.empty",
  },
  trip: {
    doctype: "Delivery Trip",
    titleKey: "reg.deliveryTrip.title",
    path: "/delivery-trips",
    searchField: "name",
    listFields: ["name", "driver", "status", "departure_time", "company"],
    columns: [
      { key: "name", label: "reg.col.name", field: "name" },
      { key: "driver", label: "reg.col.driver", field: "driver" },
      { key: "when", label: "reg.col.departure", field: "departure_time" },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    facts: [
      { key: "driver", label: "reg.col.driver", field: "driver" },
      { key: "vehicle", label: "reg.col.vehicle", field: "vehicle" },
      { key: "when", label: "reg.col.departure", field: "departure_time" },
      { key: "company", label: "reg.col.company", field: "company" },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    fields: [
      { key: "company", label: "reg.col.company", kind: "link", link: "Company", required: true },
      { key: "driver", label: "reg.col.driver", kind: "link", link: "Driver" },
      { key: "vehicle", label: "reg.col.vehicle", kind: "link", link: "Vehicle", required: true },
      { key: "departure_time", label: "reg.col.departure", kind: "datetime", required: true },
    ],
    linesKey: "delivery_stops",
    submittable: true,
    standalone: false,
    empty: "reg.deliveryTrip.empty",
  },
  paymentRequest: {
    doctype: "Payment Request",
    titleKey: "reg.paymentRequest.title",
    path: "/payment-requests",
    searchField: "party",
    listFields: ["name", "party", "status", "grand_total", "transaction_date", "reference_name"],
    columns: [
      { key: "party", label: "reg.col.party", field: "party" },
      { key: "ref", label: "reg.col.reference", field: "reference_name" },
      { key: "date", label: "reg.col.date", field: "transaction_date", date: true },
      { key: "amount", label: "reg.col.amount", field: "grand_total", money: true },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    facts: [
      { key: "party", label: "reg.col.party", field: "party" },
      { key: "type", label: "reg.col.type", field: "payment_request_type" },
      { key: "ref", label: "reg.col.reference", field: "reference_name" },
      { key: "date", label: "reg.col.date", field: "transaction_date", date: true },
      { key: "amount", label: "reg.col.amount", field: "grand_total", money: true },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    fields: [
      { key: "party", label: "reg.col.party", kind: "text", readOnly: true },
      { key: "grand_total", label: "reg.col.amount", kind: "number", readOnly: true },
      { key: "transaction_date", label: "reg.col.date", kind: "date" },
      { key: "email_to", label: "reg.col.email", kind: "text" },
    ],
    submittable: true,
    standalone: false,
    empty: "reg.paymentRequest.empty",
  },
  subcontractingOrder: {
    doctype: "Subcontracting Order",
    titleKey: "reg.subOrder.title",
    path: "/subcontracting-orders",
    searchField: "supplier",
    listFields: ["name", "supplier", "status", "transaction_date", "company"],
    columns: [
      { key: "supplier", label: "reg.col.jobWorker", field: "supplier" },
      { key: "date", label: "reg.col.date", field: "transaction_date", date: true },
      { key: "company", label: "reg.col.company", field: "company" },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    facts: [
      { key: "supplier", label: "reg.col.jobWorker", field: "supplier" },
      { key: "po", label: "reg.col.purchaseOrder", field: "purchase_order" },
      { key: "date", label: "reg.col.date", field: "transaction_date", date: true },
      { key: "warehouse", label: "reg.col.jobWorkerWarehouse", field: "supplier_warehouse" },
      { key: "company", label: "reg.col.company", field: "company" },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    fields: [
      { key: "supplier", label: "reg.col.jobWorker", kind: "link", link: "Supplier", readOnly: true },
      { key: "purchase_order", label: "reg.col.purchaseOrder", kind: "text", readOnly: true },
      { key: "supplier_warehouse", label: "reg.col.jobWorkerWarehouse", kind: "link", link: "Warehouse", required: true },
      { key: "transaction_date", label: "reg.col.date", kind: "date", required: true },
      { key: "company", label: "reg.col.company", kind: "link", link: "Company", required: true },
    ],
    linesKey: "items",
    submittable: true,
    standalone: false,
    empty: "reg.subOrder.empty",
  },
  subcontractingInward: {
    doctype: "Subcontracting Inward Order",
    titleKey: "reg.subInward.title",
    path: "/subcontracting-inward-orders",
    searchField: "customer",
    listFields: ["name", "customer", "status", "transaction_date", "company"],
    columns: [
      { key: "customer", label: "reg.col.customer", field: "customer" },
      { key: "date", label: "reg.col.date", field: "transaction_date", date: true },
      { key: "company", label: "reg.col.company", field: "company" },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    facts: [
      { key: "customer", label: "reg.col.customer", field: "customer" },
      { key: "so", label: "reg.col.salesOrder", field: "sales_order" },
      { key: "date", label: "reg.col.date", field: "transaction_date", date: true },
      { key: "company", label: "reg.col.company", field: "company" },
      { key: "status", label: "reg.col.status", field: "status" },
    ],
    fields: [
      { key: "customer", label: "reg.col.customer", kind: "link", link: "Customer", readOnly: true },
      { key: "sales_order", label: "reg.col.salesOrder", kind: "text", readOnly: true },
      { key: "transaction_date", label: "reg.col.date", kind: "date", required: true },
      { key: "company", label: "reg.col.company", kind: "link", link: "Company", required: true },
    ],
    linesKey: "items",
    submittable: true,
    standalone: false,
    empty: "reg.subInward.empty",
  },
};
