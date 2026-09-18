from datetime import datetime, timezone
import logging
import os
import uuid
from pathlib import Path
from typing import Any, List, Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]
JWT_SECRET = os.getenv("JWT_SECRET", "anatomy-explorer-development-secret")
JWT_ALGORITHM = "HS256"
security = HTTPBearer(auto_error=False)

app = FastAPI(title="Anatomy 3D Explorer API")
api_router = APIRouter(prefix="/api")


class AuthInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    created_at: str


class AuthResponse(BaseModel):
    token: str
    user: UserPublic


class Organ(BaseModel):
    id: str
    name: str
    category: str
    description: str
    function: str
    fact: str
    model_url: Optional[str] = None
    accent: str


ORGANS = [
    Organ(
        id="lungs",
        name="Lungs",
        category="Respiratory system",
        description="A branching network built for every breath.",
        function="Exchange oxygen and carbon dioxide",
        fact="Adults breathe around 22,000 times each day.",
        model_url="https://glittering-bublanina-243c34.netlify.app/",
        accent="blue",
    ),
    Organ(
        id="heart",
        name="Heart",
        category="Circulatory system",
        description="The steady pump that moves life through you.",
        function="Circulate blood around the body",
        fact="Your heart beats about 100,000 times daily.",
        accent="red",
    ),
    Organ(
        id="liver",
        name="Liver",
        category="Digestive system",
        description="A resilient multitasker that keeps chemistry balanced.",
        function="Process nutrients and filter blood",
        fact="The liver performs more than 500 vital functions.",
        accent="amber",
    ),
    Organ(
        id="kidney",
        name="Kidneys",
        category="Urinary system",
        description="A precise filtration pair working quietly all day.",
        function="Filter waste and balance fluids",
        fact="Each kidney contains roughly one million nephrons.",
        accent="pink",
    ),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def public_user(document: dict[str, Any]) -> UserPublic:
    return UserPublic(
        id=document["id"], email=document["email"], created_at=document["created_at"]
    )


def make_token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "exp": datetime.now(timezone.utc).timestamp() + 60 * 60 * 24 * 30},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


async def current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> Optional[UserPublic]:
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
    except (jwt.PyJWTError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    document = await db.users.find_one({"id": user_id}, {"_id": 0})
    return public_user(document) if document else None


@api_router.get("/")
async def root():
    return {"message": "Anatomy 3D Explorer API"}


@api_router.post("/auth/signup", response_model=AuthResponse, status_code=201)
async def signup(input: AuthInput):
    email = input.email.lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    document = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": bcrypt.hashpw(input.password.encode(), bcrypt.gensalt()).decode(),
        "created_at": now_iso(),
    }
    await db.users.insert_one(document)
    user = public_user(document)
    return AuthResponse(token=make_token(user.id), user=user)


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(input: AuthInput):
    document = await db.users.find_one({"email": input.email.lower()}, {"_id": 0})
    valid = document and bcrypt.checkpw(input.password.encode(), document["password_hash"].encode())
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user = public_user(document)
    return AuthResponse(token=make_token(user.id), user=user)


@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: Optional[UserPublic] = Depends(current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


@api_router.get("/organs", response_model=List[Organ])
async def get_organs():
    return ORGANS


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()