import { PlatformBrand } from "@/components/ui/PlatformBrand";
import { platform } from "@/lib/platform";
import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Button } from "@/components/ui/Button";
import { TextInput, Select } from "@/components/ui/Field";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { ApiError } from "@/lib/api";

type Step = "contact" | "code";

const PROOF_POINTS = [
  {
    title: "Across schools and disciplines",
    body: "A place for computer engineering, medicine, pharmacy, business and every field in between.",
  },
  {
    title: "Learn and build together",
    body: "Share ideas, join discussions, meet your peers and showcase your projects.",
  },
  {
    title: "Your next opportunity",
    body: "Grow your network and discover learning, mentorship and career opportunities.",
  },
];

export function LoginPage() {
  const { requestOtp, register, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState<Step>("contact");
  const [displayName, setDisplayName] = useState("");
  const [accountKind, setAccountKind] = useState("student");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [field, setField] = useState(platform.discipline);
  const [otherField, setOtherField] = useState("");
  const [institution, setInstitution] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendSeconds,setResendSeconds] = useState(0);
  useEffect(()=>{if(resendSeconds<=0)return;const timer=setTimeout(()=>setResendSeconds(s=>Math.max(0,s-1)),1000);return()=>clearTimeout(timer);},[resendSeconds]);
  async function resendCode(){setBusy(true);setError(null);try{const result=await requestOtp("phone",phone);setDevCode(result.dev_only_code??null);setCode(result.dev_only_code??"");setResendSeconds(60);}catch(err){setError(err);}finally{setBusy(false);}}
  const [error, setError] = useState<unknown>(null);

  async function openPreview() {
    setBusy(true);
    setError(null);
    try {
      const result = await requestOtp("phone", "+233200880001");
      if (!result.dev_only_code)
        throw new Error(
          "Preview is available only on the development server after sample content has been loaded.",
        );
      await verifyOtp("phone", "+233200880001", result.dev_only_code);
      navigate((location.state as { from?: string } | null)?.from ?? "/home", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleContactSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        try {
          await register({
            account_kind: accountKind,
            display_name: displayName,
            phone_e164: phone,
            practice_area: field === "Other" ? otherField.trim() : field,
            institution: institution.trim(),
          });
        } catch (err) {
          // 409 means this phone number already has an account — most often
          // someone who registered on an earlier attempt (e.g. one that
          // failed after registering but before OTP completed) and is
          // simply trying again. Treat it exactly like signing in, rather
          // than dead-ending them on an "already registered" error with no
          // way forward.
          if (!(err instanceof ApiError && err.status === 409)) throw err;
        }
      }
      const result = await requestOtp("phone", phone);
      setDevCode(result.dev_only_code ?? null);
      setCode(result.dev_only_code ?? "");
      setResendSeconds(60);
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
        <div className="text-white">
          <PlatformBrand large />
        </div>

        <div className="max-w-md">
          <p className="text-[1.75rem] font-semibold leading-[1.3] text-white">
            Your campus, your career, and a world of ideas.
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

        <p className="eyebrow text-white/40">Built for students, educators and professionals</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-14">
        <div className="w-full max-w-sm">
          <div className="mb-7 lg:hidden">
            <PlatformBrand large />
          </div>

          <p className="eyebrow mt-1 lg:mt-0">
            {step === "contact"
              ? mode === "signin"
                ? "Sign in"
                : "Create your account"
              : "Confirm your number"}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-ink">
            {step === "contact" ? `Welcome to ${platform.name}` : "Enter your code"}
          </h1>

          {step === "contact" ? (
            <form onSubmit={handleContactSubmit} className="mt-8 space-y-5">
              <div className="flex gap-2" role="group" aria-label="Account access">
                {(["signin", "signup"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    onClick={() => {
                      setMode(value);
                      setError(null);
                    }}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${mode === value ? "bg-ink text-white" : "bg-slate-50 text-muted"}`}
                  >
                    {value === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>
              <p className="text-sm leading-6 text-muted">
                {mode === "signin"
                  ? "Welcome back. Sign in with your registered number, whatever your school or field."
                  : "Join as an individual or represent your school. Your school details appear on your profile and do not imply verified affiliation."}
              </p>
              {mode === "signup" && (
                <>
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
                    <option value="professional">Professional</option>
                    <option value="educator">Educator / researcher</option>
                    <option value="organisation">School / organisation</option>
                  </Select>
                  <Select
                    required
                    id="field"
                    label="Field of study or work"
                    value={field}
                    onChange={(e) => setField(e.target.value)}
                  >
                    <option value="" disabled>
                      Select your field
                    </option>
                    {Array.from(
                      new Set([
                        platform.discipline,
                        "Computer Engineering",
                        "Computer Science",
                        "Medicine",
                        "Pharmacy",
                        "Nursing",
                        "Engineering",
                        "Business",
                        "Arts & Humanities",
                        "Sciences",
                        "Other",
                      ]),
                    ).map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                  {field === "Other" && (
                    <TextInput
                      id="other-field"
                      label="Your field"
                      required
                      maxLength={160}
                      value={otherField}
                      onChange={(e) => setOtherField(e.target.value)}
                    />
                  )}
                  <TextInput
                    id="institution"
                    label="School, university or organisation"
                    placeholder="e.g. University of Ghana"
                    required
                    maxLength={160}
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                  />
                </>
              )}
              <TextInput
                id="phone"
                label="Phone number"
                placeholder="+233 20 000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                hint="Use international format, including your country code."
                required
              />
              {error != null && <ErrorBanner error={error} />}
              <Button type="submit" loading={busy} className="w-full">
                Continue
              </Button>
              {import.meta.env.DEV && (
                <div className="border-t border-hairline pt-5">
                  <Button
                    type="button"
                    variant="secondary"
                    loading={busy}
                    onClick={openPreview}
                    className="w-full"
                  >
                    Explore sample workspace
                  </Button>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    Development preview with sample colleagues, lessons, jobs, and meetings.
                  </p>
                </div>
              )}
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="mt-8 space-y-5">
              <TextInput
                id="code"
                label="Verification code"
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
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
              <Button type="button" variant="secondary" disabled={busy || resendSeconds>0} onClick={resendCode} className="w-full">{resendSeconds>0 ? `Resend code in ${resendSeconds}s` : "Resend code"}</Button>
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
