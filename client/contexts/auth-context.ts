import { createContext } from "react";
import type { SessionUser } from "../types";

export const AuthContext = createContext<{
  user: SessionUser | null;
  isLoading: boolean;
  isDevelopmentAuth: boolean;
  isPublicAccess: boolean;
  login: () => Promise<void>;
  logout: () => void;
  checkLoginUser: () => Promise<void>;
} | null>(null);
