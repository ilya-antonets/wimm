import axios, { AxiosError } from "axios";

/**
 * Shared Axios instance. All service modules import this client and call paths
 * WITHOUT the `/api` prefix (e.g. `/banks`) — the prefix lives in `baseURL`.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api",
  headers: { "Content-Type": "application/json" },
});

interface ApiErrorBody {
  detail?: unknown;
}

/**
 * Normalize the backend error shape into a plain `Error` so hooks/components can
 * rely on `error.message`. The backend returns `{ "detail": string }` for
 * handled errors; FastAPI validation errors return `{ "detail": [...] }`.
 */
apiClient.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    let message = "Unknown error";
    if (axios.isAxiosError(err)) {
      const axiosErr = err as AxiosError<ApiErrorBody>;
      const detail = axiosErr.response?.data?.detail;
      if (typeof detail === "string") {
        message = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        message = "Validation error";
      } else {
        message = axiosErr.message;
      }
    } else if (err instanceof Error) {
      message = err.message;
    }
    return Promise.reject(new Error(message));
  }
);
