import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface WordDetails {
  phonetic: string;
  partOfSpeech: string;
  translation: string;
  example: string;
}

export async function generateWordDetails(word: string): Promise<WordDetails> {
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

  return JSON.parse(response.text);
}

export async function generatePronunciation(text: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return `data:audio/mp3;base64,${base64Audio}`;
    }
  } catch (error) {
    console.error("Error generating pronunciation:", error);
  }
  return null;
}
