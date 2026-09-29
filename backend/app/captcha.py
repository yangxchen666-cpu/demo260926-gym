"""In-memory image captcha: SVG rendering + one-shot store with TTL.

Sync endpoints run in the anyio threadpool, so the store is guarded by a lock
and answers are consumed (popped) before comparison — a captcha never works
twice regardless of whether the subsequent login succeeds.
"""
import base64
import random
import threading
import time
import uuid

# 去掉易混淆字符（0/O、1/l/I）
CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 4
TTL_SECONDS = 300
# 画报风三色：近黑 / 火焰橙 / 宝蓝（与前端 @theme token 一致）
_FILLS = ("#14120e", "#e8631c", "#1e4fd8")

_lock = threading.Lock()
_store: dict[str, tuple[str, float]] = {}


def generate() -> dict:
    """Create a captcha, lazily purging expired entries. Returns API payload."""
    now = time.time()
    code = "".join(random.choices(CHARSET, k=CODE_LENGTH))
    captcha_id = uuid.uuid4().hex
    with _lock:
        for key in [k for k, (_, exp) in _store.items() if exp <= now]:
            del _store[key]
        _store[captcha_id] = (code, now + TTL_SECONDS)
    return {"captcha_id": captcha_id, "image": _data_url(_render_svg(code))}


def check_and_consume(captcha_id: str, code: str) -> tuple[bool, str]:
    """Pop the answer first, then compare (case-insensitive, trimmed).

    Returns (ok, reason) with reason in {"ok", "missing_or_expired", "mismatch"}.
    """
    with _lock:
        entry = _store.pop(captcha_id, None)
    if entry is None or entry[1] <= time.time():
        return False, "missing_or_expired"
    if code.strip().upper() != entry[0]:
        return False, "mismatch"
    return True, "ok"


def _render_svg(code: str) -> str:
    """Draw the code with per-glyph jitter/rotation plus noise, no dependencies."""
    rng = random.Random()
    width, height = 140, 44
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">',
        f'<rect width="{width}" height="{height}" fill="#f6f4ef"/>',
    ]
    slot = width / CODE_LENGTH
    for i, ch in enumerate(code):
        x = slot * i + slot / 2 + rng.uniform(-4, 4)
        y = height / 2 + rng.uniform(-3, 3)
        rotate = rng.uniform(-25, 25)
        size = rng.uniform(24, 28)
        parts.append(
            f'<g transform="translate({x:.1f},{y:.1f}) rotate({rotate:.1f})">'
            f'<text x="0" y="0" text-anchor="middle" dominant-baseline="central" '
            f'font-family="Courier New, monospace" font-weight="bold" '
            f'font-size="{size:.1f}" fill="{rng.choice(_FILLS)}">{ch}</text></g>'
        )
    for _ in range(rng.randint(3, 4)):
        points = " ".join(
            f"{rng.uniform(0, width):.1f},{rng.uniform(0, height):.1f}"
            for _ in range(rng.randint(2, 4))
        )
        stroke = rng.choice(("#14120e", "#1e4fd8"))
        parts.append(
            f'<polyline points="{points}" fill="none" stroke="{stroke}" '
            f'stroke-width="1" opacity="{rng.uniform(0.25, 0.45):.2f}"/>'
        )
    for _ in range(15):
        parts.append(
            f'<circle cx="{rng.uniform(0, width):.1f}" cy="{rng.uniform(0, height):.1f}" '
            f'r="{rng.uniform(0.6, 1.4):.1f}" fill="#6b675c" opacity="0.5"/>'
        )
    parts.append("</svg>")
    return "".join(parts)


def _data_url(svg: str) -> str:
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
