"""Admin API: login plus venues/users CRUD (style mirrors backend/app/main.py)."""
from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from . import auth, db


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.pool.open()
    db.ensure_tables()  # venues/users 幂等建表，空库也能独立运行
    auth.ensure_admins_table()
    auth.seed_default_admin()
    yield
    db.pool.close()


app = FastAPI(title="Venue Directory Admin API", lifespan=lifespan)


class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/api/auth/login")
def login(req: LoginRequest):
    # 不存在与密码错误统一提示，避免账号枚举（管理端无验证码）
    admin = auth.authenticate(req.email, req.password)
    if admin is None:
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    token = auth.create_token(admin["id"], admin["email"])
    return {"token": token, **admin}


@app.get("/api/me")
def me(admin: dict = Depends(auth.require_admin)):
    return admin


# ---------------------------------------------------------------------------
# venues


VENUE_TYPES = ("足球场", "篮球场", "羽毛球场", "网球场")


class VenueRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: Literal["足球场", "篮球场", "羽毛球场", "网球场"]
    location: str = Field(min_length=1, max_length=200)
    image: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1, max_length=2000)
    opening_hours: str = Field(min_length=1, max_length=100)
    contact: str = Field(min_length=1, max_length=100)


@app.get("/api/venues")
def list_venues(
    q: str = Query("", description="keyword matched against name/location"),
    type: str = Query("", description="exact venue type"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: dict = Depends(auth.require_admin),
):
    total, items = db.fetch_venues(q, type, page_size, (page - 1) * page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@app.get("/api/venues/{venue_id}")
def get_venue(venue_id: int, _: dict = Depends(auth.require_admin)):
    venue = db.fetch_venue(venue_id)
    if venue is None:
        raise HTTPException(status_code=404, detail="venue not found")
    return venue


@app.post("/api/venues", status_code=201)
def create_venue(req: VenueRequest, _: dict = Depends(auth.require_admin)):
    venue = db.create_venue(req.model_dump())
    if venue is None:  # id 分配连续冲突（仅并发创建可触发）
        raise HTTPException(status_code=500, detail="创建场馆失败，请重试")
    return venue


@app.put("/api/venues/{venue_id}")
def update_venue(
    venue_id: int, req: VenueRequest, _: dict = Depends(auth.require_admin)
):
    venue = db.update_venue(venue_id, req.model_dump())
    if venue is None:
        raise HTTPException(status_code=404, detail="venue not found")
    return venue


@app.delete("/api/venues/{venue_id}", status_code=204)
def delete_venue(venue_id: int, _: dict = Depends(auth.require_admin)):
    if not db.delete_venue(venue_id):
        raise HTTPException(status_code=404, detail="venue not found")


# ---------------------------------------------------------------------------
# users


_EMAIL_FIELD = Field(
    max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
)


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=2, max_length=20)
    email: str = _EMAIL_FIELD
    password: str = Field(min_length=6, max_length=128)


class UserUpdateRequest(BaseModel):
    username: str = Field(min_length=2, max_length=20)
    email: str = _EMAIL_FIELD
    # None 或空串 = 不改密码；否则需 6-128 位
    password: Optional[str] = Field(None, max_length=128)

    @field_validator("password")
    @classmethod
    def _password_blank_means_keep(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if len(v) < 6:
            raise ValueError("密码长度至少 6 位")
        return v


@app.get("/api/users")
def list_users(
    q: str = Query("", description="keyword matched against username/email"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: dict = Depends(auth.require_admin),
):
    total, items = db.fetch_users(q, page_size, (page - 1) * page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@app.get("/api/users/{user_id}")
def get_user(user_id: int, _: dict = Depends(auth.require_admin)):
    user = db.fetch_user(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    return user


@app.post("/api/users", status_code=201)
def create_user(req: UserCreateRequest, _: dict = Depends(auth.require_admin)):
    user, conflict = db.create_user(
        req.username, req.email, auth.hash_password(req.password)
    )
    if conflict == "username":
        raise HTTPException(status_code=409, detail="用户名已被占用")
    if conflict == "email":
        raise HTTPException(status_code=409, detail="邮箱已被占用")
    return user


@app.put("/api/users/{user_id}")
def update_user(
    user_id: int, req: UserUpdateRequest, _: dict = Depends(auth.require_admin)
):
    new_hash = auth.hash_password(req.password) if req.password else None
    user, conflict = db.update_user(user_id, req.username, req.email, new_hash)
    if conflict == "username":
        raise HTTPException(status_code=409, detail="用户名已被占用")
    if conflict == "email":
        raise HTTPException(status_code=409, detail="邮箱已被占用")
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    return user


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, _: dict = Depends(auth.require_admin)):
    if not db.delete_user(user_id):
        raise HTTPException(status_code=404, detail="user not found")
