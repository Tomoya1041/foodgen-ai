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
            text: `この料理写真を詳細に分析し、世界最高水準のフードグラフィックデザイナーが制作するようなメニュー・告知物のデザインコンセプトを4つ提案してください。VOGUE Food、Monocle、Kinfolk等のグローバルプレミアム誌や三ツ星レストランのメニューを参考基準として、各デザインは実際に印刷・配信できるプロクオリティであることが条件です。

以下の4スタイルを必ず含めること：
1.「ラグジュアリー・エディトリアル」: VOGUE Foodの見開きページ風。クリーンな白や生成りのパネル、極細のゴールド/シルバーのアクセントライン、繊細な余白設計。layoutStyle: TOP_CENTER を使用。
2.「モダン・ミニマル」: 三ツ星レストランのメニューカード風。全面写真に上品なグラデーション、左下に整然と積み上げられたタイポグラフィ。layoutStyle: BOTTOM_LEFT を使用。
3.「アーバン・ダイナミック」: 都市型カフェ・ビストロの告知ポスター風。鮮やかなアクセントカラーブロック、大胆で読みやすいサンセリフ、エネルギッシュな構成。layoutStyle: POP_ART を使用。
4.「クラシック・プレミアム」: 老舗高級店の格調あるデザイン。明朝体と薄いセリフの組み合わせ、深みのある中央配置、二重罫線のフレーム。layoutStyle: OVERLAY_CENTER を使用。

各コンセプトのJSON出力に必要なフィールド：
- id: ユニークID（例: "concept_luxury"）
- label: 洗練された日本語タイトル（10字以内）
- description: デザイナーの意図（40字以内、体言止め）
- prompt: 背景生成用英語プロンプト。指定layoutStyleのテキスト配置ゾーンを考慮した構図・照明・スタイリング指示を含めること。料理は必ず画面中央に完全に収めること。NO TEXT, NO LOGOS の制約を明記すること。
- layoutStyle: 上記指定のものを使用
- fontStyle: 'SANS'（モダン・都会的）または 'SERIF'（伝統・格式）
- themeColor: メインアクセントカラー（16進数、例: "#C8A96E"）— デザインの世界観に合う色を厳選
- bgPanelColor: テキストパネルや背景の基調色（16進数、例: "#FAFAF7"）— 料理の色彩と調和すること
- textColor: メインテキストカラー（16進数、例: "#1A1A1A"）— bgPanelColorに対して十分なコントラストを確保`,
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
              bgPanelColor: { type: Type.STRING },
              textColor: { type: Type.STRING },
            },
            required: ["id", "label", "description", "prompt", "layoutStyle", "fontStyle", "themeColor", "bgPanelColor", "textColor"],
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
