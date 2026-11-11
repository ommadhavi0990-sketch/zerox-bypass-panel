import { createContext, useContext } from "react";
import type { AppRole, Profile } from "@/lib/zx";

export type MeCtx = { userId: string; profile: Profile; role: AppRole | null; isOwner: boolean; isAdmin: boolean };
export const MeContext = createContext<MeCtx | null>(null);

export function useMe(): MeCtx {
  const v = useContext(MeContext);
  if (!v) throw new Error("useMe must be used inside the panel layout");
  return v;
}
