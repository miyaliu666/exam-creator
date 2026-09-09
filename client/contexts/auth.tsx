import { createContext, useEffect, useMemo, useState } from "react";
import { Button, Center, Heading, Stack, Text } from "@chakra-ui/react";
import { SessionUser } from "../types";
import {
  getDevLoginStatus,
  getSessionUser,
  loginWithDevIdentity,
  loginWithGitHub,
  logout as deleteLogout,
} from "../utils/fetch";

const defaultDevIdentity = {
  name: "Local User",
  email: "author@exam-creator.local",
};

export const AuthContext = createContext<{
  user: SessionUser | null;
  isLoading: boolean;
  isDevelopmentAuth: boolean;
  login: () => Promise<void>;
  logout: () => void;
  checkLoginUser: () => Promise<void>;
} | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDevelopmentAuth, setIsDevelopmentAuth] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);

  async function checkLoginUser() {
    setIsLoading(true);
    try {
      const devLoginStatus = await getDevLoginStatus();
      setIsDevelopmentAuth(devLoginStatus.enabled);
      let sessionUser = await getSessionUser({ allowUnauthenticated: true });
      if (!sessionUser && devLoginStatus.enabled) {
        await loginWithDevIdentity(defaultDevIdentity);
        sessionUser = await getSessionUser();
      }
      setUser(sessionUser);
      setConnectionFailed(false);
    } catch (e) {
      console.debug(e);
      setUser(null);
      setConnectionFailed(true);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      setIsLoading(false);
    };

    window.addEventListener("exam-creator:session-expired", handleSessionExpired);
    void checkLoginUser();
    return () => {
      window.removeEventListener(
        "exam-creator:session-expired",
        handleSessionExpired,
      );
    };
  }, []);

  const login = async () => {
    await loginWithGitHub();
  };

  const logout = async () => {
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
      login,
      logout,
      checkLoginUser,
    }),
    [user, isLoading, isDevelopmentAuth]
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
