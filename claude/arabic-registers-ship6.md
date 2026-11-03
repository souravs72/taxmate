# Ship 6 — finish the Arabic on the registers module

**115 anchored edits across 6 files. 64 new keys, English + Arabic. No new files, no backend change, no `bench migrate`.**
Built against `taxmate-version-16_4`.

```
~ frontend/src/lib/nav.ts                        8 sidebar keys
~ frontend/src/screens/registers/config.ts       8 titles, 8 empty states, 109 label lines
~ frontend/src/screens/registers/RegisterList.tsx    5
~ frontend/src/screens/registers/RegisterDetail.tsx  9
~ frontend/src/screens/registers/RegisterForm.tsx   27
~ frontend/src/i18n/strings.ts                   64 keys in each language
```

## Why Arabic stopped in those places

`AppShell.tsx:45` renders every sidebar label with `const label = t(n.key)`. Most entries carry a dotted key like `nav.invoices`. The eight routes added with the registers module carried **the English sentence as the key**:

```ts
{ type: "link", to: "/shipments", key: "Shipments" }
```

There is no `"Shipments"` entry in the dictionary. `t()` returns the key on a miss, so you get the English — which looks correct in English and stays English in Arabic.

`registers/config.ts` had the same shape, and worse: `titleKey` at least reached `t()`, but **the column, fact and field labels and the empty states never reached `t()` at all.** `RegisterList` rendered `header: col.label`, `RegisterDetail` rendered `k={fact.label}`, `RegisterForm` rendered `label={field.label}` — straight to the screen, no translation layer in between.

On top of that, the three screens carried 19 hardcoded literals of their own: `"Supplier"`, `"Weight (kg)"`, `"Parcels"`, `"Search"`, `"New"`, and an error built as `` `${missing.label} is required` ``.

Four problems, one module:

| | count |
|---|---|
| `titleKey` reaching `t()` with a raw English value | 8 |
| labels and empty states never reaching `t()` | 36 distinct (109 lines) |
| hardcoded literals in the three screens | 19 |
| nav keys with no dictionary entry | 8 (same strings as the titles) |

## Why nobody caught it, and the scanner fix

Two reasons, and both are now closed.

**In English the fallback is the right English.** A missing key renders as the key, and when the key *is* the English sentence the miss is invisible. It only shows in Arabic.

**My Ship 5 scanner only matched `t("literal")`.** Every one of these goes through `t(variable)`. The scanner reported zero missing keys on this tree and was right about what it looked at — it just wasn't looking at the indirection. `dynkeys.mjs` in this package resolves the indirection: it finds every `t()` call whose argument is not a literal, works out which property names reach `t()` that way, and then checks every string sitting on those properties against both dictionaries. Run it on any future build and this class of bug surfaces immediately.

## Keys

A self-contained `reg.*` family — `reg.<document>.title`, `reg.<document>.empty`, `reg.col.*`, `reg.ui.*`, plus `reg.err.required`.

I deliberately reused nothing. Every candidate already exists several times over — `"Company"` has 24 keys in the dictionary, `"Status"` has 20, `"Amount"` 13 — and picking one would tie this module to an unrelated screen, so a later wording change in, say, the bank reconciliation column would silently move the Shipments table too.

The one reuse inside the ship is `reg.col.customer`, shared between the Delivery Trip stop label and the column of the same name. Same module, same word, same meaning.

**Dotted keys rather than English ones was the deciding call.** Keying by the English sentence would also have worked and needed no code change — but it fails silently, which is exactly how this survived. With `reg.col.status`, a missing translation renders `reg.col.status` on screen: loud, and caught in seconds.

## Apply

```bash
cd ~/Downloads && unzip taxmate-ship6-arabic-registers.zip
node taxmate-ship6-arabic-registers/apply.mjs ~/frappe-bench/apps/taxmate --check
node taxmate-ship6-arabic-registers/apply.mjs ~/frappe-bench/apps/taxmate

cd ~/frappe-bench/apps/taxmate/frontend && npm run build
cd ~/frappe-bench && bench --site <your-site> clear-cache && bench restart
```

`--undo` restores all six files. No `bench migrate`.

## What I verified

`tsc --noEmit` and `vite build` clean.

**Dictionaries** — every English key has an Arabic twin and back; all 2,913 existing keys kept with unchanged values; 64 new keys, all under `reg.*`; each appears exactly twice, so nothing is silently redefined; `{field}` survives translation.

**Key coverage, including the indirection** — all 4,047 literal `t()` keys resolve in both languages, all 90 nav keys resolve, all 44 registers config keys resolve, and the three screens now route `col.label`, `fact.label`, `field.label` and `spec.empty` through `t()`.

**Exhaustive resolution** — for all eight register specs, every one of the 66 distinct labels is resolved through a copy of `makeT` and asserted to come back as real Arabic script, not the key and not the English fallback. Same for the eight nav entries:

> إشعارات التركيب · طلبات الدفع · الفرص · أوامر التعاقد الواردة · طلبات عروض الأسعار · أوامر التعاقد من الباطن · الشحنات · رحلات التسليم

**Nothing non-text moved** — route paths, doctype names, field and column identifiers and the `listFields` arrays are byte-identical between your tree and the patched one: 98 routes, 41 doctype names, 806 identifiers, 8 arrays. The only things that changed are the strings a person reads.

**The bundle** — the new Arabic is in the built JS.

**Package mechanics** — `--check` leaves the tree byte-identical; apply, re-apply and a third run are no-ops; `--undo` restores byte-identical files; an unrelated developer edit in a touched file survives; a comment appended inside an anchor aborts **all 115 edits with zero writes and no backup folder**.

### What I could not verify, and why

I did not get a browser pass. My local Frappe stub couldn't satisfy the SDK's auth hook, so the SPA redirected to `/login` before rendering, and chasing that further was not worth the time against a check that is weaker anyway — the browser only shows the labels visible on one screen, while the resolution check above covers all 66 across all eight documents in both languages.

**So the visual confirmation is yours to make, and it takes about a minute:** switch to Arabic and open the eight new sidebar entries. If any label shows as a dotted key like `reg.col.vehicle`, send me the screenshot — that would mean a key reaches the screen that my resolution check didn't model.

### A generator bug this caught

My first build produced overlapping anchors. `label: "Status",` appears in several register specs, so a one-line anchor isn't unique; the generator widens the window until it is — and on line 47 the widened window swallowed line 48, whose own edit would then have been silently lost, because the applier rewrites a file in a single pass.

Fixed by planning each file as a whole: overlapping windows are merged into one edit carrying both changes, the merged window is re-checked for uniqueness, and a guard refuses to build if any two anchors in a file still overlap. That guard is what found it.

## What Vinay should check

1. After the build, switch to Arabic and open **Opportunities, Requests for Quotation, Subcontracting Orders, Subcontracting Inward Orders, Shipments, Delivery Trips, Installation Notes, Payment Requests** — sidebar labels, page titles, table headers and empty states should all be Arabic.
2. Open one of them and click **New** — the field labels and the Save validation message should be Arabic too.
3. Switch back to English and confirm nothing reads differently from before. The English value of every new key is the exact literal it replaced, so English output should be unchanged.

## Still open from the print work

Unchanged by this ship, in the order we agreed: the print preview screen with the format and language picker, then the shared print defects (`dir="ltr"` isolation, the duplicated letterhead, `in_words` computed at print time), then the six missing formats. The sales-order warehouse default is independent and small.
