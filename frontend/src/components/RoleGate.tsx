/**
 * Hide write buttons for Viewer.
 * Session spa_role is owner, accountant, clerk, or viewer.
 */
import { canWrite } from "../lib/roles";
import { useSession } from "../lib/session";

export function IfCanWrite({ children }: { children: React.ReactNode }) {
  const session = useSession();
  if (!canWrite(session)) return null;
  return <>{children}</>;
}
