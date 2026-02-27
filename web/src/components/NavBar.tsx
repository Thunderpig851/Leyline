import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

type MeResponse = 
{
  ok: boolean;
  user?:
  {
    _id: string;
    username: string;
  }
}

export default function NavBar()
{
  const [username, setUsername] = useState<string | null>(null);

  useEffect (() => 
  {
    async function LoadUser(token: string)
    {
      try
      {
        const response = await fetch('http://localhost:3001/api/account/me', 
        {
          method: 'GET',
          headers:
          {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        const data: MeResponse = await response.json();

        if (data.ok && data.user)
        {
          if (username !== data.user.username)
          {

            setUsername(data.user.username);
          }
        }
        else
        {
          setUsername(null);
        }
      }
      catch (err)
      {
        console.error("Error loading user:", err);
        setUsername(null);
      }
    }

    LoadUser(sessionStorage.getItem('accessToken') || '');
  }, []);

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

          <Link
            to="/account"
            className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-3 py-2 text-sm text-slate-200 hover:bg-teal-500/20"
          >
          {username}
          </Link>
          ) : (
          <div className="ml-2 text-xs text-slate-400">
              <Link to="/login" className="text-teal-400 hover:underline">Login</Link>
          </div>
          )

          }

        </nav>
      </div>
    </header>
  );
}