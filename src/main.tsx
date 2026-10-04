import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles/global.css";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
if (import.meta.env.DEV && location.pathname.replace(/\/$/, '') === '/__glass') {
  void import('./dev/GlassStudio').then(({ default: GlassStudio }) => root.render(<React.StrictMode><GlassStudio /></React.StrictMode>));
} else {
  if (import.meta.env.DEV) void import('./dev/glassStudioBridge');
  root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
}
