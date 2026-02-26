import type { Request, Response } from 'express';
import { textToSpeech, isTtsAvailable } from '../services/tts.js';

export async function ttsRoute(req: Request, res: Response) {
  if (!isTtsAvailable()) {
    res.status(503).json({ error: 'TTS not configured. Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.' });
    return;
  }

  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Text is required' });
    return;
  }

  if (text.length > 5000) {
    res.status(400).json({ error: 'Text too long (max 5000 characters)' });
    return;
  }

  try {
    const audio = await textToSpeech(text);
    if (!audio) {
      res.status(500).json({ error: 'Failed to generate speech' });
      return;
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length);
    res.send(audio);
  } catch (error) {
    console.error('TTS route error:', error);
    res.status(500).json({ error: 'TTS generation failed' });
  }
}
