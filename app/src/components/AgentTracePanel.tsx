import { CheckCircle2, ChevronDown, ChevronRight, Loader2, Search, FileText, Edit3, Star, AlertCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import type { AgentStepEvent } from "../types/app";

type Props = {
  events: AgentStepEvent[];
  running: boolean;
};

const STEP_META: Record<string, { icon: typeof Loader2; label: string; color: string }> = {
  analyze: { icon: FileText, label: "分析文档", color: "text-zhipu-600" },
  search: { icon: Search, label: "搜索策略", color: "text-blue-600" },
  rewrite: { icon: Edit3, label: "改写", color: "text-orange-600" },
  evaluate: { icon: Star, label: "自评质量", color: "text-green-600" },
  decide: { icon: CheckCircle2, label: "决策", color: "text-notion-text" },
};

function StepIcon({ step, status }: { step: string; status?: string }) {
  const meta = STEP_META[step];
  const Icon = meta?.icon || Loader2;
  const color = meta?.color || "text-notion-text-tertiary";

  if (status === "running") return <Loader2 size={14} className={`animate-spin ${color}`} />;
  if (status === "done") return <CheckCircle2 size={14} className="text-green-600" />;
  if (status === "error") return <AlertCircle size={14} className="text-red-500" />;
  return <Icon size={14} className={color} />;
}

export function AgentTracePanel({ events, running }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const wrapClass = "min-w-0 break-words [overflow-wrap:anywhere]";

  const thoughts = events.filter((ev) => ev.phase === "agent-thought" && ev.content);

  // Group events by step
  const stepGroups: Record<string, AgentStepEvent[]> = {};
  for (const ev of events) {
    if (ev.phase !== "agent-step") continue;
    const step = ev.step || "unknown";
    if (!stepGroups[step]) stepGroups[step] = [];
    stepGroups[step].push(ev);
  }

  const stepOrder = ["analyze", "search", "rewrite", "evaluate", "decide"];
  const visibleSteps = stepOrder.filter(s => stepGroups[s]?.length > 0 || (running && s === stepOrder[stepOrder.indexOf(s)]));

  if (!visibleSteps.length && !running) return null;

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-notion-border bg-white p-4 shadow-notion">
      <div className="mb-3 flex items-center gap-2">
        {running && <Loader2 size={13} className="animate-spin text-zhipu-600" />}
        <span className="text-xs font-semibold text-notion-text">Agent 思考流</span>
        {running && <span className="text-2xs text-notion-text-tertiary">运行中</span>}
      </div>

      {thoughts.length > 0 && (
        <div className="mb-4 space-y-2 rounded-2xl border border-black/5 bg-[#fafbff] p-3">
          {thoughts.map((thought, index) => {
            const meta = STEP_META[thought.step || ""] || { icon: Sparkles, label: "思考", color: "text-zhipu-600" };
            const Icon = meta.icon;
            return (
              <div key={`${thought.step || "thought"}-${index}`} className="flex min-w-0 items-start gap-2.5">
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08)]">
                  <Icon size={12} className={meta.color} />
                </div>
                <div className="min-w-0 flex-1 rounded-2xl bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="mb-1 flex min-w-0 items-center gap-2">
                    <span className={`text-2xs font-medium text-notion-text ${wrapClass}`}>{meta.label}</span>
                    {thought.thoughtType && (
                      <span className="rounded-full bg-notion-sidebar px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-notion-text-tertiary">
                        {thought.thoughtType}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs leading-6 text-notion-text ${wrapClass}`}>{thought.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-1.5">
        {stepOrder.map((step) => {
          const group = stepGroups[step];
          if (!group) return null;
          const last = group[group.length - 1];
          const meta = STEP_META[step];
          const isOpen = expanded[step];

          return (
            <div key={step}>
              <button
                onClick={() => setExpanded({ ...expanded, [step]: !isOpen })}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-notion-sidebar"
              >
                <StepIcon step={step} status={last.status} />
                <span className={`flex-1 text-xs font-medium text-notion-text ${wrapClass}`}>{meta?.label || step}</span>
                {last.status === "done" && last.details && (
                  <span className={`min-w-0 text-2xs text-notion-text-tertiary ${wrapClass}`}>{last.message}</span>
                )}
                {last.status === "running" && (
                  <span className={`min-w-0 text-2xs text-zhipu-600 ${wrapClass}`}>{last.message}</span>
                )}
                {last.details && (isOpen ? <ChevronDown size={12} className="text-notion-text-tertiary" /> : <ChevronRight size={12} className="text-notion-text-tertiary" />)}
              </button>

              {isOpen && last.details && (
                <div className="ml-6 min-w-0 space-y-1.5 pb-1.5">
                  {(() => {
                    const d = last.details as Record<string, unknown>;
                    const queries = d.queries as string[] | undefined;
                    const results = d.results as Array<{title: string; body: string}> | undefined;
                    const summary = d.summary as string | undefined;
                    const failures = d.failures as Array<{query: string; reason: string}> | undefined;
                    const domain = d.domain as string | undefined;
                    const style = d.style as string | undefined;
                    const score = d.score as number | undefined;
                    const weakness = d.weakness as string | undefined;
                    const suggestions = d.suggestions as string[] | undefined;
                    return (<>
                    {queries && (
                      <div className="min-w-0 rounded-lg bg-notion-sidebar/50 px-2.5 py-2">
                        <p className="text-2xs font-medium text-notion-text-tertiary mb-1">搜索词</p>
                        {queries.map((q, i) => <p key={i} className={`text-xs text-notion-text ${wrapClass}`}>🔍 {q}</p>)}
                      </div>
                    )}
                    {results && results.length > 0 && (
                      <div className="min-w-0 rounded-lg bg-blue-50/40 px-2.5 py-2">
                        <p className="text-2xs font-medium text-notion-text-tertiary mb-1">搜索结果</p>
                        {results.slice(0, 3).map((r, i) => <p key={i} className={`mb-1 text-xs leading-5 text-notion-text ${wrapClass}`}>• {r.title}: {r.body?.slice(0, 100)}</p>)}
                      </div>
                    )}
                    {summary && (
                      <div className="min-w-0 rounded-lg bg-indigo-50/40 px-2.5 py-2">
                        <p className="mb-1 text-2xs font-medium text-notion-text-tertiary">策略摘要</p>
                        <p className={`text-xs leading-5 text-notion-text ${wrapClass}`}>{summary}</p>
                      </div>
                    )}
                    {failures && failures.length > 0 && (
                      <div className="min-w-0 rounded-lg bg-red-50/50 px-2.5 py-2">
                        <p className="mb-1 text-2xs font-medium text-notion-text-tertiary">失败与降级</p>
                        {failures.map((item, i) => (
                          <p key={i} className={`text-xs leading-5 text-notion-text ${wrapClass}`}>• {item.query}: {item.reason}</p>
                        ))}
                      </div>
                    )}
                    {(domain || style) && (
                      <div className="rounded-lg bg-zhipu-50/40 px-2.5 py-2">
                        <p className="text-xs text-notion-text">
                          <span className="font-medium">领域:</span> {domain}
                          <span className="ml-3 font-medium">风格:</span> {style}
                      </p>
                    </div>
                  )}
                  {score !== undefined && (
                      <div className="rounded-lg bg-green-50/40 px-2.5 py-2">
                        <p className="text-xs text-notion-text">
                          自评得分: <span className="font-bold text-green-700">{score}/10</span>
                          {weakness && <span className="ml-2 text-notion-text-secondary">· {weakness}</span>}
                        </p>
                      </div>
                    )}
                    {suggestions && suggestions.length > 0 && (
                      <div className="rounded-lg bg-notion-sidebar/50 px-2.5 py-2">
                        {suggestions.map((s, i) => <p key={i} className="text-xs text-notion-text">💡 {s}</p>)}
                      </div>
                    )}
                    </>);
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
