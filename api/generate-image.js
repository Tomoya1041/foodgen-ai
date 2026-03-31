import { GoogleGenAI } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import { Redis } from "@upstash/redis";

const DAILY_LIMIT = 7;
const oauthClient = new OAuth2Client();
const redis = Redis.fromEnv();

const SYSTEM_RULES = `
- PROTECT THE CORE ASSET: Never alter the actual food item from the uploaded image.
- NO TRANSFORMATIONS: Preserve the exact shape, color, and texture of the food.
- COMPOSITION: Always place the main food item in the center of the frame. Ensure the subject is fully visible and not cut off at the edges.
- EDITORIAL QUALITY: High-end commercial food photography (Vogue Food style).
- LIGHTING: Soft studio side-lighting, natural shadows, professional color grading.
- BACKGROUND: Minimalist, clean, and elegant. Must not contain text, logos, or distracting elements.
- NO TEXT: Do not generate any letters, characters, or symbols on the image.
- DEPTH: Use a shallow depth of field to make the food stand out against a creamy, sophisticated background.
`;

const ASPECT_RATIOS = {
  FLYER: "3:4",
  MOBILE_4_3: "4:3",
  SQUARE: "1:1",
  FLYER_LONG: "3:4",
  FLYER_1_1_4: "3:4",
};

const PROMPTS = {
  ASSET_PRO:
    "Commercial high-end food photography for luxury magazine. Soft lighting, centered composition, blurred professional background.",
  ASSET_SIZZLE:
    "Ultra-macro food photography showing glistening textures, steam, and vibrant fresh details. Focus on appetite appeal, centered subject.",
  MENU_BASE:
    "Editorial graphic design canvas. The main dish is positioned in the center to ensure it is fully visible and not cut off. Clean, modern, high-contrast lighting, 8k resolution photography. NO TEXT.",
};

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

const getJstDateKey = () => {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
};

const isIntegerLike = (value) => /^-?\d+$/.test(String(value));

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  let quotaKey = "";
  let didIncrement = false;

  try {
    const idToken = getBearerToken(req);
    if (!idToken) return sendJson(res, 401, { error: "ログインが必要です。" });
    const user = await verifyUser(idToken);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: "サーバー設定が不足しています。" });

    const { base64Image, mode, size, assetOption, concept, customInstructions } = req.body || {};
    if (!base64Image || !mode || !size) {
      return sendJson(res, 400, { error: "リクエストデータが不足しています。" });
    }

    quotaKey = `quota:${user.sub}:${getJstDateKey()}`;
    const rawQuotaValue = await redis.get(quotaKey);
    if (rawQuotaValue !== null && !isIntegerLike(rawQuotaValue)) {
      // 手動編集などで quota キーが整数以外になると INCR が失敗するため自動で初期化する。
      await redis.del(quotaKey);
    }
    const currentCount = await redis.incr(quotaKey);
    didIncrement = true;
    if (currentCount === 1) {
      await redis.expire(quotaKey, 60 * 60 * 48);
    }
    if (currentCount > DAILY_LIMIT) {
      return sendJson(res, 429, { error: "本日の生成上限（7回）に達しました。", remainingDailyQuota: 0 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const basePrompt =
      mode === "MENU" ? PROMPTS.MENU_BASE : assetOption === "SIZZLE" ? PROMPTS.ASSET_SIZZLE : PROMPTS.ASSET_PRO;
    const conceptPrompt = concept
      ? `Directional Concept: ${concept.label}. Professional instructions: ${concept.prompt}. Must prioritize centering the subject to ensure it is fully visible.`
      : "";
    const fullPrompt = `${SYSTEM_RULES}\n\nPrimary Objective: ${basePrompt}\n${conceptPrompt}\n\nUser Notes: ${
      customInstructions || "None"
    }\n\nStrict Rule: DO NOT GENERATE ANY TEXT. ONLY PHOTOGRAPHY.`;
    const mimeType = base64Image.match(/data:(.*?);/)?.[1] || "image/png";

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: {
        parts: [{ inlineData: { data: base64Image.split(",")[1], mimeType } }, { text: fullPrompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: ASPECT_RATIOS[size] || "1:1",
          imageSize: "1K",
        },
      },
    });

    let generatedBase64 = "";
    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData?.data) {
          generatedBase64 = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
          break;
        }
      }
    }
    if (!generatedBase64) throw new Error("画像が生成されませんでした。");

    return sendJson(res, 200, {
      imageUrl: generatedBase64,
      remainingDailyQuota: Math.max(0, DAILY_LIMIT - currentCount),
    });
  } catch (error) {
    console.error(error);
    if (didIncrement && quotaKey) {
      try {
        await redis.decr(quotaKey);
      } catch (rollbackError) {
        console.error("quota rollback failed", rollbackError);
      }
    }
    return sendJson(res, 500, { error: "生成に失敗しました。時間をおいて再度お試しください。" });
  }
}
