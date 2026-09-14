import type { SessionUser } from "../types";

interface SessionApi {
  getAccessMode: () => Promise<{ publicAccess: boolean }>;
  openPublicSession: () => Promise<void>;
  getDevLoginStatus: () => Promise<{ enabled: boolean }>;
  getSessionUser: (options?: { allowUnauthenticated: true }) => Promise<SessionUser | null>;
  loginWithDevIdentity: (identity: { name: string; email: string }) => Promise<void>;
}

export async function loadAuthSession(api: SessionApi) {
  const { publicAccess } = await api.getAccessMode();
  if (publicAccess) {
    await api.openPublicSession();
    const user = await api.getSessionUser({ allowUnauthenticated: true });
    if (!user) throw new Error("The browser could not open the workspace session.");
    return { user, isPublicAccess: true, isDevelopmentAuth: false };
  }

  const { enabled } = await api.getDevLoginStatus();
  let user = await api.getSessionUser({ allowUnauthenticated: true });
  if (!user && enabled) {
    await api.loginWithDevIdentity({ name: "Local User", email: "author@exam-creator.local" });
    user = await api.getSessionUser();
  }
  return { user, isPublicAccess: false, isDevelopmentAuth: enabled };
}
