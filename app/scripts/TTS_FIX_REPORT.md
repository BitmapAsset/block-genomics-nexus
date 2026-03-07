# TTS Voice Speed Controls Fix Report

## Problem Summary
Telegram voice notes (with playback speed controls) require OGG/Opus format, but Edge TTS only outputs MP3.

## Root Cause Analysis

### Finding 1: Edge TTS OGG formats don't work
Tested Microsoft Edge TTS output formats:

| Format | Result |
|--------|--------|
| `ogg-48khz-16bit-mono-opus` | ❌ **Timeout** - format not supported |
| `ogg-24khz-16bit-mono-opus` | ❌ **Timeout** - format not supported |
| `webm-24khz-16bit-mono-opus` | ✅ Works - outputs WebM container |
| `audio-24khz-48kbitrate-mono-mp3` | ✅ Works - outputs MP3 |

**Microsoft's Edge TTS service does NOT support OGG container output**, despite accepting the format string. The request silently times out.

### Finding 2: Current Config Causes Fallback to MP3
The config `"outputFormat": "ogg-48khz-16bit-mono-opus"` triggers this behavior:
1. OpenClaw tries the OGG format
2. Edge TTS times out (service doesn't support it)
3. OpenClaw falls back to default MP3 format
4. MP3 is delivered as audio file (no voice bubble, no speed controls)

### Finding 3: Voice Compatibility Check
`isVoiceCompatibleAudio()` in OpenClaw only accepts:
- File extensions: `.oga`, `.ogg`, `.opus`
- MIME types containing: `ogg` or `opus`

WebM files (which Edge TTS CAN produce with Opus codec) are NOT considered voice-compatible.

## Solution Options

### Option A: Patch OpenClaw (Recommended)
**Changes needed in `/opt/homebrew/lib/node_modules/openclaw/dist/tts/tts.js`:**

1. Use working Edge format: `webm-24khz-16bit-mono-opus`
2. Add ffmpeg post-processing to convert WebM→OGG:

```javascript
// After Edge TTS generates audio, if channel is Telegram and format is WebM:
if (channelId === 'telegram' && edgeResult.outputFormat.includes('webm')) {
    const oggPath = audioPath.replace(/\.webm$/, '.ogg');
    await execPromise(`ffmpeg -i "${audioPath}" -c:a libopus -b:a 48k "${oggPath}" -y`);
    // Use oggPath instead of audioPath
}
```

### Option B: Use OpenAI TTS Provider
If you have an OpenAI API key, the OpenAI provider outputs `.opus` directly:
```json
"tts": {
  "provider": "openai",
  "openai": {
    "voice": "onyx"
  }
}
```
**Downside**: Costs money per request.

### Option C: Local TTS with Custom Endpoint
Set up a local TTS server (Kokoro, LocalAI) that outputs OGG/Opus:
```bash
export OPENAI_TTS_BASE_URL=http://localhost:8880/v1
```
Then configure:
```json
"tts": {
  "provider": "openai",
  "openai": {
    "voice": "your-voice-id"
  }
}
```

### Option D: Simple Config Fix (Partial)
Change config to use WebM (works with Edge TTS):
```json
"edge": {
  "outputFormat": "webm-24khz-16bit-mono-opus"
}
```
**Problem**: WebM won't trigger voice bubble in Telegram. Still need OpenClaw code change.

## Immediate Workaround
Until OpenClaw is patched, the only working option for voice bubble with speed controls is:
1. Use **OpenAI** or **ElevenLabs** TTS provider (both output Opus directly)
2. Or accept MP3 audio files (no speed controls)

## Proposed Pull Request for OpenClaw

**File**: `dist/tts/tts.js`

Add this function after imports:
```javascript
import { execSync } from "node:child_process";

async function convertToOgg(inputPath, outputPath) {
    try {
        execSync(`ffmpeg -i "${inputPath}" -c:a libopus -b:a 48k "${outputPath}" -y`, {
            stdio: 'pipe'
        });
        unlinkSync(inputPath);
        return true;
    } catch {
        return false;
    }
}
```

In the `textToSpeech` function, after Edge TTS succeeds, add:
```javascript
// For Telegram channel, convert non-OGG formats to OGG for voice bubble support
if (channelId === 'telegram' && !isVoiceCompatibleAudio({ fileName: edgeResult.audioPath })) {
    const oggPath = edgeResult.audioPath.replace(/\.[^.]+$/, '.ogg');
    if (await convertToOgg(edgeResult.audioPath, oggPath)) {
        edgeResult.audioPath = oggPath;
    }
}
```

---
**Generated**: 2026-02-04
**Author**: TTS Fix Subagent
