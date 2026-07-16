"""FastAPI equivalent of web_app.py for performance comparison."""

from __future__ import annotations

import asyncio
import json
import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, Response

from aigc_round_service import normalize_path
from app_config import load_app_config, save_app_config
from app_service import (
    delete_document_history,
    export_round_output,
    get_document_history,
    get_document_status,
    list_document_histories,
    read_output_text,
    read_output_preview,
    read_source_preview,
    request_stop_for_app,
    run_agent_round_for_app,
    run_round_for_app,
    test_model_connection,
)
from managed_sources import (
    ORIGIN_DIR,
    ensure_managed_source_dirs,
    find_latest_matching_chat_upload,
    get_display_name_for_source,
    import_chat_base64_attachment,
    import_chat_text_attachment,
    sanitize_filename,
)

ROOT_DIR = Path(__file__).resolve().parents[1]
FINISH_DIR = ROOT_DIR / "finish"
EXPORT_DIR = FINISH_DIR / "web_exports"
ALLOWED_WEB_ORIGINS = {
    "http://localhost:1420",
    "http://127.0.0.1:1420",
}


@dataclass
class ProgressState:
    completed: bool = False
    error: str | None = None
    events: list[dict[str, Any]] = field(default_factory=list)
    result: dict[str, Any] | None = None
    condition: threading.Condition = field(default_factory=threading.Condition)


RUN_STATES: dict[str, ProgressState] = {}

app = FastAPI(title="智谱清痕 API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ALLOWED_WEB_ORIGINS),
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)


def ensure_workspace_dirs() -> None:
    ensure_managed_source_dirs()
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)


def error_response(message: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"message": message}, status_code=status)


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root.resolve())
        return True
    except ValueError:
        return False


def require_managed_source_path(path_value: str) -> str:
    normalized_path = normalize_path(Path(path_value))
    if not _is_within(normalized_path, ORIGIN_DIR):
        raise ValueError("sourcePath must stay within the managed origin directory.")
    return str(normalized_path)


def require_managed_preview_input_path(path_value: str) -> str:
    normalized_path = normalize_path(Path(path_value))
    if _is_within(normalized_path, ORIGIN_DIR) or _is_within(normalized_path, FINISH_DIR):
        return str(normalized_path)
    raise ValueError("inputPath must stay within the managed origin or finish directory.")


def require_managed_output_path(path_value: str) -> str:
    normalized_path = normalize_path(Path(path_value))
    if not _is_within(normalized_path, FINISH_DIR):
        raise ValueError("outputPath must stay within the managed finish directory.")
    return str(normalized_path)


def write_uploaded_file(filename: str, content: str) -> Path:
    return import_chat_text_attachment(filename, content)


def write_uploaded_binary_file(filename: str, content_base64: str) -> Path:
    return import_chat_base64_attachment(filename, content_base64)


def build_upload_response(source_path: Path, *, conflict: bool, reused: bool) -> dict[str, Any]:
    return {
        "sourcePath": str(source_path),
        "filename": source_path.name,
        "displayName": get_display_name_for_source(source_path),
        "conflict": conflict,
        "reused": reused,
    }


def append_progress_event(run_id: str, event: dict[str, Any]) -> None:
    state = RUN_STATES.get(run_id)
    if not state:
        return
    with state.condition:
        state.events.append(event)
        state.condition.notify_all()


def finalize_progress(run_id: str, *, result: dict[str, Any] | None = None, error: str | None = None) -> None:
    state = RUN_STATES.get(run_id)
    if not state:
        return
    with state.condition:
        state.result = result
        state.error = error
        state.completed = True
        state.condition.notify_all()


def run_round_async(run_id: str, source_path: str, model_config: dict[str, Any], execution_options: dict[str, Any] | None) -> None:
    try:
        def capture_progress(event: dict[str, Any]) -> None:
            append_progress_event(run_id, event)
        result = run_round_for_app(source_path, model_config, progress_callback=capture_progress, execution_options=execution_options)
        finalize_progress(run_id, result=result)
    except Exception as exc:
        finalize_progress(run_id, error=str(exc))


# ---- Routes ----

@app.get("/api/model-config")
def get_model_config():
    return load_app_config()


@app.post("/api/model-config")
async def post_model_config(payload: dict[str, Any] = {}):
    try:
        return save_app_config(payload)
    except Exception as exc:
        return error_response(str(exc))


@app.post("/api/test-connection")
async def post_test_connection(payload: dict[str, Any] = {}):
    try:
        return test_model_connection(payload)
    except Exception as exc:
        return error_response(str(exc))


@app.post("/api/upload-document")
async def post_upload_document(payload: dict[str, Any] = {}):
    try:
        filename = sanitize_filename(str(payload.get("filename", "")).strip())
        duplicate_action = str(payload.get("duplicateAction", "") or "").strip().lower()
        encoding = str(payload.get("encoding", "text")).strip().lower()
        existing_path = find_latest_matching_chat_upload(filename)

        if existing_path is not None and duplicate_action not in {"reuse_existing", "replace_with_new"}:
            return build_upload_response(existing_path, conflict=True, reused=False)

        if existing_path is not None and duplicate_action == "reuse_existing":
            return build_upload_response(existing_path, conflict=False, reused=True)

        if encoding == "base64":
            content_base64 = str(payload.get("contentBase64", ""))
            target_path = write_uploaded_binary_file(filename, content_base64)
        else:
            content = str(payload.get("content", ""))
            target_path = write_uploaded_file(filename, content)
        return build_upload_response(target_path, conflict=False, reused=False)
    except Exception as exc:
        return error_response(str(exc))


@app.get("/api/document-status")
async def get_status(sourcePath: str = Query(...), promptProfile: str = Query("cn")):
    try:
        source_path = require_managed_source_path(sourcePath)
        return get_document_status(source_path, prompt_profile=promptProfile)
    except Exception as exc:
        return error_response(str(exc))


@app.get("/api/document-history")
async def get_history(sourcePath: str = Query(...)):
    try:
        source_path = require_managed_source_path(sourcePath)
        return get_document_history(source_path)
    except Exception as exc:
        return error_response(str(exc))


@app.get("/api/history-documents")
async def get_history_list():
    try:
        return list_document_histories()
    except Exception as exc:
        return error_response(str(exc))


@app.delete("/api/document-history")
async def delete_history(payload: dict[str, Any] = {}):
    try:
        doc_id = str(payload.get("docId", "")).strip()
        from_round = payload.get("fromRound")
        if not doc_id:
            raise ValueError("docId is required.")
        if from_round is not None and not isinstance(from_round, int):
            raise ValueError("fromRound must be an integer when provided.")
        return delete_document_history(doc_id, from_round)
    except Exception as exc:
        return error_response(str(exc))


@app.get("/api/read-output")
async def get_read_output(outputPath: str = Query(...)):
    try:
        output_path = require_managed_output_path(outputPath)
        return read_output_text(output_path)
    except Exception as exc:
        return error_response(str(exc))


@app.get("/api/read-output-preview")
async def get_read_output_preview(outputPath: str = Query(...), manifestPath: str = Query(...)):
    try:
        output_path = require_managed_output_path(outputPath)
        manifest_path = require_managed_output_path(manifestPath)
        return read_output_preview(output_path, manifest_path)
    except Exception as exc:
        return error_response(str(exc))


@app.get("/api/read-source-preview")
async def get_read_source_preview(
    inputPath: str = Query(...),
    manifestPath: str = Query(...),
    promptProfile: str = Query("cn"),
):
    try:
        input_path = require_managed_preview_input_path(inputPath)
        manifest_path = require_managed_output_path(manifestPath)
        return read_source_preview(input_path, manifest_path, promptProfile)
    except Exception as exc:
        return error_response(str(exc))


@app.post("/api/run-round")
async def post_run_round(payload: dict[str, Any] = {}):
    try:
        source_path = require_managed_source_path(str(payload.get("sourcePath", "")).strip())
        model_config = payload.get("modelConfig")
        execution_options = payload.get("executionOptions")
        if not isinstance(model_config, dict):
            raise ValueError("modelConfig is required.")
        if execution_options is not None and not isinstance(execution_options, dict):
            raise ValueError("executionOptions must be an object when provided.")
        run_id = uuid.uuid4().hex
        RUN_STATES[run_id] = ProgressState()
        worker = threading.Thread(target=run_round_async, args=(run_id, source_path, model_config, execution_options), daemon=True)
        worker.start()
        return JSONResponse({"runId": run_id}, status_code=202)
    except Exception as exc:
        return error_response(str(exc))


@app.post("/api/quick-process")
async def post_quick_process(payload: dict[str, Any] = {}):
    """Quick paste: accepts text directly, saves to temp file, runs round."""
    try:
        text = str(payload.get("text", "")).strip()
        model_config = payload.get("modelConfig")
        if not text:
            raise ValueError("text is required.")
        if not isinstance(model_config, dict):
            raise ValueError("modelConfig is required.")

        from managed_sources import CHAT_UPLOADS_DIR
        temp_name = f"quick-paste_{uuid.uuid4().hex[:8]}.txt"
        temp_path = CHAT_UPLOADS_DIR / temp_name
        temp_path.write_text(text, encoding="utf-8")

        source_path = str(temp_path)
        run_id = uuid.uuid4().hex
        RUN_STATES[run_id] = ProgressState()
        worker = threading.Thread(target=run_round_async, args=(run_id, source_path, model_config, None), daemon=True)
        worker.start()
        return JSONResponse({"runId": run_id}, status_code=202)
    except Exception as exc:
        return error_response(str(exc))


@app.post("/api/agent-process")
async def post_agent_process(payload: dict[str, Any] = {}):
    try:
        text = str(payload.get("text", "")).strip()
        model_config = payload.get("modelConfig", {})
        if not text:
            raise ValueError("text is required.")

        run_id = uuid.uuid4().hex

        def event_callback(event: dict) -> None:
            state = RUN_STATES.get(run_id)
            if not state:
                return
            with state.condition:
                state.events.append(event)
                state.condition.notify_all()

        def run_async() -> None:
            try:
                quick_source_path = write_uploaded_file("quick-paste.txt", text)
                result = run_agent_round_for_app(str(quick_source_path), model_config, on_event=event_callback)
                finalize_progress(run_id, result=result)
            except Exception as exc:
                finalize_progress(run_id, error=str(exc))

        RUN_STATES[run_id] = ProgressState()
        worker = threading.Thread(target=run_async, daemon=True)
        worker.start()
        return JSONResponse({"runId": run_id}, status_code=202)
    except Exception as exc:
        return error_response(str(exc))


@app.post("/api/agent-file-process")
async def post_agent_file_process(payload: dict[str, Any] = {}):
    """Agent pipeline for uploaded files."""
    try:
        source_path = str(payload.get("sourcePath", "")).strip()
        model_config = payload.get("modelConfig", {})
        if not source_path:
            raise ValueError("sourcePath is required.")

        full_path = normalize_path(Path(source_path))
        if not _is_within(full_path, ORIGIN_DIR):
            raise ValueError("sourcePath must stay within the managed origin directory.")

        run_id = uuid.uuid4().hex

        def event_callback(event: dict) -> None:
            state = RUN_STATES.get(run_id)
            if not state:
                return
            with state.condition:
                state.events.append(event)
                state.condition.notify_all()

        def run_async() -> None:
            try:
                result = run_agent_round_for_app(str(full_path), model_config, on_event=event_callback)
                finalize_progress(run_id, result=result)
            except Exception as exc:
                finalize_progress(run_id, error=str(exc))

        RUN_STATES[run_id] = ProgressState()
        worker = threading.Thread(target=run_async, daemon=True)
        worker.start()
        return JSONResponse({"runId": run_id}, status_code=202)
    except Exception as exc:
        return error_response(str(exc))


@app.post("/api/request-stop")
async def post_request_stop(payload: dict[str, Any] = {}):
    try:
        source_path = require_managed_source_path(str(payload.get("sourcePath", "")).strip())
        prompt_profile = str(payload.get("promptProfile", "cn") or "cn")
        return request_stop_for_app(source_path, prompt_profile=prompt_profile)
    except Exception as exc:
        return error_response(str(exc))


@app.get("/api/export-round")
async def get_export_round(outputPath: str = Query(...), targetFormat: str = Query(...)):
    try:
        output_path = require_managed_output_path(outputPath)
        stem = Path(output_path).stem or "current-round"
        export_path = EXPORT_DIR / f"{stem}.{targetFormat}"
        result = export_round_output(output_path, str(export_path), targetFormat)
        file_path = Path(result["path"])
        mimetype = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if targetFormat == "txt":
            mimetype = "text/plain; charset=utf-8"
        from fastapi.responses import FileResponse
        return FileResponse(file_path, media_type=mimetype, filename=file_path.name)
    except Exception as exc:
        return error_response(str(exc))


@app.get("/api/run-round-events/{run_id}")
def get_run_round_events(run_id: str):
    state = RUN_STATES.get(run_id)
    if not state:
        return error_response("Unknown run id.")

    def generate():
        cursor = 0
        while True:
            with state.condition:
                while cursor >= len(state.events) and not state.completed:
                    state.condition.wait(timeout=1)
                while cursor < len(state.events):
                    event = state.events[cursor]
                    payload = json.dumps(event, ensure_ascii=False)
                    yield f"event: progress\ndata: {payload}\n\n"
                    cursor += 1
                if state.completed:
                    if state.error:
                        payload = json.dumps({"message": state.error}, ensure_ascii=False)
                        yield f"event: error\ndata: {payload}\n\n"
                    else:
                        payload = json.dumps(state.result or {}, ensure_ascii=False)
                        yield f"event: result\ndata: {payload}\n\n"
                    RUN_STATES.pop(run_id, None)
                    return

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


def main() -> None:
    import uvicorn
    ensure_workspace_dirs()
    print("智谱清痕 FastAPI running at http://127.0.0.1:8766")
    uvicorn.run(app, host="127.0.0.1", port=8766, log_level="warning")


if __name__ == "__main__":
    main()
