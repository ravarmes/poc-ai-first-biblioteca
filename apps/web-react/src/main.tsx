import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n/index.ts";
import "./index.css";
import { LibraryApp } from "./router.tsx";

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <LibraryApp />
    </StrictMode>,
  );
}
