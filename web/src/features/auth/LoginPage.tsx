import { useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Button } from "@/components/ui/Button";
import { TextInput, Select } from "@/components/ui/Field";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { ApiError } from "@/lib/api";

type Step = "contact" | "code";

const PROOF_POINTS = [
  {
    title: "Two-person approval",
    body: "No single account can both write and approve a critical notice.",
  },
  {
    title: "Frozen audience",
    body: "Every recipient is recorded in the same transaction that publishes.",
  },
  {
    title: "Delivery evidence",
    body: "Accepted, delivered, read and acknowledged are counted separately.",
  },
];

export function LoginPage() {
  const { requestOtp, register, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState<Step>("contact");
  const [displayName, setDisplayName] = useState("");
  const [accountKind, setAccountKind] = useState("pharmacist");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function handleContactSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      try {
        await register({ account_kind: accountKind, display_name: displayName, phone_e164: phone });
      } catch (err) {
        // 409 = already registered, which is fine — we're logging them in.
        if (!(err instanceof ApiError && err.status === 409)) throw err;
      }
      const result = await requestOtp("phone", phone);
      setDevCode(result.dev_only_code ?? null);
      setCode(result.dev_only_code ?? "");
      setStep("code");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleCodeSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyOtp("phone", phone, code);
      const redirectTo = (location.state as { from?: string } | null)?.from ?? "/home";
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1fr]">
      {/* Solid black statement panel — plain wordmark, a bold claim, three
          plain proof points below a hairline. No gradient, no illustration. */}
      <div className="hidden flex-col justify-between bg-accent-900 px-16 py-16 lg:flex">
        <p className="text-lg font-bold text-white">PharmaBoard</p>

        <div className="max-w-md">
          <p className="text-[1.75rem] font-semibold leading-[1.3] text-white">
            Official notices, delivered to verified professionals — and provably so.
          </p>
          <div className="mt-10 space-y-5 border-t border-white/15 pt-6">
            {PROOF_POINTS.map(({ title, body }) => (
              <div key={title}>
                <p className="text-[0.8125rem] font-semibold text-white">{title}</p>
                <p className="mt-1 max-w-sm text-[0.8125rem] leading-relaxed text-white/60">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="eyebrow text-white/40">No patient data is processed on this platform</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-14">
        <div className="w-full max-w-sm">
          <p className="text-lg font-bold text-ink lg:hidden">PharmaBoard</p>

          <p className="eyebrow mt-1 lg:mt-0">
            {step === "contact" ? "Sign in or register" : "Confirm your number"}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-ink">
            {step === "contact" ? "Access the register" : "Enter your code"}
          </h1>

          {step === "contact" ? (
            <form onSubmit={handleContactSubmit} className="mt-8 space-y-5">
              <TextInput
                id="displayName"
                label="Full name"
                placeholder="Ama Mensah"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
              <Select
                id="accountKind"
                label="Role"
                value={accountKind}
                onChange={(e) => setAccountKind(e.target.value)}
              >
                <option value="pharmacist">Pharmacist</option>
                <option value="student">Student</option>
                <option value="organisation">Organisation</option>
              </Select>
              <TextInput
                id="phone"
                label="Phone number"
                placeholder="+233 20 000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                hint="Existing accounts sign in the same way — enter the number you registered with."
                required
              />
              {error != null && <ErrorBanner error={error} />}
              <Button type="submit" loading={busy} className="w-full">
                Continue
              </Button>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="mt-8 space-y-5">
              <TextInput
                id="code"
                label="Verification code"
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono text-lg tracking-[0.4em]"
                hint={
                  devCode
                    ? `Development mode — no SMS provider is connected, so the code (${devCode}) is filled in for you.`
                    : `Sent to ${phone}.`
                }
                required
                autoFocus
              />
              {error != null && <ErrorBanner error={error} />}
              <Button type="submit" loading={busy} className="w-full">
                Verify and continue
              </Button>
              <Button
                type="button"
                variant="quiet"
                onClick={() => setStep("contact")}
                className="w-full"
              >
                Use a different number
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
