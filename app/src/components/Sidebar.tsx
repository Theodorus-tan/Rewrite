import { Clock, FileText, Settings } from "lucide-react";
import zaiLogo from "../assets/zai-logo.svg";

export type HistoryItem = {
  docId: string;
  sourcePath: string;
  displayName: string;
  completedRounds: number[];
  lastTimestamp: string;
  latestOutputPath: string;
};

type Props = {
  activeTab: "config" | "history";
  onTabChange: (tab: "config" | "history") => void;
  historyItems: Array<HistoryItem>;
  onSelectHistory: (item: HistoryItem) => void;
  onDeleteHistory: (docId: string) => void;
  busy: boolean;
  children: React.ReactNode;
};

function formatTime(ts: string): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return ts;
  }
}

export function Sidebar({ activeTab, onTabChange, historyItems, onSelectHistory, onDeleteHistory, busy, children }: Props) {
  return (
    <aside className="flex w-[260px] flex-shrink-0 flex-col border-r border-black/5 bg-page-bg">
      {/* App identity */}
      <div className="border-b border-black/5 px-5 py-4">
        <div className="flex flex-col items-start gap-1">
          <img src={zaiLogo} alt="智谱" className="h-7 w-auto" />
          <span className="pl-[22px] text-[9px] font-semibold uppercase tracking-[0.34em] text-black/32">
            Rewriter
          </span>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex gap-2 border-b border-black/5 px-3 py-3">
        <button
          onClick={() => onTabChange("config")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "config"
              ? "bg-white text-[#090b10] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
              : "text-notion-text-secondary hover:bg-white hover:text-notion-text"
          }`}
        >
          <Settings size={13} />
          配置
        </button>
        <button
          onClick={() => onTabChange("history")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "history"
              ? "bg-white text-[#090b10] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
              : "text-notion-text-secondary hover:bg-white hover:text-notion-text"
          }`}
        >
          <Clock size={13} />
          历史
          {historyItems.length > 0 && (
            <span className="ml-0.5 rounded-full bg-zhipu-50 px-1.5 py-0.5 text-[10px] text-zhipu-600">
              {historyItems.length}
            </span>
          )}
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto notion-scrollbar">
        {activeTab === "config" ? (
          children
        ) : (
          <div className="p-3">
            {historyItems.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-black/12 bg-[#fafbfc] px-4 py-10 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <FileText size={18} strokeWidth={1.4} className="text-notion-text-tertiary" />
                </div>
                <p className="mt-3 text-sm font-medium text-notion-text">还没有处理记录</p>
                <p className="mt-1 text-xs text-notion-text-tertiary">上传文档并完成一次改写后，这里会保留你的工作记录</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {historyItems.map((item) => (
                  <div key={item.docId} className="group relative">
                    <button
                      onClick={() => onSelectHistory(item)}
                      disabled={busy}
                      className="flex w-full flex-col gap-1 rounded-2xl border border-transparent px-3 py-3 text-left transition-colors hover:border-black/6 hover:bg-white disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-notion-text">
                          {item.displayName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-notion-text-tertiary">
                        <span>已完成 {item.completedRounds.length} 轮</span>
                        {item.lastTimestamp && <span>· {formatTime(item.lastTimestamp)}</span>}
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteHistory(item.docId); }}
                      className="absolute right-2 top-2 hidden rounded-md px-1.5 py-0.5 text-xs text-notion-red opacity-60 transition-opacity hover:opacity-100 group-hover:block"
                      title="删除此记录"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
