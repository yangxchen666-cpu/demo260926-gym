"""Venue directory API."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from . import auth, captcha, db


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.pool.open()
    auth.ensure_users_table()  # users 表与 venues 数据管道解耦，幂等创建
    yield
    db.pool.close()


app = FastAPI(title="Venue Directory API", lifespan=lifespan)


@app.get("/api/venues")
def list_venues(
    q: str = Query("", description="keyword matched against name/location"),
    type: str = Query("", description="exact venue type"),
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=100),
):
    total, items = db.fetch_venues(q, type, page_size, (page - 1) * page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@app.get("/api/venues/{venue_id}")
def get_venue(venue_id: int):
    venue = db.fetch_venue(venue_id)
    if venue is None:
        raise HTTPException(status_code=404, detail="venue not found")
    return venue


@app.get("/api/venue-types")
def venue_types():
    return db.fetch_types()


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=20)
    email: str = Field(
        max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    )
    password: str = Field(min_length=6, max_length=128)
    confirm_password: str


class LoginRequest(BaseModel):
    email: str
    password: str
    captcha_id: str
    captcha_code: str
    remember: bool = False


@app.post("/api/auth/register", status_code=201)
def register(req: RegisterRequest):
    if req.password != req.confirm_password:
        raise HTTPException(status_code=422, detail="两次输入的密码不一致")
    user, conflict = auth.create_user(
        req.username, req.email, auth.hash_password(req.password)
    )
    if conflict == "username":
        raise HTTPException(status_code=409, detail="用户名已被占用")
    if conflict == "email":
        raise HTTPException(status_code=409, detail="邮箱已被占用")
    # 注册即登录（30 天记住态，与登录页勾选「记住登录状态」一致）
    token = auth.create_token(user["id"], user["username"], remember=True)
    return {"token": token, **user}


@app.get("/api/captcha")
def get_captcha(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return captcha.generate()


@app.post("/api/auth/login")
def login(req: LoginRequest):
    # 顺序固定：验证码（先消费，成败都不可重放）→ 用户 → 密码；
    # 用户不存在与密码错误统一提示，避免账号枚举
    ok, reason = captcha.check_and_consume(req.captcha_id, req.captcha_code)
    if not ok:
        if reason == "missing_or_expired":
            raise HTTPException(status_code=400, detail="验证码已过期，请刷新后重试")
        raise HTTPException(status_code=400, detail="验证码错误")
    user = auth.authenticate(req.email, req.password)
    if user is None:
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    token = auth.create_token(user["id"], user["username"], req.remember)
    return {"token": token, **user}


@app.get("/api/me")
def me(request: Request):
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    user_id = (
        auth.decode_token(token.strip())
        if scheme.lower() == "bearer" and token.strip()
        else None
    )
    if user_id is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    user = auth.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    return user
