import { createContext, useContext } from 'react';
import type { SessionFlow } from './sessionFlow';

const Ctx = createContext<SessionFlow | null>(null);

export const SessionFlowProvider = Ctx.Provider;

/** Logout and "another tab logged out" handling, created once at the app root. */
export function useSessionFlow(): SessionFlow {
  const flow = useContext(Ctx);
  if (!flow) throw new Error('useSessionFlow() needs <SessionFlowProvider>.');
  return flow;
}
