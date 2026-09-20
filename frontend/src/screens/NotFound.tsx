import { useNavigate } from "react-router-dom";

import { t } from "../i18n/strings";
import { PageHead } from "../components/ui";

export default function NotFound() {
  const nav = useNavigate();
  return (
    <>
      <PageHead title={t("notfound.title")} sub={t("notfound.sub")} />
      <button className="btn" onClick={() => nav("/sales")}>{t("notfound.home")}</button>
    </>
  );
}
