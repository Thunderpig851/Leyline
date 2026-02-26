import { Outlet } from "react-router-dom";
import NavBar from "../components/NavBar";

export default function Layout()
{
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
            <NavBar />
            <Outlet />
        </div>
    )
}