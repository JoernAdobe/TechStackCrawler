-- TechStackCrawler Schema
-- MariaDB / MySQL

CREATE DATABASE IF NOT EXISTS techstack_crawler;
USE techstack_crawler;

-- Analysen (alle durchgeführten Website-Analysen)
CREATE TABLE IF NOT EXISTS analyses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  url VARCHAR(2048) NOT NULL,
  result_json LONGTEXT NOT NULL,
  analyzed_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_analyzed_at (analyzed_at),
  INDEX idx_url (url(255))
);

-- Audio-Cache (TTS-Audio, gecacht um ElevenLabs-API zu schonen)
CREATE TABLE IF NOT EXISTS audio_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  text_hash CHAR(64) NOT NULL UNIQUE,
  audio_data LONGBLOB NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_text_hash (text_hash)
);
