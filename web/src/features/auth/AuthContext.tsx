import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getToken, setToken } from "@/lib/api";
import type { User, OtpRequestResult, Session } from "@/lib/types";

type Channel = "phone" | "email";

interface RegisterInput {
  account_kind: string;
  display_name: string;
  phone_e164?: string;
  email?: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  requestOtp: (channel: Channel, contact: string) => Promise<OtpRequestResult>;
  register: (input: RegisterInput) => Promise<User>;
  verifyOtp: (channel: Channel, contact: string, code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState(() => !!getToken());

  const {
    data: user,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/auth/me"),
    enabled: hasToken,
    retry: false,
  });

  // A stale/revoked token surfaces as a failed /auth/me call — drop back to
  // the login screen instead of getting stuck on a permanent error state.
  useEffect(() => {
    if (error) {
      setToken(null);
      setHasToken(false);
    }
  }, [error]);

  const requestOtp = useCallback(
    (channel: Channel, contact: string) =>
      apiFetch<OtpRequestResult>("/auth/otp/request", {
        method: "POST",
        body: { channel, contact },
        auth: false,
      }),
    [],
  );

  const register = useCallback(
    (input: RegisterInput) =>
      apiFetch<User>("/auth/register", { method: "POST", body: input, auth: false }),
    [],
  );

  const verifyOtp = useCallback(
    async (channel: Channel, contact: string, code: string) => {
      const session = await apiFetch<Session>("/auth/otp/verify", {
        method: "POST",
        body: { channel, contact, code },
        auth: false,
      });
      setToken(session.access_token);
      setHasToken(true);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    [queryClient],
  );

  const logout = useCallback(() => {
    setToken(null);
    setHasToken(false);
    queryClient.clear();
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading: hasToken && isLoading,
        requestOtp,
        register,
        verifyOtp,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
