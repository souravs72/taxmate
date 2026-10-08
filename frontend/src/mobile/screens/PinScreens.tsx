import { useCallback, useEffect, useRef, useState } from "react";

import { t } from "../../i18n/strings";
import { authenticate, type BioKind } from "../biometric";
import { checkPin, isWeakPin, MAX_PIN_ATTEMPTS, PIN_LENGTH, pinAttemptsLeft, setPin } from "../pin";
import { Alert, BioIcon, bioName, Frame, PinPad, tf } from "../ui";


export function CreatePinScreen({ onDone }: { onDone: () => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (value.length !== PIN_LENGTH || busy) return;
    if (first === null) {
      if (isWeakPin(value)) {
        setError(t("mob.pin.weak"));
        setValue("");
        return;
      }
      setFirst(value);
      setValue("");
      setError(null);
      return;
    }
    if (value !== first) {
      setError(t("mob.pin.mismatch"));
      setFirst(null);
      setValue("");
      return;
    }
    setBusy(true);
    void setPin(value).then(onDone, () => {
      setBusy(false);
      setFirst(null);
      setValue("");
      setError(t("mob.err.generic"));
    });
  }, [value, first, busy, onDone]);

  const confirming = first !== null;
  return (
    <Frame
      title={confirming ? t("mob.pin.confirmTitle") : t("mob.pin.createTitle")}
      sub={confirming ? t("mob.pin.confirmSub") : t("mob.pin.createSub")}
      onBack={confirming ? () => { setFirst(null); setValue(""); setError(null); } : undefined}
      lang={false}
    >
      <PinPad
        label={confirming ? t("mob.pin.confirmTitle") : t("mob.pin.createTitle")}
        value={value}
        onChange={(v) => { setValue(v); if (v) setError(null); }}
        disabled={busy}
      />
      <div className="mob-pin-msg">
        {error && <Alert>{error}</Alert>}
        {busy && <p className="mob-hint" role="status">{t("mob.pin.saving")}</p>}
      </div>
    </Frame>
  );
}


export function BioOfferScreen({
  kind, onEnable, onSkip,
}: {
  kind: BioKind;
  onEnable: () => Promise<void> | void;
  onSkip: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = bioName(kind);

  async function enable() {
    setBusy(true);
    setError(null);
    const ok = await authenticate({ reason: t("mob.bio.reason"), cancel: t("mob.bio.skip"), title: t("mob.bio.reason") });
    if (ok) {
      await onEnable();
      return;
    }
    setBusy(false);
    setError(tf("mob.bio.failed", { bio: name }));
  }

  return (
    <Frame title={tf("mob.bio.offerTitle", { bio: name })} sub={tf("mob.bio.offerSub", { bio: name })} lang={false}>
      <div className="mob-bio-hero" aria-hidden="true"><BioIcon kind={kind} /></div>
      {error && <Alert>{error}</Alert>}
      <div className="mob-form">
        <button type="button" className="btn mob-wide" onClick={() => void enable()} disabled={busy}>
          {tf("mob.bio.enable", { bio: name })}
        </button>
        <button type="button" className="btn ghost mob-wide" onClick={onSkip} disabled={busy}>
          {t("mob.bio.skip")}
        </button>
      </div>
    </Frame>
  );
}


export function LockScreen({
  name, bio, onUnlock, onSignOut,
}: {
  name: string | null;
  /** Enabled + available biometric, or "none". */
  bio: BioKind;
  onUnlock: () => void;
  onSignOut: (why: "lockout" | "forgot") => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(MAX_PIN_ATTEMPTS);
  const [forgot, setForgot] = useState(false);
  const prompted = useRef(false);

  useEffect(() => {
    void pinAttemptsLeft().then((n) => {
      setLeft(n);
      if (n <= 0) onSignOut("lockout");
    });
  }, [onSignOut]);

  const tryBio = useCallback(async () => {
    if (bio === "none") return;
    setBusy(true);
    const ok = await authenticate({ reason: t("mob.bio.reason"), cancel: t("mob.bio.cancel"), title: t("mob.bio.reason") });
    setBusy(false);
    if (ok) onUnlock();
  }, [bio, onUnlock]);

  // Offer biometrics once, straight away.
  useEffect(() => {
    if (prompted.current || bio === "none") return;
    prompted.current = true;
    void tryBio();
  }, [bio, tryBio]);

  useEffect(() => {
    if (value.length !== PIN_LENGTH || busy) return;
    setBusy(true);
    void checkPin(value)
      .then((r) => {
        if (r.ok) {
          onUnlock();
          return;
        }
        setBusy(false);
        setValue("");
        setLeft(r.remaining);
        if (r.remaining <= 0) {
          onSignOut("lockout");
          return;
        }
        setError(r.remaining === 1 ? t("mob.lock.wrongOne") : tf("mob.lock.wrong", { n: r.remaining }));
      })
      .catch(() => {
        setBusy(false);
        setValue("");
        setError(t("mob.lock.wrongOne"));
      });
  }, [value, busy, onUnlock, onSignOut]);

  if (forgot) {
    return (
      <Frame title={t("mob.lock.forgotTitle")} sub={t("mob.lock.forgotSub")} onBack={() => setForgot(false)} lang={false}>
        <div className="mob-form">
          <button type="button" className="btn mob-wide mob-danger" onClick={() => onSignOut("forgot")}>
            {t("mob.lock.signOut")}
          </button>
          <button type="button" className="btn ghost mob-wide" onClick={() => setForgot(false)}>
            {t("mob.lock.cancel")}
          </button>
        </div>
      </Frame>
    );
  }

  const bioKey = bio !== "none" ? (
    <button
      type="button"
      className="mob-key mob-key-ic"
      onClick={() => void tryBio()}
      disabled={busy}
      aria-label={tf("mob.bio.enable", { bio: bioName(bio) })}
    >
      <BioIcon kind={bio} />
    </button>
  ) : null;

  return (
    <Frame
      title={name ? tf("mob.lock.hello", { name: "⁨" + name + "⁩" }) : t("mob.lock.title")}
      sub={t("mob.lock.sub")}
      lang={false}
      foot={
        <button type="button" className="mob-link" onClick={() => setForgot(true)} disabled={busy}>
          {t("mob.lock.forgot")}
        </button>
      }
    >
      <PinPad
        label={t("mob.lock.sub")}
        value={value}
        onChange={(v) => { setValue(v); if (v) setError(null); }}
        disabled={busy || left <= 0}
        extraKey={bioKey}
      />
      <div className="mob-pin-msg">
        {error && <Alert>{error}</Alert>}
        {busy && value.length === PIN_LENGTH && <p className="mob-hint" role="status">{t("mob.lock.checking")}</p>}
      </div>
    </Frame>
  );
}
