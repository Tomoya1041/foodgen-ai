import { GoogleGenAI, Type } from "@google/genai";
import { OAuth2Client } from "google-auth-library";

const oauthClient = new OAuth2Client();

const sendJson = (res, status, payload) => {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
};

const getBearerToken = (req) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice("Bearer ".length).trim();
};

const verifyUser = async (idToken) => {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new Error("GOOGLE_CLIENT_ID is not set.");
  const ticket = await oauthClient.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new Error("Invalid user token.");
  return payload;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    const idToken = getBearerToken(req);
    if (!idToken) return sendJson(res, 401, { error: "ログインが必要です。" });
    await verifyUser(idToken);

    const { base64Image } = req.body || {};
    if (!base64Image || typeof base64Image !== "string") {
      return sendJson(res, 400, { error: "画像データが不正です。" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: "サーバー設定が不足しています。" });

    const ai = new GoogleGenAI({ apiKey });
    const mimeType = base64Image.match(/data:(.*?);/)?.[1] || "image/png";
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image.split(",")[1],
              mimeType,
            },
          },
          {
            text:
              "この料理写真を分析し、プロのグラフィックデザイナーが制作したような最高峰のデザインコンセプトを4つ提案してください。以下の4つのバリエーションを含めること：\n1. 『ラグジュアリー・エディトリアル』（高級誌の1ページのような静寂と余白）\n2. 『モダン・ミニマル』（洗練された細いラインとタイポグラフィ）\n3. 『都会的なポップ』（参考画像のような鮮やかなバッジと活気ある配色）\n4. 『トラディショナル・クラシック』（温かみのある明朝体と伝統的なレイアウト）\n\n各コンセプトについてJSONで出力してください：\n- id: ユニークなID\n- label: 洗練された日本語のタイトル\n- description: デザインの狙いと期待される効果\n- prompt: 背景生成用の英語プロンプト。料理を中央に配置し、全体がしっかり収まるように指示すること。\n- layoutStyle: 'TOP_CENTER', 'BOTTOM_LEFT', 'OVERLAY_CENTER', 'SIDE_BAR', 'POP_ART' から選択。\n- fontStyle: 'SANS' (ゴシック) または 'SERIF' (明朝)。\n- themeColor: そのコンセプトに最適なアクセントカラー（16進数）",
          },
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
              layoutStyle: {
                type: Type.STRING,
                enum: ["TOP_CENTER", "BOTTOM_LEFT", "OVERLAY_CENTER", "SIDE_BAR", "POP_ART"],
              },
              fontStyle: { type: Type.STRING, enum: ["SANS", "SERIF"] },
              themeColor: { type: Type.STRING },
            },
            required: ["id", "label", "description", "prompt", "layoutStyle", "fontStyle", "themeColor"],
          },
        },
      },
    });

    let concepts = [];
    try {
      concepts = JSON.parse(response.text || "[]");
    } catch {
      concepts = [];
    }
    return sendJson(res, 200, { concepts });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "デザイン案の生成に失敗しました。" });
  }
}
