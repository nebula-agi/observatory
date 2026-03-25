import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { App } from "./App"
import { setupThemeAwareFavicon } from "./lib/favicon-utils"
import "./index.css"

setupThemeAwareFavicon({
  light: "/favicon-light.svg",
  dark: "/favicon-dark.svg",
})

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
