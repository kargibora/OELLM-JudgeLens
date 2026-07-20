import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App
      dataBaseUrl={import.meta.env.VITE_PREFSCOPE_DATA_URL}
      syncUrl
      layout="standalone"
    />
  </React.StrictMode>
);
