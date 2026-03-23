import { GoogleGenAI, Type, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface WordDetails {
  phonetic: string;
  partOfSpeech: string;
  translation: string;
  example: string;
}

export async function generateWordDetails(word: string): Promise<WordDetails> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Provide details for the English word: "${word}". 
      Include phonetic transcription, part of speech, Vietnamese translation, and a simple example sentence in English.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            phonetic: { type: Type.STRING },
            partOfSpeech: { type: Type.STRING },
            translation: { type: Type.STRING },
            example: { type: Type.STRING },
          },
          required: ["phonetic", "partOfSpeech", "translation", "example"],
        },
      },
    });

    const text = response.text;
    // Clean up potential markdown blocks
    const cleanJson = text.replace(/```json\n?|```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Error generating word details:", error);
    throw new Error("Không thể lấy thông tin từ vựng từ AI. Vui lòng kiểm tra lại từ hoặc thử lại sau.");
  }
}

// Convert raw PCM (Linear16) base64 audio to a WAV data URL that browsers can play
function pcmToWavDataUrl(base64Pcm: string, sampleRate: number = 24000, numChannels: number = 1, bitsPerSample: number = 16): string {
  // Decode base64 to binary
  const binaryString = atob(base64Pcm);
  const pcmBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    pcmBytes[i] = binaryString.charCodeAt(i);
  }

  const dataLength = pcmBytes.length;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  // Create WAV header (44 bytes)
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Sub-chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write PCM data
  const wavBytes = new Uint8Array(buffer);
  wavBytes.set(pcmBytes, 44);

  // Convert to base64
  let wavBinary = '';
  for (let i = 0; i < wavBytes.length; i++) {
    wavBinary += String.fromCharCode(wavBytes[i]);
  }
  return `data:audio/wav;base64,${btoa(wavBinary)}`;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export async function generatePronunciation(text: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part?.inlineData?.data) {
      const base64Audio = part.inlineData.data;
      const mimeType = part.inlineData.mimeType || '';

      // Gemini TTS returns audio/L16 (raw PCM) — browsers can't play this directly.
      // We need to wrap it in a WAV container with proper headers.
      if (mimeType.includes('L16') || mimeType.includes('pcm') || mimeType.includes('raw')) {
        // Parse sample rate from mimeType if available (e.g. "audio/L16;rate=24000")
        const rateMatch = mimeType.match(/rate=(\d+)/);
        const sampleRate = rateMatch ? parseInt(rateMatch[1]) : 24000;
        return pcmToWavDataUrl(base64Audio, sampleRate);
      }

      // For other formats (mp3, wav, etc.), use as-is
      return `data:${mimeType};base64,${base64Audio}`;
    }
  } catch (error) {
    console.error("Error generating pronunciation:", error);
  }
  return null;
}

// Fallback: use browser's built-in speech synthesis
export function speakWithBrowserTTS(text: string): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // Stop any ongoing speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }
}
