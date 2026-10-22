"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError, api, asApiError, canUpload, isAdmin } from "@/lib/api";
import { usePrefs } from "@/lib/preferences";
import { Button, FieldLabel, TextArea, TextInput } from "@/components/ui";
import { ErrorNote, PageIntro } from "@/components/shell";
import { LocalDate } from "@/components/format";

type Collection = { id: string; name: string; description: string; createdAt?: string };

export default function CollectionsPage() {
  const t = useTranslations();
  const { user } = usePrefs();
  const [rows, setRows] = useState<Collection[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  async function load() {
    const data = await api<{ collections: Collection[] }>("/api/collections");
    setRows(data.collections);
  }

  useEffect(() => {
    if (!user) return;
    load().catch((reason) => setError(asApiError(reason)));
  }, [user]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api("/api/collections", { method: "POST", body: JSON.stringify({ name, description }) });
      setName("");
      setDescription("");
      setError(null);
      await load();
    } catch (reason) {
      setError(asApiError(reason));
    }
  }

  async function save(row: Collection) {
    try {
      await api(`/api/collections/${row.id}`, { method: "PATCH", body: JSON.stringify({ name: row.name, description: row.description }) });
      setEditing(null);
      setError(null);
      await load();
    } catch (reason) {
      setError(asApiError(reason));
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/collections/${id}`, { method: "DELETE" });
      setError(null);
      await load();
    } catch (reason) {
      setError(asApiError(reason));
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro kicker={t("collections.kicker")} title={t("collections.title")} body={t("collections.body")} />
      <ErrorNote error={error} />
      {user && !canUpload(user.role) ? <p>{t("collections.viewerOnly")}</p> : null}
      {canUpload(user?.role) ? (
        <form className="panel min-w-0 space-y-4 p-5" onSubmit={(event) => void create(event)}>
          <FieldLabel label={t("collections.name")}>
            <TextInput value={name} onChange={(event) => setName(event.target.value)} required />
          </FieldLabel>
          <FieldLabel label={t("collections.description")}>
            <TextArea value={description} onChange={(event) => setDescription(event.target.value)} />
          </FieldLabel>
          <Button type="submit">{t("collections.create")}</Button>
        </form>
      ) : null}
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="panel min-w-0 space-y-3 p-5">
              {editing === row.id ? (
                <>
                  <TextInput value={row.name} onChange={(event) => setRows(rows.map((item) => (item.id === row.id ? { ...item, name: event.target.value } : item)))} />
                  <TextArea value={row.description} onChange={(event) => setRows(rows.map((item) => (item.id === row.id ? { ...item, description: event.target.value } : item)))} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => void save(row)}>
                      {t("collections.save")}
                    </Button>
                    <Button type="button" variant="quiet" onClick={() => setEditing(null)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="break-words font-serif text-2xl">{row.name}</h2>
                  {row.description ? <p className="break-words leading-relaxed text-[var(--muted)]">{row.description}</p> : null}
                  <p className="text-sm text-[var(--muted)]">
                    <LocalDate value={row.createdAt} />
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {canUpload(user?.role) ? (
                      <Button type="button" variant="quiet" onClick={() => setEditing(row.id)}>
                        {t("common.edit")}
                      </Button>
                    ) : null}
                    {isAdmin(user?.role) ? (
                      <Button type="button" variant="danger" onClick={() => void remove(row.id)}>
                        {t("collections.delete")}
                      </Button>
                    ) : (
                      <p className="text-sm text-[var(--muted)]">{t("collections.adminDelete")}</p>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[var(--muted)]">{t("collections.empty")}</p>
      )}
    </div>
  );
}
