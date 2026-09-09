import { QueryClient } from "@tanstack/react-query";

// Shared cache utilities must not import the route tree during page initialization.
export const queryClient = new QueryClient();
