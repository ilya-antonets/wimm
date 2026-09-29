import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, type RenderHookOptions, type RenderHookResult } from "@testing-library/react";
import { type ReactNode } from "react";

/** Create a QueryClient with retries disabled for deterministic tests. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Render a hook wrapped in a fresh QueryClientProvider. Used by the data-fetching
 * hook tests introduced in Stages 9–11.
 */
export function renderHookWithQuery<Result, Props>(
  hook: (initialProps: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, "wrapper">
): RenderHookResult<Result, Props> {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(hook, { wrapper, ...options });
}
