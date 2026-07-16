import { useEffect, useRef, useState } from "react";
import { Loader2, PenLine, X, Zap } from "lucide-react";
import type { RoundProgress } from "../types/app";

const WINDOW_STATE_KEY = "zhipu-cleartrace-quick-paste-window";
const WINDOW_TEXT_KEY = "zhipu-cleartrace-quick-paste-text";
const MIN_WIDTH = 360;
const MIN_HEIGHT = 280;

type WindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onProcess: (text: string) => Promise<void> | void;
  progress: RoundProgress | null;
  execBusy: boolean;
};

function defaultFrame(): WindowFrame {
  if (typeof window === "undefined") {
    return { x: 880, y: 120, width: 440, height: 520 };
  }
  return {
    width: 440,
    height: 520,
    x: Math.max(220, window.innerWidth - 476),
    y: 96,
  };
}

function loadFrame(): WindowFrame {
  if (typeof window === "undefined") return defaultFrame();
  try {
    const raw = window.localStorage.getItem(WINDOW_STATE_KEY);
    if (!raw) return defaultFrame();
    const parsed = JSON.parse(raw) as Partial<WindowFrame>;
    return {
      x: Number.isFinite(parsed.x) ? Number(parsed.x) : defaultFrame().x,
      y: Number.isFinite(parsed.y) ? Number(parsed.y) : defaultFrame().y,
      width: Number.isFinite(parsed.width) ? Math.max(MIN_WIDTH, Number(parsed.width)) : defaultFrame().width,
      height: Number.isFinite(parsed.height) ? Math.max(MIN_HEIGHT, Number(parsed.height)) : defaultFrame().height,
    };
  } catch {
    return defaultFrame();
  }
}

function loadDraftText(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(WINDOW_TEXT_KEY) || "";
}

function clampFrame(frame: WindowFrame): WindowFrame {
  if (typeof window === "undefined") return frame;
  const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - 24);
  const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - 24);
  const width = Math.min(Math.max(frame.width, MIN_WIDTH), maxWidth);
  const height = Math.min(Math.max(frame.height, MIN_HEIGHT), maxHeight);
  const x = Math.min(Math.max(frame.x, 12), Math.max(12, window.innerWidth - width - 12));
  const y = Math.min(Math.max(frame.y, 12), Math.max(12, window.innerHeight - height - 12));
  return { x, y, width, height };
}

export function QuickPasteModal({ open, onClose, onProcess, progress, execBusy }: Props) {
  const [text, setText] = useState(loadDraftText);
  const [frame, setFrame] = useState<WindowFrame>(loadFrame);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const frameRef = useRef(frame);
  const isRunning = execBusy;

  useEffect(() => {
    frameRef.current = frame;
    window.localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify(frame));
  }, [frame]);

  useEffect(() => {
    window.localStorage.setItem(WINDOW_TEXT_KEY, text);
  }, [text]);

  useEffect(() => {
    const handleResize = () => setFrame((prev) => clampFrame(prev));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (open) {
      setFrame((prev) => clampFrame(prev));
      window.setTimeout(() => textareaRef.current?.focus(), 60);
    }
  }, [open]);

  const beginMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = frameRef.current;

    const onMove = (moveEvent: MouseEvent) => {
      setFrame(clampFrame({
        ...start,
        x: start.x + (moveEvent.clientX - startX),
        y: start.y + (moveEvent.clientY - startY),
      }));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const beginResize = (direction: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw") => (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = frameRef.current;

    const onMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      let next = { ...start };

      if (direction.includes("e")) next.width = start.width + dx;
      if (direction.includes("s")) next.height = start.height + dy;
      if (direction.includes("w")) {
        next.width = start.width - dx;
        next.x = start.x + dx;
      }
      if (direction.includes("n")) {
        next.height = start.height - dy;
        next.y = start.y + dy;
      }

      const clampedWidth = Math.max(MIN_WIDTH, next.width);
      const clampedHeight = Math.max(MIN_HEIGHT, next.height);
      if (direction.includes("w")) next.x -= clampedWidth - next.width;
      if (direction.includes("n")) next.y -= clampedHeight - next.height;
      next.width = clampedWidth;
      next.height = clampedHeight;

      setFrame(clampFrame(next));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || execBusy) return;
    onProcess(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  const progressLabel = () => {
    if (!progress) return "";
    if (progress.phase === "agent-thought") return progress.message || "Agent 正在思考…";
    if (progress.phase === "agent-step") return progress.message || "Agent 正在处理…";
    if (progress.phase === "segmenting") return "GLM 语义分段中…";
    if (progress.phase === "processing-chunk") {
      return `GLM 改写中 ${progress.currentChunk}/${progress.totalChunks}`;
    }
    if (progress.phase === "chunk-complete") {
      return `已完成 ${progress.completedChunks}/${progress.totalChunks} 块`;
    }
    return "";
  };

  if (!open) return null;

  return (
    <div
      className="fixed z-40 overflow-hidden rounded-[28px] border border-black/8 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.14)]"
      style={{
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height,
      }}
    >
      <div onMouseDown={beginMove} className="flex cursor-move items-start justify-between gap-3 border-b border-black/6 px-5 py-4 select-none">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0f172a]">
            <PenLine size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-notion-text">快速粘贴</h2>
            <p className="mt-0.5 text-xs text-notion-text-tertiary">可拖动、可伸缩，关闭后后台仍继续处理</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-notion-text-tertiary transition-colors hover:bg-notion-sidebar hover:text-notion-text"
          title="关闭窗口"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex h-[calc(100%-76px)] flex-col gap-4 overflow-hidden px-5 py-4">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="将需要改写的文字粘贴到这里…"
          rows={8}
          disabled={isRunning}
          className="min-h-[148px] w-full flex-none resize-none rounded-2xl border border-notion-border bg-notion-sidebar/30 px-4 py-3 text-sm text-notion-text placeholder:text-notion-text-tertiary outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:opacity-70"
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-notion-text-tertiary">{isRunning ? progressLabel() || "正在处理…" : "按 ⌘+Enter 快速执行"}</p>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || isRunning}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b0d12] px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#171a22] hover:shadow-lg disabled:opacity-50"
          >
            {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {isRunning ? "处理中" : "开始处理"}
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 notion-scrollbar">
          {progress?.phase === "agent-thought" && progress?.message && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-3 py-2.5">
              <p className="text-2xs font-medium text-blue-600">Agent 正在思考</p>
              <p className="mt-1 text-xs leading-6 text-notion-text">{progress.message}</p>
            </div>
          )}

          {progress?.phase === "stream-token" && progress?.streamText && (
            <div className="rounded-xl border border-zhipu-200 bg-white px-3 py-2.5">
              <p className="text-2xs font-medium text-zhipu-600">GLM 正在生成</p>
              <p className="mt-1 text-xs leading-6 text-notion-text">{progress.streamText}<span className="ml-0.5 animate-pulse text-zhipu-400">▌</span></p>
            </div>
          )}

          {progress?.inputPreview && progress.phase !== "stream-token" && (
            <div className="rounded-xl border border-zhipu-100 bg-zhipu-50/40 px-3 py-2">
              <p className="text-2xs font-medium text-zhipu-600">当前输入</p>
              <p className="mt-0.5 text-xs leading-5 text-notion-text [overflow-wrap:anywhere]">{progress.inputPreview}</p>
            </div>
          )}

          {!progress && (
            <div className="rounded-xl border border-black/6 bg-[#fafbfc] px-3 py-2.5">
              <p className="text-xs leading-6 text-notion-text-tertiary">窗口状态和草稿会自动保存。你可以拖到任意位置，缩放到合适大小。</p>
            </div>
          )}
        </div>
      </div>

      <div onMouseDown={beginResize("n")} className="absolute inset-x-3 top-0 h-2 cursor-ns-resize" />
      <div onMouseDown={beginResize("s")} className="absolute inset-x-3 bottom-0 h-2 cursor-ns-resize" />
      <div onMouseDown={beginResize("w")} className="absolute inset-y-3 left-0 w-2 cursor-ew-resize" />
      <div onMouseDown={beginResize("e")} className="absolute inset-y-3 right-0 w-2 cursor-ew-resize" />
      <div onMouseDown={beginResize("nw")} className="absolute left-0 top-0 h-4 w-4 cursor-nwse-resize" />
      <div onMouseDown={beginResize("ne")} className="absolute right-0 top-0 h-4 w-4 cursor-nesw-resize" />
      <div onMouseDown={beginResize("sw")} className="absolute bottom-0 left-0 h-4 w-4 cursor-nesw-resize" />
      <div onMouseDown={beginResize("se")} className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize" />
    </div>
  );
}
