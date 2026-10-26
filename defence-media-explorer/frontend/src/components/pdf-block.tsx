"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PDFDocumentProxy, PageViewport, RenderTask } from "pdfjs-dist";
import { compact, passageFocus, type PdfGlyph, type PdfRect } from "@/lib/pdf-focus";

type Mark = { left: number; top: number; width: number; height: number };

const READABLE_PX = 13;

export function PdfBlock({
  url,
  text,
  page,
  query,
}: {
  url: string;
  text: string;
  page?: number | null;
  query?: string;
}) {
  const t = useTranslations();
  const viewRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [pageNumber, setPageNumber] = useState<number | null>(page ?? null);
  const [located, setLocated] = useState(true);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const view = viewRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!view || !stage || !canvas || !url) return;
    let destroyed = false;
    let pdf: PDFDocumentProxy | null = null;
    let renderTask: RenderTask | null = null;
    let locatedPage: Awaited<ReturnType<typeof locatePage>> | null = null;
    let lastWidth = -1;
    let timer = 0;

    async function paint(width: number) {
      setFailed(false);
      const pdfjs = await import("pdfjs-dist");
      if (destroyed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      if (!pdf) {
        const task = pdfjs.getDocument({ url, withCredentials: true });
        pdf = await task.promise;
      }
      if (destroyed || !pdf) return;
      if (!locatedPage) locatedPage = await locatePage(pdf, text, page, query);
      if (destroyed) return;

      if (renderTask) {
        renderTask.cancel();
        await renderTask.promise.catch(() => undefined);
        renderTask = null;
      }
      if (destroyed) return;

      const stageNode = stageRef.current;
      const canvasNode = canvasRef.current;
      if (!stageNode || !canvasNode) return;
      const base = locatedPage.page.getViewport({ scale: 1 });
      const passage = locatedPage.located ? passageFocus(locatedPage.items, text, base.width, base.height, query || "") : null;
      const available = Math.max(width - 20, 160);
      const readable = passage ? READABLE_PX / Math.max(passage.font, 6) : 1;
      const fitted = passage ? available / passage.focus.width : available / base.width;
      const scale = Math.min(2.8, Math.max(fitted, Math.min(readable, 2.8)));
      const viewport = locatedPage.page.getViewport({ scale });
      const crop = passage ? cropOf(viewport, passage.focus) : { left: 0, top: 0, width: viewport.width, height: viewport.height };
      const cssWidth = Math.max(1, Math.ceil(crop.width));
      const cssHeight = Math.max(1, Math.ceil(crop.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvasNode.width = Math.ceil(cssWidth * dpr);
      canvasNode.height = Math.ceil(cssHeight * dpr);
      canvasNode.style.width = `${cssWidth}px`;
      canvasNode.style.height = `${cssHeight}px`;
      const context = canvasNode.getContext("2d");
      if (!context) return;
      const task = locatedPage.page.render({
        canvasContext: context,
        viewport,
        transform: [dpr, 0, 0, dpr, -crop.left * dpr, -crop.top * dpr],
      });
      renderTask = task;
      try {
        await task.promise;
      } catch (error) {
        if (destroyed || (error instanceof Error && error.name === "RenderingCancelledException")) return;
        throw error;
      }
      if (destroyed) return;
      const boxes = passage ? passage.marks.map((mark) => place(mark, viewport, crop.left, crop.top)) : [];
      setMarks(boxes);
      setPageNumber(locatedPage.pageNumber);
      setLocated(Boolean(passage));
      setReady(true);
      stageNode.scrollTop = 0;
      stageNode.scrollLeft = 0;
    }

    function schedule() {
      const node = stageRef.current;
      const width = node?.clientWidth || 0;
      if (width < 40 || Math.abs(width - lastWidth) < 24) return;
      lastWidth = width;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        paint(width).catch(() => {
          if (!destroyed) setFailed(true);
        });
      }, 40);
    }

    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(view);
    return () => {
      destroyed = true;
      observer.disconnect();
      window.clearTimeout(timer);
      renderTask?.cancel();
      void pdf?.destroy();
    };
  }, [url, text, page, query]);

  return (
    <div className="pdf-view" ref={viewRef}>
      <p className="pdf-view-caption">
        {pageNumber != null ? t("asset.page", { page: pageNumber }) : t("common.loading")}
        {!located && ready && !failed ? <span> · {t("asset.pdfMissing")}</span> : null}
      </p>
      {failed ? <p className="text-sm text-[var(--warn)]">{t("asset.pdfMissing")}</p> : null}
      <div className={ready ? "pdf-stage" : "pdf-stage pdf-stage-loading"} ref={stageRef}>
        <div className="pdf-page">
          <canvas ref={canvasRef} />
          {marks.map((mark, index) => (
            <span
              key={`${mark.left}-${mark.top}-${index}`}
              className="pdf-mark"
              style={{ left: mark.left, top: mark.top, width: mark.width, height: mark.height }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function cropOf(viewport: PageViewport, focus: PdfRect) {
  const rect = viewport.convertToViewportRectangle([focus.x, focus.y, focus.x + focus.width, focus.y + focus.height]);
  const left = clamp(Math.min(rect[0], rect[2]), 0, viewport.width);
  const top = clamp(Math.min(rect[1], rect[3]), 0, viewport.height);
  const right = clamp(Math.max(rect[0], rect[2]), 0, viewport.width);
  const bottom = clamp(Math.max(rect[1], rect[3]), 0, viewport.height);
  return { left, top, width: Math.max(right - left, 1), height: Math.max(bottom - top, 1) };
}

function place(mark: PdfRect, viewport: PageViewport, originLeft: number, originTop: number): Mark {
  const rect = viewport.convertToViewportRectangle([mark.x, mark.y, mark.x + mark.width, mark.y + mark.height]);
  return {
    left: Math.min(rect[0], rect[2]) - originLeft,
    top: Math.min(rect[1], rect[3]) - originTop,
    width: Math.abs(rect[2] - rect[0]),
    height: Math.abs(rect[3] - rect[1]),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

async function locatePage(pdf: PDFDocumentProxy, transcript: string, preferred?: number | null, query?: string) {
  const order: number[] = [];
  if (preferred && preferred >= 1 && preferred <= pdf.numPages) order.push(preferred);
  for (let index = 1; index <= pdf.numPages; index += 1) {
    if (index !== preferred) order.push(index);
  }
  const needles = [compact(query || ""), compact(transcript).slice(0, 32)].filter((needle) => needle.length >= 8);
  let fallback: Awaited<ReturnType<typeof pdf.getPage>> | null = null;
  let fallbackNumber = order[0] || 1;
  for (const needle of needles) {
    for (const pageNumber of order) {
      const docPage = await pdf.getPage(pageNumber);
      const content = await docPage.getTextContent();
      const items = glyphs(content.items);
      if (!fallback) {
        fallback = docPage;
        fallbackNumber = pageNumber;
      }
      const hay = compact(items.map((item) => item.str).join(""));
      if (hay.includes(needle.slice(0, Math.min(48, needle.length)))) {
        return { page: docPage, pageNumber, items, located: true };
      }
    }
  }
  const docPage = fallback || (await pdf.getPage(1));
  const content = await docPage.getTextContent();
  return { page: docPage, pageNumber: fallbackNumber, items: glyphs(content.items), located: false };
}

function glyphs(items: unknown[]): PdfGlyph[] {
  const rows: PdfGlyph[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as { str?: unknown; transform?: unknown; width?: unknown; height?: unknown };
    if (typeof row.str !== "string" || !Array.isArray(row.transform)) continue;
    rows.push({
      str: row.str,
      transform: row.transform.map((value) => Number(value)),
      width: Number(row.width) || 0,
      height: Number(row.height) || 0,
    });
  }
  return rows;
}
