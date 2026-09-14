import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { deserializeToPrisma } from "../utils/serde";
import { Activity, User } from "../types";
import { AuthContext } from "./auth";
import { getSessionUser } from "../utils/fetch";
import { startUsersWebSocket } from "./users-websocket-connection";

// Split contexts to avoid unnecessary re-renders
export const UsersWebSocketUsersContext = createContext<{
  users: User[];
  error: Error | null;
} | null>(null);

export const UsersWebSocketActivityContext = createContext<{
  updateActivity: (activity: Activity) => void;
} | null>(null);

export function UsersWebSocketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useContext(AuthContext)!;
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const debounceRef = useRef<number | null>(null);
  const usersRef = useRef<User[]>(users);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    if (!user) {
      return;
    }
    setError(null);
    const stop = startUsersWebSocket({
      initialToken: user.webSocketToken,
      refreshToken: async () => {
        const sessionUser = await getSessionUser();
        if (!sessionUser || sessionUser.email !== user.email) throw new Error("The workspace account has changed.");
        return sessionUser.webSocketToken;
      },
      createSocket: (token) => new WebSocket(`/ws/users?token=${encodeURIComponent(token)}`),
      onSocket: (socket) => { wsRef.current = socket; },
      onMessage: (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "users-update" && Array.isArray(msg.data)) {
          const prismaData = deserializeToPrisma<User[]>(msg.data);
          const userData = prismaData.map((p) => ({
            ...p,
            activity: {
              ...p.activity,
              page: new URL(p.activity?.page || "", window.location.origin),
            },
          }));
          setUsers((prev) =>
            shallowEqualUsers(prev, userData) ? prev : userData
          );
        }
      },
      onOpen: () => {
        setError(null);
      },
      onError: setError,
    });

    return () => {
      stop();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [user]);

  const updateActivity = useCallback((activity: Activity) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const jsonActivity = {
        ...activity,
        page: activity.page.pathname,
      };
      const msg = {
        type: "activity-update",
        data: jsonActivity,
      };
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current?.send(JSON.stringify(msg));
      }
    }, 1_000);
  }, []);

  const usersValue = useMemo(() => ({ users, error }), [users, error]);
  const activityValue = useMemo(() => ({ updateActivity }), [updateActivity]);

  return (
    <UsersWebSocketActivityContext.Provider value={activityValue}>
      <UsersWebSocketUsersContext.Provider value={usersValue}>
        {children}
      </UsersWebSocketUsersContext.Provider>
    </UsersWebSocketActivityContext.Provider>
  );
}

function shallowEqualUsers(a: User[], b: User[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ua = a[i];
    const ub = b[i];
    if (
      ua.email !== ub.email ||
      ua.name !== ub.name ||
      ua.picture !== ub.picture ||
      ua.activity.lastActive !== ub.activity.lastActive ||
      ua.activity.page.pathname !== ub.activity.page.pathname
    ) {
      return false;
    }
  }
  return true;
}
