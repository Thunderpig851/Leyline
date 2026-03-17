import { createBrowserRouter } from "react-router-dom";
import Layout from "../components/layout/Layout";

import LobbyPage from "../pages/LobbyPage";
import JoinRoomPage from "../pages/JoinRoomPage";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import NotFoundPage from "../pages/NotFoundPage";
import AccountPage from "../pages/AccountPage";
import GamePage from "../pages/GamePage";


export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: 
    [
      {path: "/lobby", element: <LobbyPage /> },
      {path: "/account", element: <AccountPage /> },
      {path: "/login", element: <LoginPage />},
      {path: "/register", element: <RegisterPage />},
    ]
  },
  {path: "/rooms/:id", element: <JoinRoomPage />},
  {path: "/rooms/:id/game", element: <GamePage /> },
  {path: "*", element: <NotFoundPage /> },
]);