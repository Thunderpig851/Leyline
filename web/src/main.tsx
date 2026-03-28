import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import "./index.css";

import { GameSessionProvider } from "./context/GameSession";
import { MediaSessionProvider } from "./context/MediaSession";
import ErrorBoundary from "./components/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <GameSessionProvider>
        <MediaSessionProvider>
          <RouterProvider router={router} />
        </MediaSessionProvider>
      </GameSessionProvider>
    </ErrorBoundary>
  </React.StrictMode>
);