import { QueryClient } from "@tanstack/react-query";
import type { DefaultOptions } from "@tanstack/react-query";

const defaultOptions: DefaultOptions = {
  queries: {
    retry: (failureCount, error: unknown) => {
      const err = error as { status?: number };
      // Don't retry on user-error or auth errors
      if (err?.status === 401 || err?.status === 403 || err?.status === 404) {
        return false;
      }
      return failureCount < 3;
    },
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  },
};

export const queryClient = new QueryClient({ defaultOptions });
