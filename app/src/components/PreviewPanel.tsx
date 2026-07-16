import { Download, Loader2 } from "lucide-react";
import type { ParagraphPreview } from "../types/app";

type Props = {
  paragraphs: ParagraphPreview[];
  exportBusy: boolean;
  onExportTxt: () => void;
  onExportDocx: () => void;
};

export function PreviewPanel({ paragraphs, exportBusy, onExportTxt, onExportDocx }: Props) {
  if (!paragraphs.length) {
    return (
      <section className="flex flex-col items-center justify-center gap-2 rounded-[28px] border border-black/6 bg-[#fafbfc] py-12 text-sm text-notion-text-tertiary shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <Download size={22} strokeWidth={1.4} />
        </div>
        <p className="mt-2 font-medium text-notion-text">等待处理结果</p>
        <p className="text-xs">处理完成后，结果会显示在这里</p>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-black/8 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/5 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-notion-text">原文 ↔ 改写对照</h2>
          <p className="mt-0.5 text-xs text-notion-text-tertiary">按段落检查改写结果，确认后导出 TXT 或 Word</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onExportTxt}
            disabled={exportBusy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-notion-text-secondary transition-colors hover:border-black/20 hover:bg-white hover:text-notion-text disabled:opacity-50"
          >
            {exportBusy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            导出 TXT
          </button>
          <button
            onClick={onExportDocx}
            disabled={exportBusy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0b0d12] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#171a22] hover:shadow-lg disabled:opacity-50"
          >
            {exportBusy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            导出 Word
          </button>
        </div>
      </div>

      {/* Segment comparison list */}
      <div className="notion-scrollbar max-h-[520px] space-y-3 overflow-y-auto px-6 py-4">
        {paragraphs.map((p) => (
          <div
            key={p.paragraphIndex}
            className="rounded-xl border border-notion-border bg-notion-sidebar/30 p-4"
          >
            {/* Segment header */}
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-md bg-zhipu-50 px-2 py-0.5 text-xs font-medium text-zhipu-600">
                第 {p.paragraphIndex + 1} 段
              </span>
              {p.chunkCount > 1 && (
                <span className="text-xs text-notion-text-tertiary">{p.chunkCount} 块</span>
              )}
            </div>

            {/* Side by side comparison */}
            <div className="grid grid-cols-2 gap-3">
              {/* Original */}
              <div className="rounded-lg border border-notion-border bg-white p-3">
                <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-notion-text-tertiary">
                  原文
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-notion-text">
                  {p.originalText || <span className="italic text-notion-text-tertiary">（空）</span>}
                </p>
              </div>

              {/* Rewritten */}
              <div className="rounded-lg border border-zhipu-200 bg-zhipu-50/30 p-3">
                <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-zhipu-600">
                  改写后
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-notion-text">
                  {p.text || <span className="italic text-notion-text-tertiary">（空）</span>}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
