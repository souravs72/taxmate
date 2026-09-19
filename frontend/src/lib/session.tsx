import { createContext, useContext } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "./frappe";

export type Session = {
  user: string;
  full_name?: string;
  company?: string | null;
  currency?: string | null;
  country?: string | null;
  roles?: string[];
};

const SessionContext = createContext<Session>({ user: "", roles: [] });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { data } = useFrappeGetCall<{ message: Session }>(METHOD.getSession);
  const session = data?.message ?? { user: "", roles: [] };
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  return useContext(SessionContext);
}
