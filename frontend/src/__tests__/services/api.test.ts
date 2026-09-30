import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { apiClient } from "../../services/api";
import { server } from "../mocks/server";

const API = "http://localhost:8000/api";

describe("apiClient response interceptor", () => {
  it("normalizes a string `detail` into error.message", async () => {
    server.use(
      http.get(`${API}/probe`, () =>
        HttpResponse.json({ detail: "Bank not found" }, { status: 404 })
      )
    );

    await expect(apiClient.get("/probe")).rejects.toThrow("Bank not found");
  });

  it("maps a FastAPI validation-error array to a generic message", async () => {
    server.use(
      http.get(`${API}/probe`, () =>
        HttpResponse.json(
          { detail: [{ loc: ["body", "name"], msg: "field required" }] },
          { status: 422 }
        )
      )
    );

    await expect(apiClient.get("/probe")).rejects.toThrow("Validation error");
  });

  it("falls back to the axios message when no detail is present", async () => {
    server.use(http.get(`${API}/probe`, () => new HttpResponse(null, { status: 500 })));

    await expect(apiClient.get("/probe")).rejects.toThrow(/500/);
  });
});
