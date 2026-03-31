import { createBrowserRouter, Navigate } from "react-router-dom";
import Layout from "../components/layout/Layout";

import LobbyPage from "../pages/LobbyPage";
import JoinRoomPage from "../pages/JoinRoomPage";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import NotFoundPage from "../pages/NotFoundPage";
import AccountPage from "../pages/AccountPage";
import GamePage from "../pages/GamePage";
import LFGPage from "../pages/LFGPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children:
    [
      { index: true, element: <Navigate to="/lobby" replace /> },
      { path: "lobby", element: <LobbyPage /> },
      { path: "account", element: <AccountPage /> },
      { path: "lfg", element: <LFGPage /> },
    ],
  },
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/rooms/:roomId", element: <JoinRoomPage /> },
  { path: "/rooms/:roomId/game", element: <GamePage /> },
  { path: "*", element: <NotFoundPage /> },
]);