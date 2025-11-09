-- Migration 0002: Seed Training Thresholds
-- Inserts baseline weather minimums for three training levels
-- Levels: student (most restrictive), private, instrument (least restrictive)

-- Student pilot thresholds - Most restrictive VFR requirements
INSERT INTO training_thresholds (training_level, max_wind_speed, min_visibility, min_ceiling, description)
VALUES ('student', 10, 5.0, 3000, 'Student pilot VFR requirements');

-- Private pilot thresholds - Standard VFR minimums
INSERT INTO training_thresholds (training_level, max_wind_speed, min_visibility, min_ceiling, description)
VALUES ('private', 15, 3.0, 1500, 'Private pilot VFR minimums');

-- Instrument pilot thresholds - Instrument approach minimums
INSERT INTO training_thresholds (training_level, max_wind_speed, min_visibility, min_ceiling, description)
VALUES ('instrument', 20, 1.0, 500, 'Instrument approach minimums');
