import { Outlet } from "react-router-dom";
import NavBar from "./NavBar";
import LeylineBackdrop from "./LeylineBackdrop";

export default function Layout()
{
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <LeylineBackdrop />

      <div className="relative z-10 flex min-h-screen flex-col">
        <NavBar />
        <main className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
