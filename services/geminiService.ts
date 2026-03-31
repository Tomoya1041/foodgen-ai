
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_RULES, PROMPTS, ASPECT_RATIOS } from "../constants";
import { GenerationMode, AssetOption, ImageSize, DesignConcept } from "../types";

export const generateDesignConcepts = async (base64Image: string, apiKey: string): Promise<DesignConcept[]> => {
  const ai = new GoogleGenAI({ apiKey });
  const mimeType = base64Image.match(/data:(.*?);/)?.[1] || 'image/png';
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Image.split(',')[1],
            mimeType: mimeType,
          },
        },
        {
          text: "この料理写真を分析し、プロのグラフィックデザイナーが制作したような最高峰のデザインコンセプトを4つ提案してください。以下の4つのバリエーションを含めること：\n1. 『ラグジュアリー・エディトリアル』（高級誌の1ページのような静寂と余白）\n2. 『モダン・ミニマル』（洗練された細いラインとタイポグラフィ）\n3. 『都会的なポップ』（参考画像のような鮮やかなバッジと活気ある配色）\n4. 『トラディショナル・クラシック』（温かみのある明朝体と伝統的なレイアウト）\n\n各コンセプトについてJSONで出力してください：\n- id: ユニークなID\n- label: 洗練された日本語のタイトル\n- description: デザインの狙いと期待される効果\n- prompt: 背景生成用の英語プロンプト。料理を中央に配置し、全体がしっかり収まるように指示すること。\n- layoutStyle: 'TOP_CENTER', 'BOTTOM_LEFT', 'OVERLAY_CENTER', 'SIDE_BAR', 'POP_ART' から選択。\n- fontStyle: 'SANS' (ゴシック) または 'SERIF' (明朝)。\n- themeColor: そのコンセプトに最適なアクセントカラー（16進数）"
        }
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            label: { type: Type.STRING },
            description: { type: Type.STRING },
            prompt: { type: Type.STRING },
            layoutStyle: { type: Type.STRING, enum: ['TOP_CENTER', 'BOTTOM_LEFT', 'OVERLAY_CENTER', 'SIDE_BAR', 'POP_ART'] },
            fontStyle: { type: Type.STRING, enum: ['SANS', 'SERIF'] },
            themeColor: { type: Type.STRING }
          },
          required: ['id', 'label', 'description', 'prompt', 'layoutStyle', 'fontStyle', 'themeColor']
        }
      }
    }
  });

  try {
    const text = response.text || "[]";
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse design concepts", e);
    return [];
  }
};

export const generateFoodImage = async (
  base64Image: string,
  mode: GenerationMode,
  size: ImageSize,
  apiKey: string,
  assetOption?: AssetOption,
  concept?: DesignConcept,
  customInstructions?: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  
  let basePrompt = mode === GenerationMode.MENU ? PROMPTS.MENU_BASE : 
                   assetOption === AssetOption.SIZZLE ? PROMPTS.ASSET_SIZZLE : PROMPTS.ASSET_PRO;
  
  const conceptPrompt = concept ? `Directional Concept: ${concept.label}. Professional instructions: ${concept.prompt}. Must prioritize centering the subject to ensure it is fully visible.` : "";
  
  const fullPrompt = `${SYSTEM_RULES}\n\nPrimary Objective: ${basePrompt}\n${conceptPrompt}\n\nUser Notes: ${customInstructions || "None"}\n\nStrict Rule: DO NOT GENERATE ANY TEXT. ONLY PHOTOGRAPHY.`;

  const mimeType = base64Image.match(/data:(.*?);/)?.[1] || 'image/png';

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image.split(',')[1],
              mimeType: mimeType,
            },
          },
          { text: fullPrompt }
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: ASPECT_RATIOS[size] as any,
          imageSize: "1K"
        }
      },
    });

    let generatedBase64 = '';
    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData?.data) {
          generatedBase64 = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!generatedBase64) throw new Error("画像が生成されませんでした。");
    return generatedBase64;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("KEY_RESET_REQUIRED");
    }
    throw error;
  }
};
