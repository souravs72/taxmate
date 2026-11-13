/** Shared TaxMate mark. Bundled PNG so the Capacitor APK ships the same icon. */
const mark = new URL("../assets/taxmate-mark.png", import.meta.url).href;

export default function TaxMateMark({
  size = 56,
  title,
}: {
  size?: number;
  title?: string;
}) {
  return (
    <img
      src={mark}
      width={size}
      height={size}
      alt={title || ""}
      aria-hidden={title ? undefined : true}
      draggable={false}
    />
  );
}
