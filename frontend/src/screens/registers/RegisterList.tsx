/**
 * List for Desk register DocTypes — meta-driven columns via DocList.
 */
import DocList from "../../components/DocList";
import { t } from "../../i18n/strings";
import { REGISTERS } from "./config";

export default function RegisterList({ specKey }: { specKey: string }) {
  const spec = REGISTERS[specKey];
  return (
    <DocList
      doctype={spec.doctype}
      routeBase={spec.path}
      title={t(spec.titleKey)}
      emptyLabel={t(spec.empty)}
      deleteMode={spec.submittable ? "draft" : "all"}
      hideNew={!spec.standalone}
    />
  );
}
