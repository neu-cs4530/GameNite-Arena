import "./reset.css";
import "./main.css";
import { StrictMode } from "react";
import App from "./App.tsx";
import { createRoot } from "react-dom/client";

// non-nullish assertion is okay here: index.html defines a div with id #root
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
