"""End-to-end verification for the admin API (login + venues/users CRUD).

Runs uvicorn in-process (port 9001). Console output is ASCII-only (GBK-safe);
save this file as UTF-8.

Usage: .venv/Scripts/python scripts/verify_admin.py   (from admin-backend/)
"""
import json
import os
import random
import string
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import jwt as pyjwt
import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import auth  # noqa: E402
from app.main import app  # noqa: E402

BASE = "http://127.0.0.1:9001"


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
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, (json.loads(raw) if raw else None)


def main() -> None:
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=9001, log_level="warning")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(0.05)

    # app 模块 import 时已 load_dotenv，此处直接读环境变量
    admin_email = os.environ.get("ADMIN_INITIAL_EMAIL", "")
    admin_password = os.environ.get("ADMIN_INITIAL_PASSWORD", "")

    checks = 0

    def expect(actual, want, label):
        nonlocal checks
        assert actual == want, f"[FAIL] {label}: got {actual!r}, want {want!r}"
        checks += 1
        print(f"[ok] {label}")

    # --- login ---
    st, body = request("POST", "/api/auth/login",
                       {"email": admin_email, "password": "wrong-password"})
    expect(st, 401, "login: wrong password -> 401")
    wrong_detail = body["detail"]

    st, body = request("POST", "/api/auth/login",
                       {"email": "nobody@example.com", "password": "secret6"})
    expect(st, 401, "login: unknown email -> 401")
    expect(body["detail"], wrong_detail, "login: same detail (anti-enumeration)")

    st, body = request("POST", "/api/auth/login",
                       {"email": admin_email.upper(), "password": admin_password})
    expect(st, 200, "login: ok (email case-insensitive)")
    token = body["token"]
    admin_id = body["id"]
    expect(set(body), {"token", "id", "email"}, "login: payload keys")

    payload = pyjwt.decode(token, options={"verify_signature": False})
    expect(payload.get("scope"), "admin", "login: token scope=admin")
    hours = (payload["exp"] - payload["iat"]) / 3600
    expect(7.9 < hours < 8.1, True, "login: token lifetime 8h")

    # --- /api/me (含负向 token 用例) ---
    st, _ = request("GET", "/api/me")
    expect(st, 401, "me: missing header -> 401")

    st, _ = request("GET", "/api/me", token="not-a-jwt")
    expect(st, 401, "me: garbage token -> 401")

    forged = pyjwt.encode(
        {"sub": "1", "scope": "admin"}, "wrong-secret-x", algorithm="HS256"
    )
    st, _ = request("GET", "/api/me", token=forged)
    expect(st, 401, "me: token signed with wrong secret -> 401")

    # 真 secret 但无 scope（前台用户 token 的形态）-> 401
    no_scope = pyjwt.encode(
        {"sub": str(admin_id), "email": admin_email}, auth.JWT_SECRET,
        algorithm="HS256",
    )
    st, _ = request("GET", "/api/me", token=no_scope)
    expect(st, 401, "me: valid secret but no scope -> 401")

    st, body = request("GET", "/api/me", token=token)
    expect(st, 200, "me: valid token -> 200")
    expect(set(body), {"id", "email"}, "me: payload keys")

    # --- venues CRUD ---
    st, _ = request("GET", "/api/venues")
    expect(st, 401, "venues: no token -> 401")

    st, body = request("GET", "/api/venues", token=token)
    expect(st, 200, "venues: list ok")
    expect(set(body), {"total", "page", "page_size", "items"},
           "venues: list payload keys")

    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    venue_name = f"verify_venue_{suffix}"
    venue_fields = {
        "name": venue_name,
        "type": "足球场",
        "location": "verify road 1",
        "image": "https://picsum.photos/seed/verify/400/260",
        "description": "verify description",
        "opening_hours": "08:00-22:00",
        "contact": "010-00000000",
    }

    st, body = request("POST", "/api/venues", venue_fields, token=token)
    expect(st, 201, "venues: created")
    expect(set(body), {"id", "name", "type", "location", "image",
                       "description", "opening_hours", "contact"},
           "venues: created payload has 8 fields")
    venue_id = body["id"]
    expect(venue_id > 0, True, "venues: created id positive")

    st, _ = request("POST", "/api/venues",
                    {**venue_fields, "type": "体育馆"}, token=token)
    expect(st, 422, "venues: invalid type -> 422")

    st, body = request("GET", f"/api/venues/{venue_id}", token=token)
    expect(st, 200, "venues: fetch created")
    expect(body["name"], venue_name, "venues: fetched name matches")

    # q + type 筛选：用刚建的场馆名后缀保证有命中（与 seed 状态无关）
    st, body = request(
        "GET",
        f"/api/venues?q={suffix}&type={urllib.parse.quote('足球场')}",
        token=token,
    )
    expect(st, 200, "venues: q+type filter ok")
    expect(body["total"] >= 1, True, "venues: q filter hits")
    expect(all(v["type"] == "足球场" for v in body["items"]), True,
           "venues: type filter only matches")

    renamed = f"verify_renamed_{suffix}"
    st, body = request("PUT", f"/api/venues/{venue_id}",
                       {**venue_fields, "name": renamed}, token=token)
    expect(st, 200, "venues: updated")
    st, body = request("GET", f"/api/venues/{venue_id}", token=token)
    expect(body["name"], renamed, "venues: update persisted")

    st, _ = request("DELETE", f"/api/venues/{venue_id}", token=token)
    expect(st, 204, "venues: deleted -> 204")
    st, _ = request("DELETE", f"/api/venues/{venue_id}", token=token)
    expect(st, 404, "venues: re-delete -> 404")
    st, _ = request("GET", f"/api/venues/{venue_id}", token=token)
    expect(st, 404, "venues: fetch deleted -> 404")

    # --- users CRUD ---
    username = f"tester_{suffix}"
    email = f"tester_{suffix}@example.com"

    st, _ = request("GET", "/api/users")
    expect(st, 401, "users: no token -> 401")

    st, body = request("GET", "/api/users", token=token)
    expect(st, 200, "users: list ok")
    expect(set(body), {"total", "page", "page_size", "items"},
           "users: list payload keys")
    users_total_before = body["total"]

    st, body = request("POST", "/api/users",
                       {"username": username, "email": email.upper(),
                        "password": "secret6"}, token=token)
    expect(st, 201, "users: created")
    expect(body["email"], email, "users: email lowercased")
    expect(set(body), {"id", "username", "email", "created_at"},
           "users: created payload keys (no password_hash)")
    user_id = body["id"]

    st, _ = request("POST", "/api/users",
                    {"username": f"other_{suffix}", "email": email,
                     "password": "secret6"}, token=token)
    expect(st, 409, "users: duplicate email -> 409")

    st, _ = request("POST", "/api/users",
                    {"username": username, "email": f"x_{suffix}@example.com",
                     "password": "secret6"}, token=token)
    expect(st, 409, "users: duplicate username -> 409")

    st, _ = request("POST", "/api/users",
                    {"username": f"other_{suffix}",
                     "email": f"x_{suffix}@example.com", "password": "abc"},
                    token=token)
    expect(st, 422, "users: short password -> 422")

    st, body = request("PUT", f"/api/users/{user_id}",
                       {"username": f"renamed_{suffix}", "email": email,
                        "password": ""}, token=token)
    expect(st, 200, "users: updated with blank password (keep old)")
    expect(body["username"], f"renamed_{suffix}", "users: rename persisted")

    st, body = request("PUT", f"/api/users/{user_id}",
                       {"username": f"renamed_{suffix}", "email": email,
                        "password": "newsecret6"}, token=token)
    expect(st, 200, "users: password reset ok")

    st, body = request("POST", "/api/users",
                       {"username": f"second_{suffix}",
                        "email": f"second_{suffix}@example.com",
                        "password": "secret6"}, token=token)
    expect(st, 201, "users: second user created")
    second_id = body["id"]

    st, _ = request("PUT", f"/api/users/{user_id}",
                    {"username": f"renamed_{suffix}",
                     "email": f"second_{suffix}@example.com"}, token=token)
    expect(st, 409, "users: update to taken email -> 409")

    # 分页（users 表此刻至少有 2 条新数据）
    st, body = request("GET", "/api/users?page_size=1", token=token)
    expect(st, 200, "users: page_size=1 ok")
    expect(len(body["items"]), 1, "users: page_size honored")
    expect(body["total"] >= 2, True, "users: total >= 2")

    st, body = request("GET", "/api/users?page=2&page_size=1", token=token)
    expect(st, 200, "users: page=2 ok")
    expect(body["page"], 2, "users: page echoed")

    st, _ = request("DELETE", f"/api/users/{user_id}", token=token)
    expect(st, 204, "users: deleted -> 204")
    st, _ = request("DELETE", f"/api/users/{user_id}", token=token)
    expect(st, 404, "users: re-delete -> 404")
    st, body = request("GET", "/api/users", token=token)
    expect(body["total"], users_total_before + 1,
           "users: total after delete (only second remains)")

    # 清理第二测试用户
    st, _ = request("DELETE", f"/api/users/{second_id}", token=token)
    expect(st, 204, "cleanup: second test user removed")
    st, body = request("GET", "/api/users", token=token)
    expect(body["total"], users_total_before, "cleanup: users total restored")

    server.should_exit = True
    thread.join(timeout=10)  # 等 lifespan 关闭连接池，避免解释器关闭竞态
    print(f"\nALL {checks} CHECKS PASSED")


if __name__ == "__main__":
    main()
