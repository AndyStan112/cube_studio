import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";
import "./theme.css";
import { installDiagnostics } from "./lib/diagnostics";
installDiagnostics();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
