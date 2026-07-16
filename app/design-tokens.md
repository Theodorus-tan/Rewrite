# baibaiAIGC · 设计规范

> 继承智谱知研 (vibe-research) 的 Notion 骨架 + Zhipu 白紫黑品牌色
> Tailwind v4 CSS 驱动配置，定义在 `src/styles/global.css` 的 `@theme` 中

---

## 色彩

### Notion 骨架（中性色）

| Token | 色值 | 用途 |
|-------|------|------|
| `bg` | `#ffffff` | 卡片 / 面板背景 |
| `sidebar` | `#f7f7f5` | 侧栏 / 次级背景 |
| `border` | `#e8e8e5` | 边框 |
| `text` | `#37352f` | 正文 |
| `text-secondary` | `#6b6b6b` | 次级文字说明 |
| `text-tertiary` | `#9b9a97` | 辅助文字/占位符 |

### Zhipu 紫色（品牌色）

| Token | 色值 | 用途 |
|-------|------|------|
| `zhipu-50` | `#f6f1ff` | 紫底背景 |
| `zhipu-100` | `#ede6ff` | 浅紫 |
| `zhipu-200` | `#d9cef9` | 紫边框 |
| `zhipu-400` | `#9b7fd4` | 紫文字/装饰 |
| `zhipu-600` | `#5c4d95` | 主要紫（品牌主色） |
| `zhipu-800` | `#2e245f` | 深紫标题/强调 |

### 功能色

| Token | 色值 | 用途 |
|-------|------|------|
| `accent` (蓝) | `#2eaadc` | 链接/选中态 |
| `green` | `#0f7b0f` | 成功 |
| `red` | `#eb5757` | 错误/危险 |
| `orange` | `#fa8c16` | 警告 |
| `page-bg` | `#f6f7fb` | 页面底色 |

---

## 间距 & 圆角

| 圆角 | 值 | 场景 |
|------|----|------|
| `rounded-lg` | 8px | 按钮/输入框 |
| `rounded-xl` | 12px | 普通卡片 |
| `rounded-2xl` | 16px | 大卡片 |
| `rounded-[24px]` | 24px | 主面板 |
| `rounded-[28px]` | 28px | 大区块 |

| 阴影 | 值 |
|------|-----|
| `shadow-notion` | `0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03)` |
| `shadow-notion-hover` | `0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.03)` |
| `shadow-notion-modal` | `0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)` |

---

## 字体

- `font-sans`: `-apple-system, BlinkMacSystemFont, "Segoe UI Variable", system-ui, ..., "PingFang SC", "Microsoft YaHei"`
- `font-mono`: `"SF Mono", "Cascadia Code", "JetBrains Mono", "Fira Code"`
- 字号: 12(xs) → 13 → 14(sm/base) → 15 → 16 → 18 → 22 → 42
- 字重: medium(500) → semibold(600) → bold(700)

---

## 组件规范

### 按钮
```
主按钮: bg-notion-text text-white rounded-lg px-4 py-2 text-sm font-medium
        hover:opacity-80 disabled:opacity-50
次按钮: border border-notion-border text-notion-text-secondary bg-white
        rounded-lg px-3 py-1.5 text-sm hover:bg-notion-sidebar
危险按钮: 次按钮 + text-notion-red border-notion-red/30 bg-red-50
```

### 输入框
```
border border-notion-border bg-white rounded-lg px-3 py-2.5 text-sm text-notion-text
focus:border-blue-300 focus:ring-2 focus:ring-blue-100 outline-none
placeholder:text-notion-text-tertiary
```

### 卡片
```
rounded-xl border border-black/5 bg-white p-5 shadow-notion
```

### 面板
```
rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]
```

---

## 动效

```
fade-in-up (0.3s ease-out):  入口动效
fade-in    (0.2s ease-out):  淡入
scale-in   (0.2s ease-out):  弹窗
hover      (0.18s ease):     按钮/卡片悬浮
```
