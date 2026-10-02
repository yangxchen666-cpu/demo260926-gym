"""One-shot TLS smoke check against a running admin-backend on :9000.

Prints ASCII only. Usage (from admin-backend/):
.venv/Scripts/python scripts/smoke_tls.py
"""
import json
import os
import ssl
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import jwt as pyjwt  # noqa: E402

BASE = "https://localhost:9000"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def request(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    if token is not None:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, data, context=CTX) as res:
            raw = res.read()
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, (json.loads(raw) if raw else None)


def main() -> None:
    from dotenv import dotenv_values

    # 管理端自己的凭据与 secret
    admin_env = dotenv_values(Path(__file__).resolve().parent.parent / ".env")
    email = admin_env["ADMIN_INITIAL_EMAIL"]
    password = admin_env["ADMIN_INITIAL_PASSWORD"]
    admin_secret = admin_env["ADMIN_JWT_SECRET"]

    st, body = request("POST", "/api/auth/login",
                       {"email": email, "password": password})
    assert st == 200, f"login failed: {st}"
    token = body["token"]
    print("[ok] login over TLS: 200")

    st, body = request("GET", "/api/me", token=token)
    assert st == 200 and body["email"] == email, f"me failed: {st}"
    print("[ok] me with token: 200")

    # 跨端隔离实证：用 backend 的真实 JWT_SECRET 签一个前台用户形态的 token，
    # 打 admin 端点必须 401（secret 不同 + 无 scope）
    backend_env = dotenv_values(
        Path(__file__).resolve().parent.parent.parent / "backend" / ".env"
    )
    backend_secret = backend_env.get("JWT_SECRET", "")
    assert backend_secret and backend_secret != admin_secret, \
        "backend JWT_SECRET missing or identical to ADMIN_JWT_SECRET"
    user_token = pyjwt.encode(
        {"sub": "1", "username": "somebody"}, backend_secret, algorithm="HS256"
    )
    st, _ = request("GET", "/api/me", token=user_token)
    assert st == 401, f"backend user token should be rejected, got {st}"
    print("[ok] frontend user token rejected: 401")

    print("\nTLS SMOKE PASSED")


if __name__ == "__main__":
    main()
