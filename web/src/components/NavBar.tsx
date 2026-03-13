import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

type MeResponse =
{
  ok: boolean;
  user?:
  {
    _id: string;
    username: string;
  }
};

export default function NavBar()
{
  const [username, setUsername] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() =>
  {
    async function LoadUser(token: string)
    {
      try
      {
        const response = await fetch("http://localhost:3001/api/account/me",
        {
          method: "GET",
          headers:
          {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        const data: MeResponse = await response.json();

        if (data.ok && data.user) setUsername(data.user.username);
        else setUsername(null);
      }
      catch (err)
      {
        console.error("Error loading user:", err);
        setUsername(null);
      }
    }

    LoadUser(sessionStorage.getItem("accessToken") || "");
  }, []);

  useEffect(() =>
  {
    function onDocClick(e: MouseEvent)
    {
      if (!openMenu) return;
      if (!menuRef.current) return;

      const target = e.target as Node;
      if (!menuRef.current.contains(target)) setOpenMenu(false);
    }

    function onEsc(e: KeyboardEvent)
    {
      if (e.key === "Escape") setOpenMenu(false);
    }

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);

    return () =>
    {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openMenu]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link to="/lobby" className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight">
            <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
              Leyline
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          {username ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setOpenMenu((v) => !v)}
                className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-3 py-2 text-sm text-slate-200
                           hover:bg-teal-500/20 hover:border-teal-200 transition-colors duration-150"
                aria-haspopup="menu"
                aria-expanded={openMenu}
              >
                {username}
              </button>

              {openMenu && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90
                             ring-1 ring-white/5 shadow-xl shadow-black/40 backdrop-blur"
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-white/5 to-transparent" />

                  <div className="relative py-2">
                    <Link
                      to="/account?panel=account"
                      role="menuitem"
                      onClick={() => setOpenMenu(false)}
                      className="block px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
                    >
                      Account
                    </Link>

                    <Link
                      to="/account?panel=social"
                      role="menuitem"
                      onClick={() => setOpenMenu(false)}
                      className="block px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
                    >
                      Social
                    </Link>

                    <div className="my-2 h-px bg-white/10" />

                    <Link to="/login">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() =>
                        {
                          sessionStorage.removeItem("accessToken");
                          setUsername(null);
                          setOpenMenu(false);
                        }}
                        className="block w-full px-4 py-2 text-left text-sm text-red-200 hover:bg-white/5"
                      >
                        Logout
                      </button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="ml-2 text-xs text-slate-400">
              <Link to="/login" className="text-teal-400 hover:underline">Login</Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}