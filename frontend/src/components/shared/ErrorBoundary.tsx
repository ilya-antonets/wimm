import { Alert, Button, Stack, Text, Title } from "@mantine/core";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { logger } from "../../utils/logger";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error("Uncaught render error:", error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, message: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Alert role="alert" className="error-boundary" color="red" m="md">
          <Stack gap="sm" align="flex-start">
            <Title order={1} size="h3">
              Something went wrong.
            </Title>
            {this.state.message && <Text>{this.state.message}</Text>}
            <Button variant="light" onClick={this.handleReset}>
              Try again
            </Button>
          </Stack>
        </Alert>
      );
    }
    return this.props.children;
  }
}
