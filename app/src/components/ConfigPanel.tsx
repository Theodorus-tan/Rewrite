import { ChevronDown, Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import type { ModelConfig } from "../types/app";

const PRESET_MODELS = [
  { value: "glm-4.5-air", label: "glm-4.5-air", desc: "性价比优先，适合大多数文本改写" },
  { value: "glm-4.7", label: "glm-4.7", desc: "质量优先，适合高要求润色" },
] as const;

type Props = {
  value: ModelConfig;
  testResult: string;
  testBusy: boolean;
  onChange: (c: ModelConfig) => void;
  onTest: () => void;
};

export function ConfigPanel({ value, testResult, testBusy, onChange, onTest }: Props) {
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isPreset = PRESET_MODELS.some((m) => m.value === value.model);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-notion-text">任务设置</h2>
      </div>

      {/* API Key */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-notion-text-secondary">智谱 API Key</span>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={value.apiKey}
            onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
            placeholder="请输入智谱 API Key"
            className="w-full rounded-lg border border-notion-border bg-white px-3 py-2.5 pr-9 text-sm text-notion-text placeholder:text-notion-text-tertiary outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-notion-text-tertiary hover:text-notion-text"
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </label>

      {/* Model Selector */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-notion-text-secondary">改写模型</span>
        <div className="space-y-2">
          {PRESET_MODELS.map((m) => (
            <button
              key={m.value}
              onClick={() => onChange({ ...value, model: m.value })}
              className={`flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                value.model === m.value
                  ? "border-zhipu-300 bg-zhipu-50/60"
                  : "border-notion-border hover:bg-notion-sidebar"
              }`}
            >
              <span className="text-sm font-medium text-notion-text">{m.label}</span>
              <span className="text-xs text-notion-text-tertiary">{m.desc}</span>
            </button>
          ))}

          {/* Custom model trigger */}
          <button
            onClick={() => {
              if (isPreset) {
                onChange({ ...value, model: "" });
              }
            }}
            className={`flex w-full items-center gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
              !isPreset
                ? "border-zhipu-300 bg-zhipu-50/60"
                : "border-dashed border-notion-border text-notion-text-tertiary hover:bg-notion-sidebar hover:text-notion-text"
            }`}
          >
            <span className={`text-sm ${!isPreset ? "font-medium text-notion-text" : ""}`}>
              {!isPreset ? "自定义模型" : "自定义模型…"}
            </span>
          </button>

          {!isPreset && (
            <input
              value={value.model}
              onChange={(e) => onChange({ ...value, model: e.target.value })}
              placeholder="输入模型名称"
              className="w-full rounded-lg border border-notion-border bg-white px-3 py-2 font-mono text-sm text-notion-text placeholder:text-notion-text-tertiary outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          )}
        </div>
      </label>

      {/* Test connection */}
      {/* Advanced Settings */}
      <div className="border-t border-black/5 pt-1">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-xs font-medium text-notion-text-tertiary transition-colors hover:bg-notion-sidebar hover:text-notion-text-secondary"
        >
          <span>高级设置</span>
          <ChevronDown
            size={14}
            className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}
          />
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3">
            <button
              onClick={onTest}
              disabled={testBusy}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-zhipu-200 bg-zhipu-50/60 px-4 py-2 text-sm font-medium text-zhipu-600 transition-colors hover:bg-zhipu-100 disabled:opacity-50"
            >
              {testBusy && <Loader2 size={13} className="animate-spin" />}
              测试连通性
            </button>

            {testResult && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-notion-green">{testResult}</p>
            )}

            {/* Base URL */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-notion-text-secondary">Base URL</span>
              <input
                value={value.baseUrl}
                onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
                placeholder="https://open.bigmodel.cn/api/paas/v4"
                className="w-full rounded-lg border border-notion-border bg-white px-3 py-2.5 font-mono text-xs text-notion-text placeholder:text-notion-text-tertiary outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            {/* Temperature */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-notion-text-secondary">Temperature</span>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={value.temperature}
                onChange={(e) => onChange({ ...value, temperature: Number(e.target.value) })}
                className="w-full rounded-lg border border-notion-border bg-white px-3 py-2.5 text-sm text-notion-text outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
