# TaxMate Invoice OCR — client pitch

**For:** UAE finance leads, accountants, and operations managers
**Product:** TaxMate Gulf
**Module:** Invoice OCR (live in the TaxMate workspace)
**One sentence:** TaxMate turns a supplier PDF or photo into a **draft Purchase Invoice** you review before it hits the books.

Use this as a leave-behind, a short deck script, or the body of a follow-up email. It describes what is **on the product today**, not a future roadmap.

---

## 1. Opening (30 seconds)

Most UAE companies still receive a mix of:

- **Structured e-invoices** (Peppol / PINT-AE) — TaxMate already handles these.
- **Paper, WhatsApp photos, and PDF bills** from suppliers who are not on e-invoicing yet.

The second pile is where time and VAT errors live: retyping TRNs, dates, line items, and 5% VAT into Purchase Invoices.

Invoice OCR closes that gap **inside TaxMate**. The accountant does not leave Desk, does not rekey the bill, and does not post anything until they confirm the card.

---

## 2. The problem you are selling against

| Today | Cost |
| --- | --- |
| Accounts staff type supplier bills by hand | Slow close; overtime in VAT week |
| Arabic and English mixed on the same scan | Missed fields, wrong supplier |
| VAT 5% / zero / exempt entered from memory | Wrong input tax on VAT 201 |
| Photos sitting in WhatsApp / email | No audit trail of what was booked |
| E-invoicing does not cover every vendor yet | Dual process, two systems |

**Positioning:** TaxMate already owns UAE VAT, e-invoicing, and the ledger. OCR is the missing front door for **unstructured inbound bills**.

---

## 3. What the client gets

### In the product

- **Invoice OCR** in the left TaxMate workspace (under Invoicing).
- A chat-style capture screen: attach PDF / photo → extract → confirm.
- A **Home** shortcut so daily AP work starts from the same landing page.
- Draft **Purchase Invoice** in TaxMate, then the usual UAE checks (TRN, VAT template, Emirate).

### In the workflow

1. Open **Invoice OCR**.
2. Start a conversation. Target document: **Purchase Invoice**. Company: theirs.
3. Drop a PDF, PNG, or JPG (also Excel / Word if the bill comes that way).
4. Ask: *“Extract this bill into a Purchase Invoice.”*
5. Review the confirmation card (supplier, dates, lines, tax, totals).
6. **Save as Draft** — recommended for go-live.
7. Open the draft in TaxMate and submit when VAT looks right.

Nothing posts to the ledger from a guess. The model proposes; the accountant confirms.

---

## 4. Why this fits a UAE TaxMate client

| UAE need | How Invoice OCR answers it |
| --- | --- |
| Arabic + English bills | OCR language **auto** (can pin Arabic or English per file) |
| Mixed scans and digital PDFs | Text-layer PDFs are read as text; scans/photos go through OCR |
| 5% VAT / zero / exempt | Draft lands in TaxMate so Item Tax Templates and VAT 201 still govern the books |
| 15-digit TRN | Match an **existing** Supplier; TaxMate validates TRN on the invoice |
| FTA-style audit trail | Conversation, messages, and document log stay on the site |
| E-invoicing already live | OCR is **not** used for outbound e-invoices or Corner-4 XML — those stay structured |

**Say this out loud:** “We do not OCR what is already a proper e-invoice. We OCR the paper and PDF that never were.”

---

## 5. Demo script (5–7 minutes)

Use a **real supplier PDF** the client recognises (English or bilingual). Prefer a bill whose Supplier and Item already exist in TaxMate.

| Minute | Do | Say |
| --- | --- | --- |
| 0:00 | TaxMate Home | “Daily work is already here. Invoice OCR sits next to Purchase Invoice.” |
| 0:30 | Open **Invoice OCR** | “This is capture, not a separate product.” |
| 1:00 | New conversation → Purchase Invoice | “We always name the target document up front.” |
| 1:30 | Attach the PDF | “File is stored privately on this site, not as a public link.” |
| 2:00 | Send the extract prompt | “OCR plus an AI pass. You will see a card, not a silent post.” |
| 3:30 | Walk the card | Point at supplier, bill no, date, lines, tax, grand total. Edit one field live. |
| 5:00 | **Save as Draft** | Open the Purchase Invoice in Desk. “TaxMate VAT rules still apply here.” |
| 6:00 | Stop | Do **not** Submit from chat in a first demo unless you have checked tax accounts. |

If chat is not configured with an LLM key yet, say so and show the workspace, the upload, and a pre-extracted conversation / draft from your prep. Do not improvise a failed extraction on stage.

**Prep checklist (day before):**

- [ ] LLM provider and key set in IDP Settings
- [ ] Sample Supplier exists with a valid UAE TRN
- [ ] Sample Item exists with the right UAE tax template
- [ ] One clean PDF and one slightly messy photo
- [ ] Write-from-chat practised on **Save as Draft** only

---

## 6. What to promise — and what not to

### Promise

- Paper / PDF / photo supplier bills become **reviewable drafts** in TaxMate.
- Arabic and English scans are in scope.
- The accountant stays in control: confirm, edit, or cancel.
- Batch upload exists for month-end piles (review each result; do not bulk-submit on day one).
- Repeating vendors can get a per-supplier extraction template over time (accuracy improves).

### Do not promise

- “100% accurate VAT coding with no review.” Tax rows often need a human click on UAE templates.
- “It replaces FTA e-invoicing / Peppol / PINT-AE.” It does not.
- “It files VAT 201 or EmaraTax for you.” Boxes still come from the ledger.
- “It invents new suppliers and items safely.” Keep master-data auto-create **off** until the client’s item tax templates are trusted.
- “Your invoice images never leave the UAE” **unless** they choose on-site / regional models (Ollama). Cloud OpenAI / Anthropic see extracted text (and sometimes page images). Offer that choice explicitly.

---

## 7. How it sits next to the rest of TaxMate

```
Supplier bill
    │
    ├─ Already a Corner-4 / Peppol e-invoice  →  UAE Incoming Invoice (no OCR)
    │
    └─ PDF, scan, photo, Excel                →  Invoice OCR  →  Draft Purchase Invoice
                                                      │
                                                      └─ TaxMate VAT, TRN, Emirate, VAT 201
```

Same books. Two intake paths. One close.

---

## 8. Commercial conversation

Frame OCR as **AP capture on the TaxMate subscription**, not a separate science project.

Suggested talking points (adjust to your commercial model):

| Topic | Line |
| --- | --- |
| Who uses it | AP clerk + accountant. Role-gated (not Guest / not the whole company by default). |
| Volume | Start with 10–20 real bills in a pilot week. Measure minutes saved and correction rate. |
| Success metric | “Draft PI in under 2 minutes, tax row corrected in Desk, zero silent submits.” |
| Data residency | Default: files stay on the TaxMate site. AI processing: cloud LLM **or** UAE/regional Ollama — client chooses. |
| Pilot | 2 weeks, one company, Purchase Invoices only, Save as Draft only. |
| Then | Turn on Submit-from-chat only after tax-account mapping is trusted. |

**Ask for:** 15 sample bills (mix of Arabic, English, thermal, PDF) and the supplier list they want matched.

---

## 9. Client FAQ

**Does this work in Arabic?**
Yes. Language can auto-detect, or you pin Arabic for Arabic-only scans.

**Will it post to the accounts without us looking?**
No. A confirmation card is required. We recommend Save as Draft for go-live.

**What file types?**
PDF, PNG, JPG, WebP, TIFF, Excel, CSV, Word. About 25 MB per file, up to 100 PDF pages.

**Can we do a pile at month end?**
Yes — batch jobs. Still review; do not bulk-submit until single-file quality is proven.

**What about sales invoices we issue?**
TaxMate already creates those (and the e-invoice). Do not OCR your own outbound invoices.

**What about VAT 201?**
Unchanged. Correct Purchase Invoices feed the return. OCR does not invent Box 1–14.

**Is this trained on our vendors?**
Out of the box it is generic. Repeating layouts get better with extraction templates and corrections — that is part of the pilot.

---

## 10. Close

> “E-invoicing covers suppliers who are already digital. Invoice OCR covers everyone else — without leaving TaxMate, and without posting until your accountant says so.”

**Ask:** “Can we run a two-week pilot on live supplier PDFs next week?”

---

## Appendix A — Email you can send after the meeting

Subject: TaxMate Invoice OCR — paper bills into draft Purchase Invoices

Body:

We walked through Invoice OCR in TaxMate. In short: drop a supplier PDF or photo, review the extracted card, save a **draft Purchase Invoice**. Arabic and English scans are supported. Structured e-invoices stay on the e-invoicing path; this is only for bills that are still paper or PDF.

Nothing hits the ledger until your team confirms. For a pilot we would use your real suppliers, keep auto-create of new items off, and Save as Draft only.

If you send 15 sample bills and the supplier list to match, we can run the first week on your company in TaxMate.

---

## Appendix B — Internal only (do not send)

- Product surface name in Desk: **Invoice OCR** (workspace). Chat URL: `/idp/chat`.
- Operator runbook: `docs/idp-workflow.md`.
- Chat will error until an LLM key (or Ollama) is configured.
- Mapper keywords are generic; UAE tax accounts on the card usually need a click.
- Prefer Save as Draft; TaxMate `before_submit` still runs if someone Submits from chat.
- Do not demo Submit on a messy scan.

*Last updated: 16 Sep 2026 — reflects the Invoice OCR module live on TaxMate Gulf.*
