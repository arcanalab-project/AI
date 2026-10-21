"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { LOCALES, api, asApiError, isAdmin, type ApiError, type User } from "@/lib/api";
import { usePrefs, type Theme } from "@/lib/preferences";
import { Badge, Button, FieldLabel, Select, TextInput } from "@/components/ui";
import { ErrorNote, PageIntro } from "@/components/shell";
import { LocalNumber } from "@/components/format";

type Health = {
  status?: string;
  environment?: string;
  database?: string;
  unavailable?: string[];
  capabilities?: Record<string, Record<string, unknown>>;
};

const CAPABILITIES = ["mongodb", "gridfs", "embeddings", "vision", "transcription", "rerank", "queue", "session"] as const;

export default function SettingsPage() {
  const t = useTranslations();
  const { locale, timeZone, theme, setLocale, setTimeZone, setTheme, user, refreshUser } = usePrefs();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [newName, setNewName] = useState("");
  const zones = useMemo(() => zonesOf(timeZone), [timeZone]);

  useEffect(() => setDisplayName(user?.displayName || ""), [user?.displayName]);

  useEffect(() => {
    api<Health>("/api/health")
      .then((data) => setHealth(data))
      .catch((reason) => setError(asApiError(reason)));
  }, []);

  useEffect(() => {
    if (!isAdmin(user?.role)) return;
    api<{ users: User[] }>("/api/users")
      .then((data) => setUsers(data.users))
      .catch((reason) => setError(asApiError(reason)));
  }, [user?.role]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api("/api/auth/me", { method: "PATCH", body: JSON.stringify({ displayName }) });
      await refreshUser();
      setNotice(t("settings.saved"));
      setError(null);
    } catch (reason) {
      setError(asApiError(reason));
    }
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify({ email, password, displayName: newName, role }) });
      setEmail("");
      setPassword("");
      setNewName("");
      const data = await api<{ users: User[] }>("/api/users");
      setUsers(data.users);
      setError(null);
    } catch (reason) {
      setError(asApiError(reason));
    }
  }

  async function changeRole(id: string, next: string) {
    try {
      await api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ role: next }) });
      setUsers(users.map((item) => (item.id === id ? { ...item, role: next as User["role"] } : item)));
    } catch (reason) {
      setError(asApiError(reason));
    }
  }

  return (
    <div className="space-y-4">
      <PageIntro kicker={t("settings.kicker")} title={t("settings.title")} body={t("settings.body")} />
      <ErrorNote error={error} />
      <section className="panel min-w-0 space-y-3 p-3">
        <FieldLabel label={t("settings.language")} hint={t("settings.languageHint")}>
          <Select value={locale} onChange={(event) => setLocale(event.target.value as (typeof LOCALES)[number])}>
            {LOCALES.map((item) => (
              <option key={item} value={item}>
                {t(`language.${item}`)}
              </option>
            ))}
          </Select>
        </FieldLabel>
        <FieldLabel label={t("settings.timeZone")} hint={t("settings.timeZoneHint")}>
          <Select value={zones.includes(timeZone) ? timeZone : zones[0]} onChange={(event) => setTimeZone(event.target.value)}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
        </FieldLabel>
        <div>
          <p className="mb-2 text-sm font-medium">{t("settings.theme")}</p>
          <div className="flex flex-wrap gap-2">
            {(["light", "dark", "system"] as Theme[]).map((item) => (
              <Button key={item} type="button" variant={theme === item ? "primary" : "quiet"} onClick={() => setTheme(item)}>
                {t(`theme.${item}`)}
              </Button>
            ))}
          </div>
        </div>
      </section>
      {user ? (
        <form className="panel min-w-0 space-y-3 p-3" onSubmit={(event) => void saveProfile(event)}>
          <h2 className="section-title">{t("settings.profile")}</h2>
          <FieldLabel label={t("settings.displayName")}>
            <TextInput value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </FieldLabel>
          <Button type="submit">{t("common.save")}</Button>
          {notice ? <p className="text-sm">{notice}</p> : null}
        </form>
      ) : null}
      <section className="panel min-w-0 space-y-3 p-3">
        <h2 className="section-title">{t("settings.health")}</h2>
        <p className="leading-relaxed text-[var(--muted)]">{t("settings.healthBody")}</p>
        <p className="leading-relaxed">{t("settings.indexingNote")}</p>
        {health ? (
          <div className="space-y-4">
            <p>
              {t("settings.statusLabel")}: {t.has(`health.status.${health.status}`) ? t(`health.status.${health.status}`) : t("health.status.degraded")}
            </p>
            {health.environment ? (
              <p>
                {t("settings.environment")}: {health.environment}
              </p>
            ) : null}
            {health.database ? (
              <p>
                {t("settings.database")}: {health.database}
              </p>
            ) : null}
            {health.unavailable?.length ? (
              <p className="break-words">
                {t("settings.unavailable")}: {health.unavailable.map((name) => (t.has(`settings.capability.${name}`) ? t(`settings.capability.${name}`) : name)).join(", ")}
              </p>
            ) : (
              <p>{t("settings.allClear")}</p>
            )}
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("settings.health")}</th>
                    <th>{t("settings.statusLabel")}</th>
                    <th>{t("settings.model")}</th>
                    <th>{t("settings.reachable")}</th>
                    <th>{t("common.details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {CAPABILITIES.map((name) => (
                    <Capability key={name} name={name} value={health.capabilities?.[name] || {}} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p>{t("common.loading")}</p>
        )}
      </section>
      {isAdmin(user?.role) ? (
        <section className="panel min-w-0 space-y-3 p-3">
          <h2 className="section-title">{t("settings.users")}</h2>
          <p className="leading-relaxed text-[var(--muted)]">{t("settings.usersBody")}</p>
          <form className="grid min-w-0 gap-3" onSubmit={(event) => void createUser(event)}>
            <FieldLabel label={t("settings.email")}>
              <TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </FieldLabel>
            <FieldLabel label={t("settings.displayName")}>
              <TextInput value={newName} onChange={(event) => setNewName(event.target.value)} />
            </FieldLabel>
            <FieldLabel label={t("settings.password")} hint={t("settings.passwordHint")}>
              <TextInput type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </FieldLabel>
            <FieldLabel label={t("settings.role")}>
              <Select value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="viewer">{t("role.viewer")}</option>
                <option value="uploader">{t("role.uploader")}</option>
                <option value="admin">{t("role.admin")}</option>
              </Select>
            </FieldLabel>
            <Button type="submit">{t("settings.createUser")}</Button>
          </form>
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>{t("settings.displayName")}</th>
                  <th>{t("settings.email")}</th>
                  <th>{t("settings.role")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((person) => (
                  <tr key={person.id}>
                    <td className="font-sans font-semibold text-[var(--ink)]">{person.displayName}</td>
                    <td className="break-words">{person.email}</td>
                    <td>
                      <Select value={person.role} onChange={(event) => void changeRole(person.id, event.target.value)} aria-label={t("settings.role")}>
                        <option value="viewer">{t("role.viewer")}</option>
                        <option value="uploader">{t("role.uploader")}</option>
                        <option value="admin">{t("role.admin")}</option>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Capability({ name, value }: { name: string; value: Record<string, unknown> }) {
  const t = useTranslations();
  const search = value.search as { vectorIndex?: Record<string, unknown>; textIndex?: Record<string, unknown>; textVectorIndex?: Record<string, unknown> } | undefined;
  const unavailable = typeof value.errorCode === "string";
  return (
    <tr>
      <th scope="row" className="font-sans normal-case tracking-normal text-[var(--ink)]">
        {t(`settings.capability.${name}`)}
      </th>
      <td>
        <Badge tone={unavailable ? "warn" : "ok"}>{unavailable ? t("settings.unavailable") : t("health.status.ok")}</Badge>
      </td>
      <td className="num">{typeof value.model === "string" ? value.model : t("common.notAvailable")}</td>
      <td>{typeof value.reachable === "boolean" ? (value.reachable ? t("common.yes") : t("common.no")) : t("common.notAvailable")}</td>
      <td>
        <dl className="grid gap-0.5 text-xs leading-snug">
          <Fact label={t("settings.configured")} value={value.configured} />
          <Fact label={t("settings.enabled")} value={value.enabled} />
          <Fact label={t("settings.dimensions")} value={value.dimensions} />
          <Fact label={t("settings.textChannel")} value={value.textChannelEnabled} />
          <Fact label={t("settings.textModel")} value={value.textModel} />
          <Fact label={t("settings.database")} value={value.database} />
          <Fact label={t("settings.bucket")} value={value.bucket} />
          <Fact label={t("settings.legacyObjects")} value={value.legacyObjectStorageCount} />
          <Fact label={t("settings.publicEndpoint")} value={value.publicEndpointConfigured} />
          {typeof value.errorCode === "string" && t.has(`errors.${value.errorCode}`) ? (
            <div className="text-[var(--danger-text)]">{t(`errors.${value.errorCode}`)}</div>
          ) : null}
        </dl>
        {search?.vectorIndex ? <IndexLine title={t("settings.indexVector")} index={search.vectorIndex} /> : null}
        {search?.textIndex ? <IndexLine title={t("settings.indexText")} index={search.textIndex} /> : null}
        {search?.textVectorIndex ? <IndexLine title={t("settings.indexTextVector")} index={search.textVectorIndex} /> : null}
      </td>
    </tr>
  );
}

function IndexLine({ title, index }: { title: string; index: Record<string, unknown> }) {
  const t = useTranslations();
  const status = typeof index.status === "string" ? index.status : "unknown";
  return (
    <p className="mt-2 break-words text-sm leading-snug">
      {title}
      {typeof index.name === "string" ? ` (${index.name})` : ""}: {t.has(`health.index.${status}`) ? t(`health.index.${status}`) : t("health.index.unknown")}
      {typeof index.queryable === "boolean" ? ` · ${t("settings.queryable")}: ${index.queryable ? t("common.yes") : t("common.no")}` : ""}
    </p>
  );
}

function Fact({ label, value }: { label: string; value: unknown }) {
  const t = useTranslations();
  if (value == null || value === "") return null;
  if (typeof value === "string" && (value.includes("://") || value.includes("@") || value.includes("localhost"))) return null;
  let shown: ReactNode = null;
  if (typeof value === "boolean") shown = value ? t("common.yes") : t("common.no");
  else if (typeof value === "number") shown = <LocalNumber value={value} />;
  else if (typeof value === "string") shown = value;
  else return null;
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="break-words">{shown}</dd>
    </div>
  );
}

function zonesOf(current: string) {
  const supported = typeof Intl !== "undefined" && "supportedValuesOf" in Intl ? Intl.supportedValuesOf("timeZone") : ["UTC", "Europe/Rome", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid"];
  return supported.includes(current) ? supported : [current, ...supported];
}
