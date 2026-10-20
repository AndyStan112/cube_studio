import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal

from bson import ObjectId
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field
from pymongo import AsyncMongoClient
from .domain import ALGORITHM_SETS, ALGORITHMS, scramble
from .auth import current_user, router as auth_router

@asynccontextmanager
async def lifespan(app):
    app.state.client = AsyncMongoClient(os.getenv("MONGO_URL", "mongodb://localhost:27017"), serverSelectionTimeoutMS=5000, tz_aware=True)
    app.state.db = app.state.client["cube_studio"]
    await app.state.db.solves.create_index([("user_id", 1), ("created_at", -1)])
    await app.state.db.scrambles.create_index("expires_at", expireAfterSeconds=0)
    yield
    await app.state.client.close()

app = FastAPI(title="Cube Studio API", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)

class SolveInput(BaseModel):
    scramble_id: str
    time_ms: int = Field(gt=0, le=86400000)
    penalty: Literal["none", "+2", "DNF"] = "none"

class PenaltyInput(BaseModel):
    penalty: Literal["none", "+2", "DNF"]

def oid(value):
    if not ObjectId.is_valid(value):
        raise HTTPException(422, "Invalid record ID")
    return ObjectId(value)

@app.get('/api/health')
async def health():
    await app.state.db.command("ping")
    return {"status": "ok"}

@app.get('/api/algorithm-catalog')
async def algorithm_catalog():
    return {"sets": ALGORITHM_SETS, "algorithms": [
        {**item, "set_ids": [membership["set_id"] for membership in item["memberships"]]}
        for item in ALGORITHMS
    ]}

@app.get('/api/algorithms')
async def algorithms():
    # Keep installed prototype clients working until they accept the PWA update.
    set_names = {item["id"]: item["name"] for item in ALGORITHM_SETS}
    return [
        {"id": item["id"], "name": item["name"], "description": item["description"],
         "set": set_names[item["memberships"][0]["set_id"]], "moves": item["variations"][0]["moves"]}
        for item in ALGORITHMS
    ]

@app.post('/api/scrambles', status_code=201)
async def new_scramble():
    doc = {"moves": scramble(), "event": "333", "expires_at": datetime.now(timezone.utc) + timedelta(days=7)}
    result = await app.state.db.scrambles.insert_one(doc)
    return {"id": str(result.inserted_id), "moves": doc["moves"], "event": "333"}

@app.get('/api/solves')
async def solves(user=Depends(current_user)):
    docs = await app.state.db.solves.find({"user_id": user.id}).sort("created_at", -1).limit(1000).to_list(1000)
    return [serialize_solve(doc) for doc in docs]

def serialize_solve(doc):
    return {"id": str(doc["_id"]), "scramble": doc["scramble"], "time_ms": doc["time_ms"], "penalty": doc["penalty"], "created_at": doc["created_at"].isoformat()}

@app.post('/api/solves', status_code=201)
async def save_solve(data: SolveInput, user=Depends(current_user)):
    scramble_doc = await app.state.db.scrambles.find_one({"_id": oid(data.scramble_id), "expires_at": {"$gt": datetime.now(timezone.utc)}})
    if not scramble_doc:
        raise HTTPException(422, "Scramble expired. Generate a new one.")
    doc = {"user_id": user.id, "scramble": scramble_doc["moves"], "event": "333", "time_ms": data.time_ms, "penalty": data.penalty, "created_at": datetime.now(timezone.utc)}
    doc["_id"] = (await app.state.db.solves.insert_one(doc)).inserted_id
    return serialize_solve(doc)

@app.patch('/api/solves/{solve_id}')
async def edit_penalty(solve_id: str, data: PenaltyInput, user=Depends(current_user)):
    result = await app.state.db.solves.update_one({"_id": oid(solve_id), "user_id": user.id}, {"$set": {"penalty": data.penalty}})
    if not result.matched_count:
        raise HTTPException(404, "Solve not found")
    return {"status": "ok"}

@app.delete('/api/solves/{solve_id}', status_code=204)
async def delete_solve(solve_id: str, user=Depends(current_user)):
    result = await app.state.db.solves.delete_one({"_id": oid(solve_id), "user_id": user.id})
    if not result.deleted_count:
        raise HTTPException(404, "Solve not found")
