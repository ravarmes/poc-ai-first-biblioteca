import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { resetMockState } from "./mocks/handlers.ts";
import { server } from "./mocks/server.ts";

beforeAll(() => {
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "scrollTo", {
      value: () => undefined,
      writable: true,
    });
  }
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockState();
  document.cookie = "lib_csrf=; path=/; max-age=0";
});

afterAll(() => {
  server.close();
});
