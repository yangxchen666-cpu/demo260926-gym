"""Venue directory API."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query

from . import db


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.pool.open()
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
