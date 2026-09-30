import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "../../utils/logger";

afterEach(() => vi.restoreAllMocks());

describe("logger", () => {
  it("forwards each level to the matching console method (debug active in tests)", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.debug("d", 1);
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(debug).toHaveBeenCalledWith("d", 1);
    expect(info).toHaveBeenCalledWith("i");
    expect(warn).toHaveBeenCalledWith("w");
    expect(error).toHaveBeenCalledWith("e");
  });
});
