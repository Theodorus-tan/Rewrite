import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import type { ParagraphPreview } from "../types/app";
import * as api from "../lib/api";

type HistoryItem = {
  docId: string;
  sourcePath: string;
  displayName: string;
  completedRounds: number[];
  lastTimestamp: string;
  latestOutputPath: string;
};

type Props = {
  item: HistoryItem | null;
  onClose: () => void;
};

function formatTime(ts: string): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ts; }
}

export function HistoryViewModal({ item, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paragraphs, setParagraphs] = useState<ParagraphPreview[]>([]);
  const [outputPath, setOutputPath] = useState("");

  useEffect(() => {
    if (!item) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const op = item.latestOutputPath;
        if (!op) { setLoading(false); return; }
        // Derive manifest path from output path (round1.txt → round1_manifest.json)
        const mp = op.replace(/\.\w+$/, "_manifest.json");
        const preview = await api.readOutputPreview(op, mp);
        setParagraphs(preview.paragraphs);
        setOutputPath(op);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [item]);

  const handleExport = async (fmt: "txt" | "docx") => {
    if (!outputPath) return;
    try {
      await api.exportRound(outputPath, fmt);
    } catch (e) {
      setError(String(e));
    }
  };

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="mx-4 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-black/8 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.12)]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-notion-border px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-notion-text">{item.displayName}</h2>
            <p className="mt-0.5 text-xs text-notion-text-tertiary">
              已完成 {item.completedRounds.length} 轮 · {formatTime(item.lastTimestamp)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => handleExport("txt")} className="inline-flex items-center gap-1 rounded-lg border border-notion-border bg-white px-3 py-1.5 text-xs font-medium text-notion-text-secondary transition-colors hover:bg-notion-sidebar">
              <Download size={11} /> TXT
            </button>
            <button onClick={() => handleExport("docx")} className="inline-flex items-center gap-1 rounded-lg bg-notion-text px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80">
              <Download size={11} /> Word
            </button>
            <button onClick={onClose} className="ml-1 rounded-lg p-1 text-notion-text-tertiary hover:bg-notion-sidebar hover:text-notion-text">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto notion-scrollbar px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-notion-text-tertiary" />
            </div>
          ) : error ? (
            <p className="text-sm text-notion-red">{error}</p>
          ) : paragraphs.length === 0 ? (
            <p className="py-8 text-center text-sm text-notion-text-tertiary">暂无处理结果</p>
          ) : (
            <div className="space-y-4">
              {paragraphs.map((p) => (
                <div key={p.paragraphIndex} className="rounded-xl border border-notion-border bg-notion-sidebar/30 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-md bg-zhipu-50 px-2 py-0.5 text-xs font-medium text-zhipu-600">
                      第 {p.paragraphIndex + 1} 段
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-notion-border bg-white p-3">
                      <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-notion-text-tertiary">原文</div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-notion-text">{p.originalText || "（空）"}</p>
                    </div>
                    <div className="rounded-lg border border-zhipu-200 bg-zhipu-50/30 p-3">
                      <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-zhipu-600">改写后</div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-notion-text">{p.text || "（空）"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
