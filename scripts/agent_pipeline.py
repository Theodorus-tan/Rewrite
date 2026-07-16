"""LangGraph agent for de-AI rewriting with search and self-evaluation."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any, Callable, TypedDict

from langgraph.graph import END, StateGraph
from duckduckgo_search import DDGS

from aigc_round_service import build_prompt_input, load_prompt, validate_chunk_output
from app_config import normalize_model_config
from llm_client import llm_completion, llm_completion_stream


# ── State ──

class AgentState(TypedDict):
    text: str                              # original text
    domain: str                            # detected domain
    style: str                             # detected style
    search_queries: list[str]              # what we searched
    search_results: list[dict]             # what we found
    search_summary: str                    # LLM summary of search results
    rewritten_text: str                    # after rewrite
    self_score: int                        # 1-10 self evaluation
    evaluation: str                        # evaluation text
    iteration: int                         # current iteration
    max_iterations: int
    best_rewritten_text: str               # highest scored rewrite so far
    best_self_score: int                   # highest self score so far
    best_evaluation: str                   # weakness note for best rewrite
    best_iteration: int                    # round index for best rewrite
    on_event: Callable[[dict], None] | None  # progress callback
    llm_config: dict  # model config for streaming


# ── Helper ──

_PROMPTS_CACHE: dict[str, str] = {}
TARGET_SCORE = 6


def _build_prompt(template_name: str, **kwargs: str) -> str:
    cache_key = f"prompt:{template_name}"
    if cache_key not in _PROMPTS_CACHE:
        _PROMPTS_CACHE[cache_key] = load_prompt("cn", 1)
    template = _PROMPTS_CACHE[cache_key]
    for k, v in kwargs.items():
        template = template.replace(f"{{{k}}}", v)
    return template


def _emit(state: AgentState, phase: str, **kw: Any) -> None:
    cb = state.get("on_event")
    if cb:
        cb({"phase": phase, **kw})


def _think(
    state: AgentState,
    content: str,
    *,
    step: str,
    thought_type: str = "status",
    details: dict[str, Any] | None = None,
) -> None:
    _emit(
        state,
        "agent-thought",
        step=step,
        content=content,
        thoughtType=thought_type,
        details=details or {},
    )


def _llm(prompt: str, state: AgentState | None = None) -> str:
    cfg = (state or {}).get("llm_config", {}) or {}
    return llm_completion(
        prompt,
        model=cfg.get("model", "glm-4.5-flash"),
        api_key=cfg.get("api_key", ""),
        base_url=cfg.get("base_url", "https://open.bigmodel.cn/api/paas/v4"),
        temperature=cfg.get("temperature", 0.3),
        timeout=300,
    )


# ── Graph Nodes ──

def analyze_document(state: AgentState) -> dict:
    _think(
        state,
        "用户发来了一段待改写内容。我先判断它属于什么领域、什么文风，再决定后面的检索和改写策略。",
        step="analyze",
        thought_type="plan",
    )
    _emit(state, "agent-step", step="analyze", status="running",
          message="正在分析文档领域和写作风格…")

    prompt = f"""分析以下文本的写作特征，输出 JSON 格式：
{{
  "domain": "所属领域",
  "style": "写作风格（学术论文/技术文档/作业/公文/其他）",
  "characteristics": ["特征1", "特征2"]
}}

文本：
{state["text"][:2000]}
"""
    raw = _llm(prompt, state)
    # Extract JSON from response
    try:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        info = json.loads(match.group()) if match else {}
    except (json.JSONDecodeError, AttributeError):
        info = {"domain": "未知", "style": "未知", "characteristics": []}

    domain = info.get("domain", "未知")
    style = info.get("style", "未知")
    chars = info.get("characteristics", [])

    _emit(state, "agent-step", step="analyze", status="done",
          message=f"领域: {domain}, 风格: {style}",
          details={"domain": domain, "style": style, "characteristics": chars})
    _think(
        state,
        f"初步判断这是一段{domain}方向的{style}文本。我会按这个判断去生成检索词，并尽量保留它原本的专业表达。",
        step="analyze",
        thought_type="result",
        details={"domain": domain, "style": style, "characteristics": chars},
    )

    return {"domain": domain, "style": style}


def search_strategy(state: AgentState) -> dict:
    domain = state.get("domain", "")
    style = state.get("style", "")
    _think(
        state,
        "接下来我会先拟 2 到 3 个检索词，分别去找这个领域的人类写作特征、常见表达和降低 AI 痕迹的方法。",
        step="search",
        thought_type="plan",
    )

    # Generate search queries
    prompt = f"""文本领域：{domain}，写作风格：{style}

请生成 2-3 个搜索查询，用于查找：
1. 该领域人类写作的语言特征
2. 降低AI检测率的最新技巧
3. 该领域真实论文的写作风格示例

每行一个搜索词。只输出搜索词，不要序号。"""
    raw = _llm(prompt, state)
    queries = [q.strip() for q in raw.strip().split("\n") if q.strip()][:3]

    # If LLM didn't generate good queries, use fallbacks
    if not queries:
        queries = [
            f"{domain} {style} 人类写作特征",
            "降低AIGC检测率 实战技巧",
            "academic writing natural style avoiding AI detection",
        ]
    _think(
        state,
        f"我先得到 {len(queries)} 个检索词，准备逐条尝试，而不是一条失败就整轮放弃。",
        step="search",
        thought_type="action",
        details={"queries": queries},
    )

    _emit(state, "agent-step", step="search", status="running",
          message=f"正在搜索策略… ({len(queries)} 个搜索词)",
          details={"queries": queries})

    # Search with DuckDuckGo
    all_results: list[dict] = []
    failures: list[dict[str, str]] = []
    try:
        with DDGS() as ddgs:
            for index, q in enumerate(queries[:3], start=1):
                _think(
                    state,
                    f"我先试第 {index} 个检索词：{q}",
                    step="search",
                    thought_type="action",
                    details={"query": q, "queryIndex": index},
                )
                try:
                    results = list(ddgs.text(q, max_results=3))
                    if not results:
                        failures.append({"query": q, "reason": "没有返回可用结果"})
                        _think(
                            state,
                            "这个检索词没有拿到可用结果，我继续试下一个，不让整轮卡在这里。",
                            step="search",
                            thought_type="fallback",
                            details={"query": q, "queryIndex": index, "reason": "没有返回可用结果"},
                        )
                        continue
                    for r in results:
                        all_results.append({
                            "query": q,
                            "title": r.get("title", ""),
                            "body": r.get("body", ""),
                            "link": r.get("link", ""),
                        })
                    _think(
                        state,
                        f"这个检索词命中了 {len(results)} 条结果，我先把它们收下作为改写证据。",
                        step="search",
                        thought_type="result",
                        details={"query": q, "queryIndex": index, "resultCount": len(results)},
                    )
                except Exception as exc:
                    failures.append({"query": q, "reason": str(exc)})
                    _think(
                        state,
                        f"第 {index} 个检索词失败了：{exc}。我不中断整轮，继续尝试后面的词。",
                        step="search",
                        thought_type="fallback",
                        details={"query": q, "queryIndex": index, "reason": str(exc)},
                    )
    except Exception as exc:
        failures.append({"query": "(ddg-init)", "reason": str(exc)})
        _think(
            state,
            f"检索工具初始化失败：{exc}。我先降级到无检索模式，保证改写流程还能继续跑完。",
            step="search",
            thought_type="fallback",
            details={"reason": str(exc)},
        )

    # Summarize search results with LLM
    if all_results:
        summary_prompt = f"""以下是搜索到的关于"{domain}"领域降低AI检测率的资料摘要。

搜索结果：
{chr(10).join(f"- {r['title']}: {r['body'][:200]}" for r in all_results[:6])}

请总结出对改写有帮助的 3-5 个关键策略。"""
        summary = _llm(summary_prompt, state)
        _think(
            state,
            f"我已经拿到 {len(all_results)} 条检索结果，接下来会把它们压缩成几条可执行的改写策略。",
            step="search",
            thought_type="result",
            details={"resultCount": len(all_results)},
        )
    else:
        summary = "未找到相关搜索结果，将使用默认改写策略。"
        _think(
            state,
            "这一轮没有拿到稳定的外部检索结果，我会降级为默认改写策略继续处理，避免整条链路失效。",
            step="search",
            thought_type="fallback",
            details={"failures": failures},
        )

    _emit(state, "agent-step", step="search", status="done",
          message=f"找到 {len(all_results)} 条结果",
          details={"queries": queries, "results": all_results[:6], "summary": summary, "failures": failures})

    return {"search_queries": queries, "search_results": all_results, "search_summary": summary}


def rewrite_text(state: AgentState) -> dict:
    text = state["text"]
    domain = state.get("domain", "")
    style = state.get("style", "")
    summary = state.get("search_summary", "")
    iteration = state.get("iteration", 0)

    _emit(state, "agent-step", step="rewrite", status="running",
          message=f"正在改写（第 {iteration + 1} 轮）…")

    context = ""
    if summary:
        context = f"\n\n参考策略：\n{summary}"

    if iteration == 0:
        _think(
            state,
            "我先做第一版改写，优先把句式规整感打散，同时保留原文核心信息和专业术语。",
            step="rewrite",
            thought_type="plan",
            details={"iteration": iteration + 1, "summary": summary},
        )
        prompt = f"""你是一个写作助手。请改写以下{style}（领域：{domain}），
目标是降低AI检测率。使用以下策略：
1. 加入适度的句式变化和长度变化
2. 使用该领域人类学者的常见表达方式
3. 避免过于规整的连接词模式
4. 保持专业性和技术准确性
5. 不要添加额外信息，只改写表达方式{context}

原文：
{text}"""
    else:
        prev_score = state.get("self_score", 5)
        evaluation = state.get("evaluation", "")
        _think(
            state,
            f"上一轮自评是 {prev_score}/10，我准备根据“{evaluation or '表达仍偏规整'}”继续压低 AI 痕迹，做第 {iteration + 1} 轮优化。",
            step="rewrite",
            thought_type="plan",
            details={"iteration": iteration + 1, "previousScore": prev_score, "evaluation": evaluation},
        )
        prompt = f"""第 {iteration + 1} 轮改写。上一轮自评得分 {prev_score}/10，评价：{evaluation}

请针对不足之处进行改进，进一步降低AI痕迹。

原文：
{text}"""

    _emit(state, "agent-step", step="rewrite", status="running",
          message="正在生成改写内容…")

    # Stream tokens for real-time display
    config = state.get("llm_config", {})
    full_text = [""]
    def _on_token(token: str) -> None:
        full_text[0] += token
        _emit(state, "stream-token", step="rewrite", streamText=full_text[0])

    try:
        from llm_client import llm_completion_stream
        rewritten = llm_completion_stream(
            prompt,
            model=config.get("model", "glm-4.5-flash"),
            api_key=config.get("api_key", ""),
            base_url=config.get("base_url", "https://open.bigmodel.cn/api/paas/v4"),
            temperature=0.4,
            timeout=300,
            on_token=_on_token,
        )
    except Exception:
        rewritten = _llm(prompt, state)

    _emit(state, "agent-step", step="rewrite", status="done",
          message=f"改写完成（{len(rewritten)} 字）")
    _think(
        state,
        "改写草稿已经生成。我接下来会站在读者视角自评一遍，看它的人类感和信息保留是否达标。",
        step="rewrite",
        thought_type="result",
        details={"iteration": iteration + 1, "outputLength": len(rewritten)},
    )

    return {"rewritten_text": rewritten}


def self_evaluate(state: AgentState) -> dict:
    text = state.get("rewritten_text", state["text"])
    domain = state.get("domain", "")
    style = state.get("style", "")
    iteration = state.get("iteration", 0)
    next_iteration = iteration + 1
    _think(
        state,
        "我会从句长变化、连接词密度、术语保留和整体人类感几个维度快速打一遍分。",
        step="evaluate",
        thought_type="plan",
        details={"iteration": next_iteration},
    )

    _emit(state, "agent-step", step="evaluate", status="running",
          message="正在自评改写质量…")

    prompt = f"""请评估以下改写的质量（领域：{domain}，风格：{style}）。

评估维度：
1. 句子长度是否多样化（10分：长短交错很自然）
2. 连接词使用是否均匀（10分：没有过度使用模式）
3. 专业术语是否准确保留（10分：完全正确）
4. 整体是否像人类写作（10分：非常自然）
5. 是否保留了原文核心信息（10分：完全保留）

输出JSON格式：{{"score": 总分/50, "weakness": "主要不足", "suggestions": ["改进1", "改进2"]}}

改写结果：
{text}
"""
    raw = _llm(prompt, state)
    try:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        info = json.loads(match.group()) if match else {}
    except (json.JSONDecodeError, AttributeError):
        info = {"score": 25, "weakness": "无法评估", "suggestions": []}

    raw_score = info.get("score", 25)
    weakness = info.get("weakness", "")
    suggestions = info.get("suggestions", [])

    if isinstance(raw_score, str):
        match = re.search(r"\d+(?:\.\d+)?", raw_score)
        score = float(match.group()) if match else 25.0
    elif isinstance(raw_score, (int, float)):
        score = float(raw_score)
    else:
        score = 25.0

    normalized = min(10, max(1, round(score / 5)))
    _emit(state, "agent-step", step="evaluate", status="done",
          message=f"自评得分 {normalized}/10",
          details={"score": normalized, "weakness": weakness, "suggestions": suggestions})
    _think(
        state,
        f"这一轮我给它 {normalized}/10。{weakness or '整体已经比较自然'}",
        step="evaluate",
        thought_type="result",
        details={"iteration": next_iteration, "score": normalized, "weakness": weakness, "suggestions": suggestions},
    )
    current_best_score = state.get("best_self_score", 0)
    updates: dict[str, Any] = {
        "self_score": normalized,
        "evaluation": weakness,
        "iteration": next_iteration,
    }
    if normalized >= current_best_score:
        updates.update({
            "best_rewritten_text": text,
            "best_self_score": normalized,
            "best_evaluation": weakness,
            "best_iteration": next_iteration,
        })
        _think(
            state,
            f"这一版目前是我手里得分最高的结果，先把它保留下来作为候选终稿。",
            step="evaluate",
            thought_type="decision",
            details={"iteration": next_iteration, "score": normalized},
        )

    return updates


def should_continue(state: AgentState) -> str:
    score = state.get("self_score", 1)
    iteration = state.get("iteration", 0)
    max_it = state.get("max_iterations", 3)
    best_score = state.get("best_self_score", score)
    best_iteration = state.get("best_iteration", iteration)

    _emit(state, "agent-step", step="decide", status="done",
          message=f"得分 {score}/10，{'达到标准' if score >= TARGET_SCORE else '继续优化'}")

    if score >= TARGET_SCORE or iteration >= max_it:
        if score >= TARGET_SCORE:
            _think(
                state,
                f"当前自评已经到 {score}/10，达到设定阈值，我就不继续迭代了，直接返回这一版结果。",
                step="decide",
                thought_type="decision",
                details={"score": score, "iteration": iteration, "maxIterations": max_it, "targetScore": TARGET_SCORE},
            )
        else:
            use_best = best_score > score and bool(state.get("best_rewritten_text"))
            if use_best:
                message = (
                    f"已经跑满 {max_it} 轮，当前分数还没到阈值。"
                    f"我会优雅收口，返回第 {best_iteration} 轮那版 {best_score}/10 的最佳结果。"
                )
            else:
                message = (
                    f"已经跑满 {max_it} 轮，虽然还没到阈值，但当前这版已经是最好结果。"
                    "我先在这里收口，避免继续空转。"
                )
            _think(
                state,
                message,
                step="decide",
                thought_type="decision",
                details={
                    "score": score,
                    "iteration": iteration,
                    "maxIterations": max_it,
                    "targetScore": TARGET_SCORE,
                    "bestScore": best_score,
                    "bestIteration": best_iteration,
                    "usedBestResult": use_best,
                },
            )
        return "end"
    _think(
        state,
        f"当前自评是 {score}/10，还没到目标。我准备继续做第 {iteration + 1} 轮改写，最多再试到第 {max_it} 轮。",
        step="decide",
        thought_type="decision",
        details={"score": score, "iteration": iteration, "maxIterations": max_it, "targetScore": TARGET_SCORE},
    )
    return "rewrite"


# ── Build Graph ──

def build_agent() -> StateGraph:
    workflow = StateGraph(AgentState)

    workflow.add_node("analyze", analyze_document)
    workflow.add_node("search", search_strategy)
    workflow.add_node("rewrite", rewrite_text)
    workflow.add_node("evaluate", self_evaluate)

    workflow.set_entry_point("analyze")

    workflow.add_edge("analyze", "search")
    workflow.add_edge("search", "rewrite")
    workflow.add_edge("rewrite", "evaluate")
    workflow.add_conditional_edges(
        "evaluate",
        should_continue,
        {"rewrite": "rewrite", "end": END},
    )

    return workflow.compile()


# ── Run ──

def run_agent(
    text: str,
    model_config: dict[str, Any],
    on_event: Callable[[dict], None] | None = None,
    max_iterations: int = 3,
) -> dict[str, Any]:
    """Run the agent pipeline. Returns final state."""
    agent = build_agent()
    normalized_config = normalize_model_config(model_config)
    llm_config = {
        "model": normalized_config.get("model", "glm-4.5-flash"),
        "api_key": normalized_config.get("apiKey", ""),
        "base_url": normalized_config.get("baseUrl", "https://open.bigmodel.cn/api/paas/v4"),
        "temperature": normalized_config.get("temperature", 0.3),
        "api_type": normalized_config.get("apiType", "chat_completions"),
    }

    initial: AgentState = {
        "text": text,
        "domain": "",
        "style": "",
        "search_queries": [],
        "search_results": [],
        "search_summary": "",
        "rewritten_text": "",
        "self_score": 0,
        "evaluation": "",
        "iteration": 0,
        "max_iterations": max_iterations,
        "best_rewritten_text": "",
        "best_self_score": 0,
        "best_evaluation": "",
        "best_iteration": 0,
        "on_event": on_event,
        "llm_config": llm_config,
    }

    if on_event:
        on_event({
            "phase": "agent-thought",
            "step": "intake",
            "content": f"我收到了一段约 {len(text)} 字的内容，先做领域识别，再决定检索和改写策略。",
            "thoughtType": "plan",
            "details": {"textLength": len(text), "maxIterations": max_iterations},
        })

    result = agent.invoke(initial)
    final_score = result.get("self_score", 0)
    final_iteration = result.get("iteration", 0)
    best_score = result.get("best_self_score", final_score)
    best_iteration = result.get("best_iteration", final_iteration)
    use_best_result = best_score > final_score and bool(result.get("best_rewritten_text"))
    final_result = dict(result)
    if use_best_result:
        final_result["rewritten_text"] = result.get("best_rewritten_text", result.get("rewritten_text", text))
        final_result["self_score"] = best_score
        final_result["evaluation"] = result.get("best_evaluation", result.get("evaluation", ""))
    else:
        final_result["rewritten_text"] = result.get("rewritten_text", text)
        final_result["self_score"] = final_score

    # Send final result event
    if on_event:
        completion_message = (
            f"处理完成。我一共跑了 {final_iteration} 轮，最终返回第 {best_iteration} 轮那版 {final_result.get('self_score', 0)}/10 的最佳结果。"
            if use_best_result and best_iteration
            else f"处理完成。我一共跑了 {final_iteration} 轮，最终自评 {final_result.get('self_score', 0)}/10。"
        )
        on_event({
            "phase": "agent-thought",
            "step": "complete",
            "content": completion_message,
            "thoughtType": "result",
            "details": {
                "iteration": final_iteration,
                "score": final_result.get("self_score", 0),
                "bestIteration": best_iteration,
                "bestScore": best_score,
                "usedBestResult": use_best_result,
                "targetScore": TARGET_SCORE,
            },
        })
        on_event({
            "phase": "agent-complete",
            "original_text": text,
            "rewritten_text": final_result.get("rewritten_text", text),
            "score": final_result.get("self_score", 0),
            "domain": final_result.get("domain", ""),
            "style": final_result.get("style", ""),
        })

    return final_result
