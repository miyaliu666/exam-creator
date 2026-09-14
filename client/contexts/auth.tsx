import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Center, Heading, Stack, Text } from "@chakra-ui/react";
import { SessionUser } from "../types";
import {
  getDevLoginStatus,
  getSessionUser,
  loginWithDevIdentity,
  loginWithGitHub,
  logout as deleteLogout,
} from "../utils/fetch";
import { loadAuthSession } from "../utils/auth-session";
import { getAccessMode, isPublicAccessEnabled, openPublicSession } from "../utils/public-access";
import { AuthContext } from "./auth-context";
export { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDevelopmentAuth, setIsDevelopmentAuth] = useState(false);
  const [isPublicAccess, setIsPublicAccess] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const pendingCheck = useRef<Promise<void> | null>(null);
  const pendingRefresh = useRef<Promise<void> | null>(null);

  const checkLoginUser = useCallback((): Promise<void> => {
    if (pendingCheck.current) return pendingCheck.current;
    setIsLoading(true);
    pendingCheck.current = (async () => {
      try {
        const session = await loadAuthSession({ getAccessMode, openPublicSession, getDevLoginStatus, getSessionUser, loginWithDevIdentity });
        setIsDevelopmentAuth(session.isDevelopmentAuth);
        setIsPublicAccess(session.isPublicAccess);
        setUser(session.user);
        setConnectionFailed(false);
      } catch (e) {
        console.debug(e);
        setUser(null);
        setConnectionFailed(true);
      } finally {
        setIsLoading(false);
        pendingCheck.current = null;
      }
    })();
    return pendingCheck.current;
  }, []);

  useEffect(() => {
    const handlePublicSessionRestored = () => {
      if (!isPublicAccessEnabled() || pendingRefresh.current) return;
      // The new cookie has a fresh WebSocket token. Keep the current editor
      // mounted while refreshing that token after an expired session.
      pendingRefresh.current = getSessionUser({ allowUnauthenticated: true })
        .then((sessionUser) => { if (sessionUser) setUser(sessionUser); })
        .catch((error: unknown) => console.debug(error))
        .finally(() => { pendingRefresh.current = null; });
    };
    const handleSessionExpired = () => {
      if (isPublicAccessEnabled()) {
        void checkLoginUser();
        return;
      }
      setUser(null);
      setIsLoading(false);
    };

    window.addEventListener("exam-creator:session-expired", handleSessionExpired);
    window.addEventListener("exam-creator:public-session-restored", handlePublicSessionRestored);
    void checkLoginUser();
    return () => {
      window.removeEventListener(
        "exam-creator:session-expired",
        handleSessionExpired,
      );
      window.removeEventListener("exam-creator:public-session-restored", handlePublicSessionRestored);
    };
  }, [checkLoginUser]);

  const login = async () => {
    if (isPublicAccessEnabled()) return checkLoginUser();
    await loginWithGitHub();
  };

  const logout = async () => {
    if (isPublicAccessEnabled()) return;
    setIsLoading(true);
    try {
      await deleteLogout();
    } catch (e) {
      console.error(e);
    } finally {
      setUser(null);
      setIsLoading(false);
    }
  };

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isDevelopmentAuth,
      isPublicAccess,
      login,
      logout,
      checkLoginUser,
    }),
    [user, isLoading, isDevelopmentAuth, isPublicAccess, checkLoginUser]
  );

  return (
    <AuthContext.Provider value={value}>
      {connectionFailed ? (
        <Center minH="100vh" px={4}>
          <Stack maxW="md" align="center" gap={4} textAlign="center" role="alert">
            <Heading size="xl">Unable to connect</Heading>
            <Text>Make sure the server is running, then try again.</Text>
            <Button colorPalette="teal" loading={isLoading} onClick={() => void checkLoginUser()}>
              Retry
            </Button>
          </Stack>
        </Center>
      ) : children}
    </AuthContext.Provider>
  );
}
