-- Migration 0004: Add ETag support to weather_snapshots
-- Adds etag column to enable HTTP ETag caching for WeatherAPI.com requests

ALTER TABLE weather_snapshots ADD COLUMN etag TEXT;

-- Create index on location and forecast_time for efficient ETag lookups
CREATE INDEX idx_weather_snapshots_cache_key ON weather_snapshots(location, forecast_time);
