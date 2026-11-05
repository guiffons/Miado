import "./styles/base.css";
import "./styles/liquid-glass.css";
import { initFirebaseClient } from "./services/firebaseClient";
import { initMiadoClient } from "./app/miadoClient.js";
import { initEnhancements } from "./ui/ambientGlass";

function bootstrapMiadoApp() {
  initFirebaseClient();
  initMiadoClient();
  initEnhancements();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapMiadoApp, { once: true });
} else {
  bootstrapMiadoApp();
}
