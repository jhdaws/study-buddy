// Who is signed in, for every screen. Reads the stored session once at
// launch, then follows Supabase's auth events (sign-in, sign-out, refresh).

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/lib/supabase";

type AuthState = { session: Session | null; loading: boolean };

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) setState({ session: data.session, loading: false });
      })
      .catch(() => {
        if (alive) setState({ session: null, loading: false });
      });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setState({ session, loading: false });
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
