import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { App } from "./App";
import { HelmetProvider } from "react-helmet-async";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <StrictMode>
      <App />
    </StrictMode>
  </HelmetProvider>,
);
