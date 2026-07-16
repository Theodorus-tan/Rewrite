import { ArrowLeft, FileText, History } from "lucide-react";
import type { DocumentStatus, ParagraphPreview } from "../types/app";
import { PreviewPanel } from "./PreviewPanel";

type Props = {
  doc: DocumentStatus | null;
  paragraphs: ParagraphPreview[];
  exportBusy: boolean;
  onExportTxt: () => void;
  onExportDocx: () => void;
  onBack: () => void;
};

export function ResultPage({ doc, paragraphs, exportBusy, onExportTxt, onExportDocx, onBack }: Props) {
  const roundLabel = doc?.completedRounds.length
    ? `第 ${doc.completedRounds[doc.completedRounds.length - 1]} 轮结果`
    : "处理结果";

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 notion-scrollbar">
      <section className="rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              onClick={onBack}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-black/8 bg-[#fafbfc] text-notion-text-secondary transition-colors hover:border-black/12 hover:text-notion-text"
              title="返回工作台"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-notion-text-tertiary">Result View</p>
              <h2 className="mt-1 text-xl font-semibold text-notion-text">{doc?.displayName || "改写结果"}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-notion-text-tertiary">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#f4f5fb] px-2.5 py-1 text-notion-text-secondary">
                  <FileText size={12} />
                  {roundLabel}
                </span>
                {doc?.completedRounds.length ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-zhipu-50 px-2.5 py-1 text-zhipu-600">
                    <History size={12} />
                    已完成 {doc.completedRounds.length} 轮
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="max-w-[360px] text-right text-xs leading-5 text-notion-text-tertiary">
            结果页只负责查看、比对和导出。新的处理任务在工作台发起，历史记录也会直接打开这里。
          </div>
        </div>
      </section>

      <PreviewPanel
        paragraphs={paragraphs}
        exportBusy={exportBusy}
        onExportTxt={onExportTxt}
        onExportDocx={onExportDocx}
      />
    </div>
  );
}
