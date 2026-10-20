"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ApiError, api, asApiError, canUpload } from "@/lib/api";
import { usePrefs } from "@/lib/preferences";
import { Badge, Button } from "@/components/ui";
import { ErrorNote, PageIntro } from "@/components/shell";
import { LocalDate } from "@/components/format";

type Job = {
  id: string;
  assetId: string;
  status?: string;
  generation?: number;
  pipelineVersion?: string;
  attempts?: number;
  progress?: number;
  stage?: string;
  createdAt?: string;
  updatedAt?: string;
  error?: { code?: string; params?: Record<string, string | number | string[]> } | null;
};

export default function ProcessingPage() {
  const t = useTranslations();
  const { user } = usePrefs();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<ApiError | null>(null);

  async function load() {
    try {
      const data = await api<{ jobs: Job[] }>("/api/jobs");
      setJobs(data.jobs);
      setError(null);
    } catch (reason) {
      setError(asApiError(reason));
    }
  }

  useEffect(() => {
    if (!user) return;
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [user]);

  async function retry(id: string) {
    try {
      await api(`/api/jobs/${id}/retry`, { method: "POST" });
      await load();
    } catch (reason) {
      setError(asApiError(reason));
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro kicker={t("processing.kicker")} title={t("processing.title")} body={t("processing.body")} />
      <ErrorNote error={error} />
      {jobs.length ? (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li key={job.id} className="panel min-w-0 space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={job.status === "failed" ? "danger" : job.status === "ready" ? "ok" : job.status === "partial" ? "warn" : "neutral"}>
                  {job.status && t.has(`status.${job.status}`) ? t(`status.${job.status}`) : t("status.unknown")}
                </Badge>
                <span className="text-sm text-[var(--muted)]">{t("processing.generation", { value: job.generation ?? 0 })}</span>
                <span className="text-sm text-[var(--muted)]">{t("processing.attempt", { count: job.attempts || 1 })}</span>
                {job.pipelineVersion ? <span className="text-sm text-[var(--muted)]">{t("processing.pipeline", { value: job.pipelineVersion })}</span> : null}
              </div>
              <p className="break-words text-sm">
                {t("processing.asset")}:{" "}
                <Link href={`/assets/${job.assetId}`} className="underline-offset-2 hover:underline">
                  {job.assetId}
                </Link>
              </p>
              {typeof job.progress === "number" ? (
                <div className="space-y-1">
                  <p className="text-sm text-[var(--muted)]">{t("processing.progress", { value: job.progress })}</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                    <div className="h-full bg-spring" style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} />
                  </div>
                </div>
              ) : null}
              {job.stage ? (
                <p className="text-sm text-[var(--muted)]">
                  {t("processing.stage", { value: t.has(`status.${job.stage}`) ? t(`status.${job.stage}`) : job.stage })}
                </p>
              ) : null}
              <p className="text-sm text-[var(--muted)]">
                <LocalDate value={job.updatedAt || job.createdAt} />
              </p>
              {job.error?.code ? <ErrorNote error={new ApiError(job.error.code, job.error.params || {}, 400)} /> : null}
              {job.status === "failed" && canUpload(user?.role) ? (
                <Button type="button" variant="quiet" onClick={() => void retry(job.id)}>
                  {t("processing.retry")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[var(--muted)]">{t("processing.empty")}</p>
      )}
    </div>
  );
}
