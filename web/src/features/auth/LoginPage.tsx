import { useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Button } from "@/components/ui/Button";
import { TextInput, Select } from "@/components/ui/Field";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { ApiError } from "@/lib/api";

type Step = "contact" | "code";

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
      const redirectTo = (location.state as { from?: string } | null)?.from ?? "/notices";
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Statement panel: the masthead and the product's actual claim, set
          large. An institution introduces itself before asking for details. */}
      <div className="hidden flex-col justify-between border-r border-rule bg-paper-sunken px-14 py-14 lg:flex">
        <div>
          <p className="font-display text-[1.75rem] font-semibold leading-none tracking-tight text-ink">
            PharmaBoard
          </p>
          <p className="label-caps mt-3 text-ink-faint">Pharmacy Notices · Ghana</p>
        </div>

        <div className="max-w-md">
          <p className="font-display text-display-lg font-normal leading-[1.15] text-ink">
            Official notices, delivered to verified professionals — and provably so.
          </p>
          <div className="mt-8 space-y-4 border-t border-rule pt-6">
            {[
              ["Two-person approval", "No single account can both write and approve a critical notice."],
              ["Frozen audience", "Every recipient is recorded in the same transaction that publishes."],
              ["Delivery evidence", "Accepted, delivered, read and acknowledged are counted separately."],
            ].map(([title, body]) => (
              <div key={title}>
                <p className="label-caps text-ink">{title}</p>
                <p className="mt-1 max-w-measure font-sans text-[0.8125rem] leading-relaxed text-ink-muted">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="font-mono text-[0.625rem] uppercase tracking-[0.06em] text-ink-faint">
          No patient data is processed on this platform
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-14">
        <div className="w-full max-w-sm">
          <p className="font-display text-[1.5rem] font-semibold leading-none tracking-tight text-ink lg:hidden">
            PharmaBoard
          </p>

          <p className="kicker mt-1 text-ink-faint lg:mt-0">
            {step === "contact" ? "Sign in or register" : "Confirm your number"}
          </p>
          <h1 className="mt-3 font-display text-display-md font-normal text-ink">
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
              <Button type="button" variant="quiet" onClick={() => setStep("contact")}>
                Use a different number
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
