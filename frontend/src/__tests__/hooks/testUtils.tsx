import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderHookResult,
  type RenderResult,
} from "@testing-library/react";
import { type ReactElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import { theme } from "../../theme";

/** Create a QueryClient with retries disabled for deterministic tests. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface RenderOptions {
  withRouter?: boolean;
  withQuery?: boolean;
  route?: string;
}

/**
 * Render a component wrapped in MantineProvider (always) plus optional
 * MemoryRouter and a fresh QueryClientProvider. Every component/page test wraps
 * through this so Mantine hooks have their required provider ancestor.
 */
export function renderWithProviders(
  ui: ReactElement,
  { withRouter = false, withQuery = false, route = "/" }: RenderOptions = {}
): RenderResult {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => {
    let tree: ReactNode = children;
    if (withRouter) {
      tree = <MemoryRouter initialEntries={[route]}>{tree}</MemoryRouter>;
    }
    if (withQuery) {
      tree = <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider>;
    }
    return (
      <MantineProvider theme={theme} defaultColorScheme="light">
        {tree}
      </MantineProvider>
    );
  };
  return render(ui, { wrapper });
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
