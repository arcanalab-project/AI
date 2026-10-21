"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ApiError, api, asApiError, canUpload } from "@/lib/api";
import { usePrefs } from "@/lib/preferences";
import { Badge, Button } from "@/components/ui";
import { ErrorNote, PageIntro, statusTone } from "@/components/shell";
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
  const [workerAlive, setWorkerAlive] = useState<boolean | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function load() {
    try {
      const data = await api<{ jobs: Job[]; worker?: { alive?: boolean } }>("/api/jobs");
      setJobs(data.jobs);
      setWorkerAlive(data.worker?.alive ?? null);
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
    <div className="space-y-4">
      <PageIntro kicker={t("processing.kicker")} title={t("processing.title")} body={t("processing.body")} />
      <ErrorNote error={error} />
      {workerAlive === false ? <p className="panel p-3 text-sm leading-snug">{t("processing.workerDown")}</p> : null}
      {jobs.length ? (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>{t("search.processingStatus")}</th>
                <th>{t("processing.asset")}</th>
                <th>{t("asset.generation")}</th>
                <th>{t("columns.attempts")}</th>
                <th>{t("columns.progress")}</th>
                <th>{t("columns.stage")}</th>
                <th>{t("asset.uploaded")}</th>
                <th>{t("processing.retry")}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Badge tone={statusTone(job.status)}>
                      {job.status && t.has(`status.${job.status}`) ? t(`status.${job.status}`) : t("status.unknown")}
                    </Badge>
                  </td>
                  <td className="num">
                    <Link href={`/assets/${job.assetId}`}>{job.assetId}</Link>
                    {job.pipelineVersion ? <div className="text-[var(--muted)]">{t("processing.pipeline", { value: job.pipelineVersion })}</div> : null}
                    {job.error?.code ? <ErrorNote error={new ApiError(job.error.code, job.error.params || {}, 400)} /> : null}
                  </td>
                  <td className="num">{job.generation ?? 0}</td>
                  <td className="num">{job.attempts || 1}</td>
                  <td>
                    {typeof job.progress === "number" ? (
                      <div className="min-w-[6rem] space-y-1">
                        <p className="num text-[var(--muted)]">{job.progress}</p>
                        <div className="meter" aria-hidden>
                          <span style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} />
                        </div>
                      </div>
                    ) : (
                      t("common.notAvailable")
                    )}
                  </td>
                  <td>{job.stage ? (t.has(`status.${job.stage}`) ? t(`status.${job.stage}`) : job.stage) : t("common.notAvailable")}</td>
                  <td>
                    <LocalDate value={job.updatedAt || job.createdAt} />
                  </td>
                  <td>
                    {job.status === "failed" && canUpload(user?.role) ? (
                      <Button type="button" variant="quiet" onClick={() => void retry(job.id)}>
                        {t("processing.retry")}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">{t("processing.empty")}</p>
      )}
    </div>
  );
}
