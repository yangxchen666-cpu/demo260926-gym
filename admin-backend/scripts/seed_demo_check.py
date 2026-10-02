"""Seed-overwrite semantics demo across the two apps.

phase=create  : create a venue via admin proxy (:5174), then assert the
               running backend (:8000) public API serves it.
phase=verify  : after `python -m app.seed`, assert the venue is gone from
               the public API (seed = factory reset for venues).

ASCII-only output. Usage (from admin-backend/):
.venv/Scripts/python scripts/seed_demo_check.py create|verify
"""
import json
import ssl
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import dotenv_values  # noqa: E402

ADMIN_PROXY = "http://localhost:5174"   # -> admin-backend :9000
PUBLIC_API = "https://localhost:8000"   # backend（需已启动）
SUFFIX = "seeddemo"

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def request(base, method, path, body=None, token=None, insecure=False):
    req = urllib.request.Request(base + path, method=method)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    if token is not None:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(
            req, data, context=CTX if insecure else None
        ) as res:
            raw = res.read()
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, (json.loads(raw) if raw else None)


def public_count() -> int:
    q = urllib.parse.quote(f"seeddemo_venue_{SUFFIX}")
    st, body = request(PUBLIC_API, "GET", f"/api/venues?q={q}", insecure=True)
    assert st == 200, f"public API failed: {st} (is backend :8000 up?)"
    return body["total"]


def main() -> None:
    phase = sys.argv[1] if len(sys.argv) > 1 else ""
    env = dotenv_values(Path(__file__).resolve().parent.parent / ".env")

    if phase == "create":
        st, body = request(ADMIN_PROXY, "POST", "/api/auth/login", body={
            "email": env["ADMIN_INITIAL_EMAIL"],
            "password": env["ADMIN_INITIAL_PASSWORD"],
        })
        assert st == 200, f"admin login failed: {st}"
        token = body["token"]

        st, body = request(ADMIN_PROXY, "POST", "/api/venues", token=token, body={
            "name": f"seeddemo_venue_{SUFFIX}",
            "type": "篮球场",
            "location": "seed demo road",
            "image": "https://picsum.photos/seed/seeddemo/400/260",
            "description": "temporary venue for seed overwrite demo",
            "opening_hours": "08:00-22:00",
            "contact": "010-88888888",
        })
        assert st == 201, f"create failed: {st}"
        print(f"[ok] venue created via admin (id={body['id']})")

        count = public_count()
        assert count == 1, f"public API should serve it, got total={count}"
        print("[ok] backend public API (:8000) serves the admin-created venue")
        print("NOW RUN: cd backend && .venv/Scripts/python -m app.seed")

    elif phase == "verify":
        count = public_count()
        assert count == 0, f"venue should be wiped by seed, got total={count}"
        print("[ok] after reseed the admin-created venue is gone (factory reset)")

        st, body = request(PUBLIC_API, "GET", "/api/venues?page_size=1",
                           insecure=True)
        assert st == 200 and body["total"] == 60, \
            f"expected 60 seeded venues, got {body['total']}"
        print("[ok] public API back to the 60 seeded venues")
        print("\nSEED OVERWRITE SEMANTICS VERIFIED")
    else:
        raise SystemExit("usage: seed_demo_check.py create|verify")


if __name__ == "__main__":
    main()
