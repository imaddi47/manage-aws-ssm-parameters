import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { applyTheme, getStoredTheme } from "./lib/theme.js";
import "./theme.css";
import "./styles.css";

applyTheme(getStoredTheme());
createRoot(document.getElementById("root")).render(<App />);
