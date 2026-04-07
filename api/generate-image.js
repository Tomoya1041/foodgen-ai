import { GoogleGenAI } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import { Redis } from "@upstash/redis";

const DAILY_LIMIT = 7;
const oauthClient = new OAuth2Client();
const redis = Redis.fromEnv();

const SYSTEM_RULES = `
CRITICAL RULES — NEVER VIOLATE:
- FOOD INTEGRITY: The uploaded food item must appear EXACTLY as-is. Preserve every detail: shape, color, texture, portion size, plating style. No alterations, enhancements, or replacements.
- FULL VISIBILITY: The food subject must be completely visible within the frame. Never crop the food at any edge.
- CENTER COMPOSITION: Place the food subject at the center of the frame in all cases.
- ABSOLUTE NO TEXT: Zero tolerance for any letters, characters, numbers, symbols, watermarks, or logos anywhere in the image.
- PROFESSIONAL STANDARD: Output must match the quality of images published in VOGUE Food, Monocle, or Wallpaper magazine editorial spreads.
- LIGHTING: Precise professional studio lighting. Soft directional key light, subtle fill, controlled shadows with depth.
- BACKGROUND: Crafted, purposeful background that complements the food. Never generic or stock-photo-like.
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
    "Luxury commercial food photography for a premium lifestyle magazine. Precise soft-box studio lighting with subtle rim light, shallow depth of field, sophisticated neutral background with fine texture (linen, marble, or brushed concrete). Centered subject, impeccable food styling.",
  ASSET_SIZZLE:
    "Ultra-close food photography capturing appetite-triggering details: glistening sauces, rising steam, fresh herb textures, golden crust crunch. Warm directional lighting, rich saturation, centered hero shot with cinematic depth of field.",
  MENU_BASE:
    "Premium editorial food photography designed as a graphic design canvas for menu or announcement material. The food subject is centered and completely unobstructed. Background is intentionally crafted with depth, texture, and professional color grading to support typographic overlays. Cinematic lighting, magazine-quality styling. NO TEXT, NO LOGOS, NO WATERMARKS.",
};

const LAYOUT_PROMPTS = {
  TOP_CENTER: "Leave the lower 30% of the frame as a clean, uncluttered transition zone. The food occupies the upper and central area with dynamic presence.",
  BOTTOM_LEFT: "Create atmospheric depth especially in the lower-left region. Rich, moody background with strong directional lighting from upper right. The lower area has natural shadow depth suitable for white text overlay.",
  OVERLAY_CENTER: "Balanced, symmetrical composition with visual richness throughout. Background has fine texture and depth. Center area is visually interesting but not overly busy, as it will receive a frosted panel overlay.",
  SIDE_BAR: "Strong right-dominant composition. The right 65% of the frame features the main food subject with dynamic styling. Left side transitions naturally to a softer, less cluttered area.",
  POP_ART: "High-energy, vibrant, fully saturated food photography. Strong hero shot filling 65% of frame from center-top. Bottom 25% of the frame has slightly softer visual weight to allow for a bold color band overlay.",
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
    const layoutHint = mode === "MENU" && concept?.layoutStyle ? LAYOUT_PROMPTS[concept.layoutStyle] || "" : "";
    const conceptPrompt = concept
      ? `Design Direction: "${concept.label}" — ${concept.description}. Composition & Styling Brief: ${concept.prompt}. ${layoutHint}`
      : "";
    const fullPrompt = `${SYSTEM_RULES}\n\nPrimary Objective: ${basePrompt}\n\n${conceptPrompt}\n\nAdditional Art Direction: ${
      customInstructions || "None"
    }\n\nFINAL RULE: ABSOLUTELY NO TEXT, CHARACTERS, OR SYMBOLS OF ANY KIND. PURE PHOTOGRAPHY ONLY.`;
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
