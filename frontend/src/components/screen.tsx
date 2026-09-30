// Importers: list and form screens under frontend/src/screens.
// API: none. Callers keep their own taxmate.api.resource calls.
// Schema: none.
// User: "Bill Of materials has a different UI than other screens - ensure there is a same shared helper for all the screens."
import type { ReactNode } from "react";

import { t } from "../i18n/strings";
import { FormLayout, ReadinessCard, type Check } from "./form";
import { PageHead } from "./ui";

/**
 * List chrome shared by every catalogue screen.
 *
 * `summary` is the only optional band: stat tiles, donuts, bars. Screens
 * without charts omit it. The header action and the list card stay in the
 * same place either way.
 */
export function ListScreen({
  title,
  primary,
  summary,
  children,
}: {
  title: ReactNode;
  primary?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <PageHead title={title} actions={primary} />
      {summary}
      {children}
    </>
  );
}

/**
 * Form chrome shared by document screens: back link and title, Discard / Save /
 * Submit in the header, sections in the main column, readiness in the aside.
 */
export function DocForm({
  title,
  eyebrow,
  actions,
  checks,
  readyTitle,
  readyCaption,
  aside,
  alert,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions: ReactNode;
  checks?: Check[];
  readyTitle?: string;
  readyCaption?: string;
  aside?: ReactNode;
  alert?: ReactNode;
  children: ReactNode;
}) {
  const ready = checks?.length ? (
    <ReadinessCard
      checks={checks}
      title={readyTitle ?? t("soc.ready")}
      caption={readyCaption}
    />
  ) : null;
  const side = aside || ready ? <>{aside}{ready}</> : undefined;
  return (
    <>
      <PageHead eyebrow={eyebrow} title={title} actions={actions} />
      {alert}
      <FormLayout aside={side}>{children}</FormLayout>
    </>
  );
}
