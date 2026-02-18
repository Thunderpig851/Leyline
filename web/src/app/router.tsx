import { createBrowserRouter } from "react-router-dom";
import LobbyPage from "../pages/LobbyPage";
import RoomPage from "../pages/RoomPage";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import NotFoundPage from "../pages/NotFoundPage";


export const router = createBrowserRouter([
  { path: "/", element: <LobbyPage /> },
  { path: "*", element: <NotFoundPage /> },
  {path: "/room", element: <RoomPage />},
  {path: "/login", element: <LoginPage />},
  {path: "/register", element: <RegisterPage />},
]);