import { FileText, Loader2, Square, Upload, Zap } from "lucide-react";
import type { DocumentStatus } from "../types/app";

type Props = {
  doc: DocumentStatus | null;
  selectedFile: string;
  uploadBusy: boolean;
  execBusy: boolean;
  onPickFile: () => void;
  onRun: () => void;
  onStop: () => void;
  hasResult: boolean;
  onOpenResult: () => void;
};

function sourceKindLabel(kind: string): string {
  if (kind === "docx") return "Word 文档";
  if (kind === "txt") return "文本文件";
  return kind || "文档";
}

export function DocumentPanel({ doc, selectedFile, uploadBusy, execBusy, onPickFile, onRun, onStop, hasResult, onOpenResult }: Props) {
  const hasDoc = !!doc;

  return (
    <section className="rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0f172a]">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-notion-text">文档工作台</h2>
            <p className="mt-0.5 text-xs text-notion-text-tertiary">上传 .txt 或 .docx 文档</p>
          </div>
        </div>
        <button
          onClick={onPickFile}
          disabled={uploadBusy || execBusy}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-[#0b0d12] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#171a22] hover:shadow-lg disabled:opacity-50"
        >
          {uploadBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploadBusy ? "上传中…" : "选择文档"}
        </button>
      </div>

      {!hasDoc && (
        <div onClick={onPickFile} className="mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-black/10 bg-[#fafbfc] py-12 text-sm text-notion-text-tertiary transition-colors hover:border-zhipu-200 hover:bg-zhipu-50">
          <Upload size={24} strokeWidth={1.2} />
          <span className="font-medium">点击上传文档</span>
          <span className="text-xs">.txt 或 .docx</span>
        </div>
      )}

      {hasDoc && (
        <div className="mt-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0f172a]">
              <FileText size={18} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-notion-text">{selectedFile || doc.displayName || doc.docId}</p>
              <p className="text-xs text-notion-text-tertiary">
                {sourceKindLabel(doc.sourceKind)} · {doc.completedRounds.length ? `已完成 ${doc.completedRounds.join("/")} 轮` : "未开始"}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onRun}
              disabled={execBusy || !doc.hasNextRound}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0b0d12] px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#171a22] hover:shadow-lg disabled:opacity-50"
            >
              {!execBusy && <Zap size={14} />}
              {execBusy ? "处理中" : "执行"}
            </button>
            <button
              onClick={onStop}
              disabled={!execBusy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-notion-text-secondary transition-colors hover:bg-[#fafbfc] disabled:opacity-50"
            >
              <Square size={14} />停止
            </button>
          </div>

          {hasResult && !execBusy && (
            <button onClick={onOpenResult} className="w-full rounded-xl border border-zhipu-200 bg-zhipu-50/40 px-4 py-3 text-xs font-medium text-zhipu-600 transition-colors hover:bg-zhipu-50">
              查看改写结果 →
            </button>
          )}
        </div>
      )}
    </section>
  );
}
