import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import "./index.css";

import { GameSessionProvider } from "./context/GameSession";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GameSessionProvider>
      <RouterProvider router={router} />
    </GameSessionProvider>
  </React.StrictMode>
);
