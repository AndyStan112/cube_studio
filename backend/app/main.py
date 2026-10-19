import hashlib
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal

from bson import ObjectId
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from pymongo import AsyncMongoClient
from pymongo.errors import DuplicateKeyError
from .domain import ALGORITHMS, scramble

@asynccontextmanager
async def lifespan(app):
    app.state.client = AsyncMongoClient(os.getenv("MONGO_URL", "mongodb://localhost:27017"), serverSelectionTimeoutMS=5000, tz_aware=True)
    app.state.db = app.state.client["cube_studio"]
    await app.state.db.users.create_index("email", unique=True)
    await app.state.db.sessions.create_index("expires_at", expireAfterSeconds=0)
    await app.state.db.sessions.create_index("token_hash", unique=True)
    await app.state.db.solves.create_index([("user_id", 1), ("created_at", -1)])
    await app.state.db.scrambles.create_index("expires_at", expireAfterSeconds=0)
    yield
    await app.state.client.close()

app = FastAPI(title="Cube Studio API", version="0.1.0", lifespan=lifespan)
auth = HTTPBearer(auto_error=False)

class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

class Register(Credentials):
    name: str = Field(min_length=1, max_length=60)

class SolveInput(BaseModel):
    scramble_id: str
    time_ms: int = Field(gt=0, le=86400000)
    penalty: Literal["none", "+2", "DNF"] = "none"

class PenaltyInput(BaseModel):
    penalty: Literal["none", "+2", "DNF"]

def public_user(user):
    return {"id": str(user["_id"]), "name": user["name"], "email": user["email"]}

def oid(value):
    if not ObjectId.is_valid(value):
        raise HTTPException(422, "Invalid record ID")
    return ObjectId(value)

def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()

async def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(auth)):
    if not credentials:
        raise HTTPException(401, "Sign in to save your practice")
    session = await app.state.db.sessions.find_one({"token_hash": hashlib.sha256(credentials.credentials.encode()).hexdigest(), "expires_at": {"$gt": datetime.now(timezone.utc)}})
    if not session:
        raise HTTPException(401, "Session expired. Please sign in again.")
    user = await app.state.db.users.find_one({"_id": session["user_id"]})
    if not user:
        raise HTTPException(401, "User no longer exists")
    return user

async def session_response(user):
    token = secrets.token_urlsafe(32)
    await app.state.db.sessions.insert_one({"token_hash": hashlib.sha256(token.encode()).hexdigest(), "user_id": user["_id"], "expires_at": datetime.now(timezone.utc) + timedelta(days=30)})
    return {"token": token, "user": public_user(user)}

@app.get('/api/health')
async def health():
    await app.state.db.command("ping")
    return {"status": "ok"}

@app.post('/api/auth/register', status_code=201)
async def register(data: Register):
    name = data.name.strip()
    if not name:
        raise HTTPException(422, "Name cannot be blank")
    salt = secrets.token_hex(16)
    user = {"name": name, "email": str(data.email).lower(), "salt": salt, "password_hash": password_hash(data.password, salt)}
    try:
        user["_id"] = (await app.state.db.users.insert_one(user)).inserted_id
    except DuplicateKeyError:
        raise HTTPException(409, "An account with this email already exists")
    return await session_response(user)

@app.post('/api/auth/login')
async def login(data: Credentials):
    user = await app.state.db.users.find_one({"email": str(data.email).lower()})
    if not user or not secrets.compare_digest(user["password_hash"], password_hash(data.password, user["salt"])):
        raise HTTPException(401, "Incorrect email or password")
    return await session_response(user)

@app.get('/api/auth/me')
async def me(user=Depends(current_user)):
    return public_user(user)

@app.post('/api/auth/logout', status_code=204)
async def logout(credentials: HTTPAuthorizationCredentials = Depends(auth), user=Depends(current_user)):
    await app.state.db.sessions.delete_one({"token_hash": hashlib.sha256(credentials.credentials.encode()).hexdigest()})

@app.get('/api/algorithms')
async def algorithms():
    return ALGORITHMS

@app.post('/api/scrambles', status_code=201)
async def new_scramble():
    doc = {"moves": scramble(), "event": "333", "expires_at": datetime.now(timezone.utc) + timedelta(days=7)}
    result = await app.state.db.scrambles.insert_one(doc)
    return {"id": str(result.inserted_id), "moves": doc["moves"], "event": "333"}

@app.get('/api/solves')
async def solves(user=Depends(current_user)):
    docs = await app.state.db.solves.find({"user_id": user["_id"]}).sort("created_at", -1).limit(1000).to_list(1000)
    return [serialize_solve(doc) for doc in docs]

def serialize_solve(doc):
    return {"id": str(doc["_id"]), "scramble": doc["scramble"], "time_ms": doc["time_ms"], "penalty": doc["penalty"], "created_at": doc["created_at"].isoformat()}

@app.post('/api/solves', status_code=201)
async def save_solve(data: SolveInput, user=Depends(current_user)):
    scramble_doc = await app.state.db.scrambles.find_one({"_id": oid(data.scramble_id), "expires_at": {"$gt": datetime.now(timezone.utc)}})
    if not scramble_doc:
        raise HTTPException(422, "Scramble expired. Generate a new one.")
    doc = {"user_id": user["_id"], "scramble": scramble_doc["moves"], "event": "333", "time_ms": data.time_ms, "penalty": data.penalty, "created_at": datetime.now(timezone.utc)}
    doc["_id"] = (await app.state.db.solves.insert_one(doc)).inserted_id
    return serialize_solve(doc)

@app.patch('/api/solves/{solve_id}')
async def edit_penalty(solve_id: str, data: PenaltyInput, user=Depends(current_user)):
    result = await app.state.db.solves.update_one({"_id": oid(solve_id), "user_id": user["_id"]}, {"$set": {"penalty": data.penalty}})
    if not result.matched_count:
        raise HTTPException(404, "Solve not found")
    return {"status": "ok"}

@app.delete('/api/solves/{solve_id}', status_code=204)
async def delete_solve(solve_id: str, user=Depends(current_user)):
    result = await app.state.db.solves.delete_one({"_id": oid(solve_id), "user_id": user["_id"]})
    if not result.deleted_count:
        raise HTTPException(404, "Solve not found")
