/**
 * Bulk action strip for list multi-select delete.
 * Pair with useDraftDelete + DataTable selection.
 */
import type { ReactNode } from "react";
import { t } from "../i18n/strings";
import { ErrorBox } from "./ui";
import type { DraftDeleteApi } from "../lib/useDraftDelete";

type Props = {
  drafts: DraftDeleteApi;
  extra?: ReactNode;
  extraSelected?: number;
  onClear?: () => void;
};

export default function BulkDraftBar({ drafts, extra, extraSelected = 0, onClear }: Props) {
  const count = drafts.picked.size + extraSelected;
  if (!drafts.showBar && !extraSelected) return null;

  return (
    <>
      <div className="bulkbar">
        <span className="msg">{count} {t("inv.bulk.selected")}</span>
        <div className="grp">
          {drafts.showBar && (
            <button
              type="button"
              className="btn sm"
              disabled={drafts.loading}
              onClick={() => void drafts.deletePicked()}
            >
              {drafts.loading ? t("soc.saving") : drafts.deleteLabel}
            </button>
          )}
          {extra}
          <button type="button" className="btn ghost sm" onClick={onClear ?? drafts.clear}>
            {t("inv.bulk.clear")}
          </button>
        </div>
      </div>
      {(drafts.error || drafts.failNote) && (
        <ErrorBox error={drafts.error ?? drafts.failNote} />
      )}
    </>
  );
}
