import { createBrowserRouter } from "react-router-dom";
import Layout from "../lib/Layout";

import LobbyPage from "../pages/LobbyPage";
import JoinRoomPage from "../pages/JoinRoomPage";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import NotFoundPage from "../pages/NotFoundPage";
import AccountPage from "../pages/AccountPage";


export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: 
    [
      {path: "/lobby", element: <LobbyPage /> },
      {path: "/rooms/:id", element: <JoinRoomPage roomId={""} roomTitle={""} />},
      {path: "/account", element: <AccountPage /> },

    ]
  },
  {path: "*", element: <NotFoundPage /> },
  {path: "/login", element: <LoginPage />},
  {path: "/register", element: <RegisterPage />},
]);