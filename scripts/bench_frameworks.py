"""Benchmark Flask vs FastAPI response times."""
import time
import statistics
import httpx

ENDPOINTS = [
    ("GET /api/model-config", "GET", "/api/model-config", {}),
    ("GET /api/history-documents", "GET", "/api/history-documents", {}),
]

FLASK = "http://127.0.0.1:8765"
FASTAPI = "http://127.0.0.1:8766"
ROUNDS = 50
CONCURRENT = 10

print(f"{'Endpoint':<35} {'Flask avg':>10} {'FastAPI avg':>10} {'Diff':>8} {'Win':>6}")
print("-" * 80)

for label, method, path, body in ENDPOINTS:
    flask_times = []
    fastapi_times = []

    # Flask sequential
    for _ in range(ROUNDS):
        try:
            start = time.perf_counter()
            r = httpx.request(method, FLASK + path, json=body, timeout=10)
            flask_times.append((time.perf_counter() - start) * 1000)
        except Exception:
            pass

    # FastAPI sequential
    for _ in range(ROUNDS):
        try:
            start = time.perf_counter()
            r = httpx.request(method, FASTAPI + path, json=body, timeout=10)
            fastapi_times.append((time.perf_counter() - start) * 1000)
        except Exception:
            pass

    f_avg = statistics.mean(flask_times) if flask_times else 0
    fa_avg = statistics.mean(fastapi_times) if fastapi_times else 0

    if f_avg > 0 and fa_avg > 0:
        diff_pct = ((fa_avg - f_avg) / f_avg) * 100
        diff_str = f"{diff_pct:+.1f}%"
        win = "FastAPI" if fa_avg < f_avg else "Flask"
    else:
        diff_str = "N/A"
        win = "?"

    print(f"{label:<35} {f_avg:>8.1f}ms {fa_avg:>8.1f}ms {diff_str:>8} {win:>6}")

    # P50 / P95
    if flask_times:
        f_sorted = sorted(flask_times)
        fa_sorted = sorted(fastapi_times) if fastapi_times else [0]
        print(f"  Flask  P50={f_sorted[len(f_sorted)//2]:.1f}ms  P95={f_sorted[int(len(f_sorted)*0.95)]:.1f}ms")
        print(f"  FastAPI P50={fa_sorted[len(fa_sorted)//2]:.1f}ms  P95={fa_sorted[int(len(fa_sorted)*0.95)]:.1f}ms")

# Concurrent benchmark
print("\n--- Concurrent ({concurr} clients x {rounds} rounds) ---".format(concurr=CONCURRENT, rounds=ROUNDS))

for label, method, path, body in ENDPOINTS:
    async def run_concurrent(url_base):
        async def one_req(client):
            start = time.perf_counter()
            try:
                await client.request(method, url_base + path, json=body, timeout=10)
                return (time.perf_counter() - start) * 1000
            except Exception:
                return None

        async with httpx.AsyncClient(limits=httpx.Limits(max_connections=CONCURRENT)) as client:
            results = []
            tasks = [one_req(client) for _ in range(ROUNDS)]
            import asyncio
            batch = await asyncio.gather(*tasks)
            results = [r for r in batch if r is not None]
            return results

    import asyncio
    flask_concurrent = asyncio.run(run_concurrent(FLASK))
    fastapi_concurrent = asyncio.run(run_concurrent(FASTAPI))

    f_avg = statistics.mean(flask_concurrent) if flask_concurrent else 0
    fa_avg = statistics.mean(fastapi_concurrent) if fastapi_concurrent else 0
    diff_pct = ((fa_avg - f_avg) / f_avg) * 100 if f_avg > 0 else 0

    print(f"{label:<35} {f_avg:>8.1f}ms {fa_avg:>8.1f}ms {diff_pct:>+7.1f}% {'FastAPI' if fa_avg < f_avg else 'Flask':>6}")

print("\nDone.")
