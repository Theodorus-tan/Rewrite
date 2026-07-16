import { AlertCircle, CheckCircle2, PenLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentTracePanel } from "./components/AgentTracePanel";
import { ConfigPanel } from "./components/ConfigPanel";
import { DocumentPanel } from "./components/DocumentPanel";
import { HistoryViewModal } from "./components/HistoryViewModal";
import { QuickPasteModal } from "./components/QuickPasteModal";
import { ResultPage } from "./components/ResultPage";
import { Sidebar } from "./components/Sidebar";
import { useProcessing } from "./hooks/useProcessing";
import * as api from "./lib/api";
import type { AgentStepEvent, RoundProgress } from "./types/app";
import type { HistoryDocItem } from "./hooks/useProcessing";

const QUICK_PASTE_OPEN_KEY = "zhipu-cleartrace-quick-paste-open";

function loadQuickPasteOpen(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(QUICK_PASTE_OPEN_KEY) === "1";
}

function runAgentStream(runId: string, onEvent: (e: AgentStepEvent) => void, onResult: (d: any) => void, onError: (e: string) => void): () => void {
  const es = new EventSource(`/api/run-round-events/${runId}`);
  es.addEventListener("progress", (event) => {
    try { onEvent(JSON.parse(event.data) as AgentStepEvent); } catch {}
  });
  es.addEventListener("result", (event) => {
    try { onResult(JSON.parse(event.data)); es.close(); } catch {}
  });
  es.addEventListener("error", (event) => {
    try {
      const msg = JSON.parse((event as MessageEvent).data) as { message?: string };
      onError(msg.message || "处理失败");
    } catch { onError("处理失败"); }
    es.close();
  });
  es.onerror = () => { onError("连接断开"); es.close(); };
  return () => es.close();
}

export function App() {
  const p = useProcessing();
  const [sidebarTab, setSidebarTab] = useState<"config" | "history">("config");
  const [activeView, setActiveView] = useState<"workspace" | "result">("workspace");
  const [quickPasteOpen, setQuickPasteOpen] = useState(loadQuickPasteOpen);
  const [historyViewItem, setHistoryViewItem] = useState<HistoryDocItem | null>(null);
  const typingRef = useRef<HTMLSpanElement | null>(null);
  const [typingWidth, setTypingWidth] = useState(0);
  const [agentMode, setAgentMode] = useState<"document" | "quick" | null>(null);

  useEffect(() => {
    const updateTypingWidth = () => {
      if (!typingRef.current) return;
      setTypingWidth(typingRef.current.scrollWidth);
    };
    updateTypingWidth();
    window.addEventListener("resize", updateTypingWidth);
    return () => window.removeEventListener("resize", updateTypingWidth);
  }, []);
  const [agentEvents, setAgentEvents] = useState<AgentStepEvent[]>([]);
  const [quickProgress, setQuickProgress] = useState<RoundProgress | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);
  const isDocumentAgentRunning = agentRunning && agentMode === "document";
  const isQuickAgentRunning = agentRunning && agentMode === "quick";

  const handleSelectHistory = (item: HistoryDocItem) => setHistoryViewItem(item);

  // Cleanup event source on unmount
  useEffect(() => () => unlistenRef.current?.(), []);

  useEffect(() => {
    window.localStorage.setItem(QUICK_PASTE_OPEN_KEY, quickPasteOpen ? "1" : "0");
  }, [quickPasteOpen]);

  const startAgentFlow = useCallback(async (runId: string, mode: "document" | "quick") => {
    setAgentMode(mode);
    setAgentRunning(true);
    p.setResultText("");
    p.setResultParagraphs([]);
    p.setError("");
    if (mode === "document") {
      setAgentEvents([]);
      setQuickProgress(null);
    } else {
      setQuickProgress(null);
    }

    return new Promise<void>((resolve, reject) => {
      unlistenRef.current = runAgentStream(
        runId,
        (e) => {
          if (mode === "document" && (e.phase === "agent-step" || e.phase === "agent-thought")) {
            setAgentEvents((prev) => [...prev, e]);
          }
          const nextProgress: RoundProgress = {
            phase: e.phase || "agent",
            round: 1,
            step: e.step,
            message: e.message || e.content,
            details: e.details,
            inputPreview: e.original_text,
            outputPreview: e.rewritten_text,
            streamText: e.streamText,
          };
          if (mode === "quick") {
            setQuickProgress(nextProgress);
          }
        },
        (data) => {
          const paragraphs = data.paragraphs || [];
          p.setResultText(data.text || "");
          p.setResultParagraphs(paragraphs);
          p.setResultOutputPath(data.outputPath || "");
          p.setResultManifestPath(data.manifestPath || "");
          p.setResultViewToken((v) => v + 1);
          if (mode === "quick") {
            setQuickProgress(null);
          }
          setAgentRunning(false);
          setAgentMode(null);
          unlistenRef.current = null;
          resolve();
        },
        (err) => {
          if (mode === "quick") {
            setQuickProgress(null);
          }
          setAgentRunning(false);
          setAgentMode(null);
          unlistenRef.current = null;
          reject(new Error(err));
        },
      );
    });
  }, [p]);

  const handleRunRound = useCallback(async () => {
    if (!p.doc) { p.setError("请先导入文档"); return; }
    if (!p.config.apiKey || !p.config.baseUrl || !p.config.model) {
      p.setError("请先填写模型配置"); return;
    }
    try {
      p.setExecBusy(true);
      const runId = await api.agentFileProcess(p.doc.sourcePath, p.config);
      await startAgentFlow(runId, "document");
      await p.refreshDocumentStatus(p.doc.sourcePath);
      await p.refreshHistory();
      p.setNotice("✅ 处理完成");
      setActiveView("result");
    } catch (e) {
      p.setError(String(e));
    } finally {
      p.setExecBusy(false);
    }
  }, [p, startAgentFlow]);

  const handleAgentProcess = useCallback(async (text: string) => {
    if (!p.config.apiKey || !p.config.baseUrl || !p.config.model) {
      p.setError("请先填写模型配置"); return;
    }
    try {
      const runId = await api.agentProcess(text, p.config);
      await startAgentFlow(runId, "quick");
      await p.refreshHistory();
      p.setNotice("✅ 处理完成");
      setActiveView("result");
    } catch (e) {
      p.setError(String(e));
    }
  }, [p, startAgentFlow]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-page-bg">
      <header className="flex h-[62px] flex-shrink-0 items-center justify-end border-b border-black/5 bg-page-bg/96 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          {p.error && (
            <div className="flex animate-fade-in items-center gap-1.5 rounded-lg border border-notion-red/20 bg-red-50 px-3 py-1.5 text-xs text-notion-red">
              <AlertCircle size={12} />
              <span>{p.error}</span>
              <button onClick={p.clearError} className="ml-1 opacity-60 hover:opacity-100">×</button>
            </div>
          )}
          {p.notice && (
            <div className="flex animate-fade-in items-center gap-1.5 rounded-lg border border-notion-green/20 bg-green-50 px-3 py-1.5 text-xs text-notion-green">
              <CheckCircle2 size={12} />
              <span>{p.notice}</span>
              <button onClick={p.clearNotice} className="ml-1 opacity-60 hover:opacity-100">×</button>
            </div>
          )}
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-2xs font-medium ${
            p.execBusy || agentRunning ? "bg-white text-[#090b10] shadow-[0_1px_2px_rgba(15,23,42,0.06)]" : "bg-green-50 text-notion-green"
          }`}>
            {p.execBusy || agentRunning ? "运行中" : "待命"}
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          historyItems={p.historyItems}
          onSelectHistory={handleSelectHistory}
          onDeleteHistory={p.deleteHistory}
          busy={p.execBusy || agentRunning}
        >
          <ConfigPanel
            value={p.config}
            testResult={p.testResult}
            testBusy={p.testBusy}
            onChange={p.setConfig}
            onTest={p.testConnection}
          />
        </Sidebar>

        {activeView === "workspace" ? (
          <main className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 notion-scrollbar">
            <section className="relative min-h-[196px] overflow-hidden rounded-[28px] border border-black/6 bg-[#f4f5fb] shadow-[0_16px_36px_rgba(15,23,42,0.04)] md:min-h-[212px]">
              <div className="pointer-events-none absolute inset-0">
                <div className="hero-orb hero-orb-a" />
                <div className="hero-orb hero-orb-b" />
                <div className="hero-grid-mask" />
              </div>
              <div className="relative flex h-full items-center px-6 py-7 md:px-8 md:py-8">
                <div className="max-w-[920px]">
                  <h1 className="hero-display max-w-[18ch] text-[#0f172a]">
                    See the rewrite before you trust it
                  </h1>
                  <p className="mt-4 min-h-[28px] md:min-h-[30px]">
                    <span
                      ref={typingRef}
                      className="hero-accent hero-typing"
                      style={{ "--hero-typing-width": `${typingWidth}px`, "--hero-typing-steps": 43 } as React.CSSProperties}
                    >
                      review, compare, and export with confidence
                    </span>
                  </p>
                </div>
              </div>
            </section>

            <DocumentPanel
              doc={p.doc}
              selectedFile={p.selectedFile}
              uploadBusy={p.uploadBusy}
              execBusy={p.execBusy || isDocumentAgentRunning}
              onPickFile={p.pickFile}
              onRun={handleRunRound}
              onStop={() => {}}
              hasResult={p.resultParagraphs.length > 0}
              onOpenResult={() => setActiveView("result")}
            />

            {((isDocumentAgentRunning || agentEvents.length > 0) && agentMode !== "quick") && (
              <AgentTracePanel events={agentEvents} running={isDocumentAgentRunning} />
            )}
          </main>
        ) : (
          <ResultPage
            doc={p.doc}
            paragraphs={p.resultParagraphs}
            exportBusy={p.exportBusy}
            onExportTxt={() => p.doExport("txt")}
            onExportDocx={() => p.doExport("docx")}
            onBack={() => setActiveView("workspace")}
          />
        )}
      </div>

      <QuickPasteModal
        open={quickPasteOpen}
        onClose={() => setQuickPasteOpen(false)}
        onProcess={handleAgentProcess}
        progress={quickProgress}
        execBusy={isQuickAgentRunning}
      />

      <HistoryViewModal item={historyViewItem} onClose={() => setHistoryViewItem(null)} />

      <button
        onClick={() => setQuickPasteOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-2xl bg-zhipu-800 text-white shadow-[0_8px_24px_rgba(46,36,95,0.35)] transition-all hover:scale-105 hover:shadow-[0_12px_32px_rgba(46,36,95,0.4)] active:scale-95 disabled:opacity-50"
        title="快速去AI味"
      >
        <PenLine size={18} />
      </button>
    </div>
  );
}
