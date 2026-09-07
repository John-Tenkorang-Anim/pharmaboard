import { PlatformBrand } from "@/components/ui/PlatformBrand";
import { platform } from "@/lib/platform";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ApiError } from "@/lib/api";

type GoogleAPI = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }) => void;
      renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
};
declare global {
  interface Window {
    google?: GoogleAPI;
  }
}

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("student");
  const [institution, setInstitution] = useState("");
  const [field, setField] = useState(platform.discipline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credential, setCredential] = useState("");
  const [googleError, setGoogleError] = useState(false);
  const googleButton = useRef<HTMLDivElement>(null);
  const clientID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const from = location.state?.from;
  const destination =
    typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/";
  const handleError = (err: unknown) => {
    if (err instanceof ApiError && err.code === "already_exists")
      setError(
        "An account already uses this email. Sign in with its original method. For an older phone-only account, contact your platform administrator to restore access.",
      );
    else if (err instanceof ApiError && err.code === "invalid_credentials")
      setError(
        signup
          ? "Check your details. Use a password with at least 12 characters; very long passwords may need shortening."
          : "The email or password is incorrect. If you joined with Google, use Continue with Google.",
      );
    else setError(err instanceof Error ? err.message : "Unable to sign in. Please try again.");
  };
  const callback = useRef<(value: string) => void>(() => {});
  callback.current = async (value) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await signIn("google", { credential: value });
      navigate(destination, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "profile_required") {
        setCredential(value);
        setSignup(true);
      } else handleError(err);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!clientID) return;
    let active = true;
    const render = () => {
      if (!active || !window.google || !googleButton.current) return;
      window.google.accounts.id.initialize({
        client_id: clientID,
        callback: ({ credential }) => callback.current(credential),
      });
      window.google.accounts.id.renderButton(googleButton.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: 320,
      });
    };
    let script = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (!script) {
      script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      document.head.appendChild(script);
    }
    const failed = () => {
      if (active) setGoogleError(true);
    };
    script.addEventListener("load", render);
    script.addEventListener("error", failed);
    render();
    return () => {
      active = false;
      script?.removeEventListener("load", render);
      script?.removeEventListener("error", failed);
    };
  }, [clientID]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await signIn(credential ? "google" : signup ? "signup" : "login", {
        ...(credential ? { credential } : { email, password }),
        ...(signup
          ? { display_name: name, account_kind: role, institution, practice_area: field }
          : {}),
      });
      navigate(destination, { replace: true });
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }
  const inputClass =
    "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
  return (
    <main className="min-h-screen bg-white text-slate-900 lg:grid lg:grid-cols-2">
      <section className="hidden bg-slate-50 p-14 lg:flex lg:flex-col lg:justify-between">
        <PlatformBrand large />
        <div className="max-w-lg py-16">
          <p className="mb-5 text-sm font-semibold uppercase tracking-widest text-blue-700">
            Your professional community
          </p>
          <h1 className="text-5xl font-semibold leading-tight tracking-tight">
            Learn together.
            <br />
            Go further.
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            Connect with your peers, exchange ideas and discover your next opportunity. One
            workspace for your learning and professional life.
          </p>
        </div>
        <p className="text-sm text-slate-500">Built for pharmacy. Open to every discipline.</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <PlatformBrand />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">
            {credential ? "Complete your profile" : signup ? "Create your account" : "Welcome back"}
          </h2>
          <p className="mb-7 mt-3 text-slate-500">
            {credential
              ? "Tell your community a little about yourself."
              : "Choose Google or use your email and password."}
          </p>
          <div className={credential ? "hidden" : "mb-6"}>
            <div ref={googleButton} className="flex justify-center" />
            {!clientID && (
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
                Google sign-in will be available once the platform administrator completes setup.
                Email sign-in is available below.
              </p>
            )}
            {googleError && (
              <p role="status" className="text-sm text-slate-600">
                Google couldn't load. Refresh the page or use email instead.
              </p>
            )}
            <p className="mt-6 text-center text-sm text-slate-400">or continue with email</p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            {signup && (
              <>
                <label className="block text-sm font-medium">
                  Full name
                  <input
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    I am a
                    <select
                      className={inputClass}
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      {["student", "pharmacist", "professional", "educator", "organisation"].map(
                        (v) => (
                          <option key={v} value={v}>
                            {v.charAt(0).toUpperCase() + v.slice(1)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Field of study or work
                    <input
                      className={inputClass}
                      value={field}
                      onChange={(e) => setField(e.target.value)}
                      placeholder="e.g. Computer engineering"
                      maxLength={160}
                      required
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  School or organisation
                  <input
                    className={inputClass}
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="e.g. University of Ghana"
                    autoComplete="organization"
                    maxLength={160}
                    required
                  />
                </label>
              </>
            )}
            {!credential && (
              <>
                <label className="block text-sm font-medium">
                  Email address
                  <input
                    type="email"
                    className={inputClass}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    maxLength={254}
                    required
                  />
                </label>
                <label className="block text-sm font-medium">
                  Password
                  <input
                    type="password"
                    aria-label="Password"
                    className={inputClass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={signup ? "new-password" : "current-password"}
                    minLength={signup ? 12 : 1}
                    required
                  />
                  {signup && (
                    <span className="mt-2 block text-xs text-slate-500">
                      Use at least 12 characters. A few memorable words work well.
                    </span>
                  )}
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
            </button>
          </form>
          <p className="mt-7 text-center text-sm text-slate-500">
            {signup ? "Already have an account?" : "New here?"}{" "}
            <button
              className="font-semibold text-blue-700 hover:underline"
              onClick={() => {
                setSignup(!signup);
                setCredential("");
                setPassword("");
                setError("");
              }}
            >
              {signup ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
