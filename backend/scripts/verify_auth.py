"""End-to-end verification for the auth endpoints.

Runs uvicorn in-process (port 8001) so the captcha store is directly
readable for the correct-code path. Console output is ASCII-only (GBK-safe);
save this file as UTF-8.

Usage: .venv/Scripts/python scripts/verify_auth.py   (from backend/)
"""
import json
import random
import string
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import captcha  # noqa: E402
from app.main import app  # noqa: E402

BASE = "http://127.0.0.1:8001"


def request(method: str, path: str, body: dict | None = None, token: str | None = None):
    """Return (status, json_or_none). Raises nothing on HTTP error statuses."""
    req = urllib.request.Request(BASE + path, method=method)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    if token is not None:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, data) as res:
            raw = res.read()
            # HTTPMessage.get 大小写不敏感（服务端头名为小写 cache-control）
            return res.status, (json.loads(raw) if raw else None), res.headers
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, (json.loads(raw) if raw else None), exc.headers


def fresh_captcha() -> tuple[str, str]:
    """Fetch a captcha and read its plaintext answer from the in-process store."""
    status, data, headers = request("GET", "/api/captcha")
    assert status == 200, f"captcha GET failed: {status}"
    assert headers.get("Cache-Control") == "no-store", "captcha missing no-store"
    with captcha._lock:
        code = captcha._store[data["captcha_id"]][0]
    return data["captcha_id"], code


def main() -> None:
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=8001, log_level="warning")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(0.05)

    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    username = f"tester_{suffix}"
    email = f"tester_{suffix}@example.com"
    password = "secret6"

    checks = 0

    def expect(actual, want, label):
        nonlocal checks
        assert actual == want, f"[FAIL] {label}: got {actual}, want {want}"
        checks += 1
        print(f"[ok] {label}")

    # --- register ---
    st, body, _ = request("POST", "/api/auth/register", {
        "username": username, "email": email,
        "password": password, "confirm_password": password,
    })
    expect(st, 201, "register: created")
    assert set(body) == {"token", "id", "username", "email"}, "register payload keys"
    print("[ok] register: payload keys")

    st, _, _ = request("POST", "/api/auth/register", {
        "username": username, "email": f"x_{suffix}@example.com",
        "password": password, "confirm_password": password,
    })
    expect(st, 409, "register: duplicate username -> 409")

    st, _, _ = request("POST", "/api/auth/register", {
        "username": f"other_{suffix}", "email": email,
        "password": password, "confirm_password": password,
    })
    expect(st, 409, "register: duplicate email -> 409")

    st, _, _ = request("POST", "/api/auth/register", {
        "username": f"other_{suffix}", "email": f"other_{suffix}@example.com",
        "password": password, "confirm_password": "secret7",
    })
    expect(st, 422, "register: password mismatch -> 422")

    st, _, _ = request("POST", "/api/auth/register", {
        "username": f"other_{suffix}", "email": f"other_{suffix}@example.com",
        "password": "abc", "confirm_password": "abc",
    })
    expect(st, 422, "register: short password -> 422")

    st, _, _ = request("POST", "/api/auth/register", {
        "username": f"other_{suffix}", "email": "not-an-email",
        "password": password, "confirm_password": password,
    })
    expect(st, 422, "register: bad email pattern -> 422")

    # --- captcha + login ---
    cid, code = fresh_captcha()
    st, body, _ = request("POST", "/api/auth/login", {
        "email": email, "password": password,
        "captcha_id": cid, "captcha_code": "XXXX", "remember": True,
    })
    expect(st, 400, "login: wrong captcha code -> 400")

    st, _, _ = request("POST", "/api/auth/login", {
        "email": email, "password": password,
        "captcha_id": cid, "captcha_code": code, "remember": True,
    })
    expect(st, 400, "login: replayed captcha id rejected (one-shot)")

    cid, code = fresh_captcha()
    st, _, _ = request("POST", "/api/auth/login", {
        "email": email, "password": "wrongpw",
        "captcha_id": cid, "captcha_code": code, "remember": True,
    })
    expect(st, 401, "login: wrong password -> 401")

    cid, code = fresh_captcha()
    st, _, _ = request("POST", "/api/auth/login", {
        "email": f"nobody_{suffix}@example.com", "password": password,
        "captcha_id": cid, "captcha_code": code, "remember": True,
    })
    expect(st, 401, "login: unknown email -> 401 (same as wrong password)")

    cid, code = fresh_captcha()
    st, body, _ = request("POST", "/api/auth/login", {
        "email": email.upper(), "password": password,
        "captcha_id": cid, "captcha_code": code.lower(), "remember": True,
    })
    expect(st, 200, "login: ok (email lowercased, captcha case-insensitive)")
    token = body["token"]
    assert body["username"] == username, "login: username in payload"
    print("[ok] login: payload username")

    # --- token lifetime ---
    import jwt as pyjwt
    payload = pyjwt.decode(token, options={"verify_signature": False})
    days = (payload["exp"] - payload["iat"]) / 86400
    assert 29.9 < days < 30.1, f"remember token lifetime: {days}"
    print("[ok] login: remember token valid 30 days")

    cid, code = fresh_captcha()
    st, body, _ = request("POST", "/api/auth/login", {
        "email": email, "password": password,
        "captcha_id": cid, "captcha_code": code, "remember": False,
    })
    expect(st, 200, "login: ok without remember")
    payload = pyjwt.decode(body["token"], options={"verify_signature": False})
    days = (payload["exp"] - payload["iat"]) / 86400
    assert 0.9 < days < 1.1, f"session token lifetime: {days}"
    print("[ok] login: session token valid 1 day")

    # --- /api/me ---
    st, body, _ = request("GET", "/api/me", token=token)
    expect(st, 200, "me: valid token -> 200")
    assert set(body) == {"id", "username", "email"}, "me payload keys"
    assert body["email"] == email, "me: email lowercased"
    print("[ok] me: payload keys")

    st, _, _ = request("GET", "/api/me", token="not-a-jwt")
    expect(st, 401, "me: bad token -> 401")

    st, _, _ = request("GET", "/api/me")
    expect(st, 401, "me: missing header -> 401")

    # --- regression: venue endpoints still fine ---
    st, body, _ = request("GET", "/api/venues?page_size=1")
    expect(st, 200, "regression: /api/venues")
    assert "total" in body and "items" in body, "venues payload"
    print("[ok] regression: /api/venues payload")

    server.should_exit = True
    thread.join(timeout=10)  # 等 lifespan 关闭连接池，避免解释器关闭竞态
    print(f"\nALL {checks + 7} CHECKS PASSED")


if __name__ == "__main__":
    main()
