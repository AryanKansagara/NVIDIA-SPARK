from fastapi import FastAPI

from app.api.router import api_router

app = FastAPI(
    title="Meridian Backend",
    version="0.1.0",
    description="Backend API for Meridian true cost of ownership reports.",
)

app.include_router(api_router, prefix="/api/v1")
