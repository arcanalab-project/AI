"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, asApiError, type ApiError } from "@/lib/api";
import { usePrefs } from "@/lib/preferences";
import { Button, FieldLabel, TextInput } from "@/components/ui";
import { ErrorNote, PageIntro } from "@/components/shell";

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const { refreshUser } = usePrefs();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [adminConfigured, setAdminConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ capabilities?: { session?: { demoAdminConfigured?: boolean } } }>("/api/health")
      .then((data) => setAdminConfigured(Boolean(data.capabilities?.session?.demoAdminConfigured)))
      .catch(() => setAdminConfigured(null));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      await refreshUser();
      router.push("/");
    } catch (reason) {
      setError(asApiError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageIntro kicker={t("auth.loginKicker")} title={t("auth.loginTitle")} body={t("auth.loginBody")} />
      {adminConfigured === false ? <p className="text-sm leading-relaxed text-[var(--muted)]">{t("auth.missingAdmin")}</p> : null}
      <form className="panel min-w-0 space-y-4 p-6" onSubmit={(event) => void submit(event)}>
        <ErrorNote error={error} />
        <FieldLabel label={t("auth.email")}>
          <TextInput type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </FieldLabel>
        <FieldLabel label={t("auth.password")}>
          <TextInput type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </FieldLabel>
        <Button type="submit" disabled={busy}>
          {busy ? t("auth.working") : t("auth.submit")}
        </Button>
      </form>
    </div>
  );
}
