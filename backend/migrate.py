import os
import sys
from sqlalchemy import create_engine, text
from app.config import get_settings

engine = create_engine(get_settings().DATABASE_URL)
with engine.begin() as conn:
    conn.execute(text("ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '{}'::jsonb;"))
print("Migration applied successfully!")
