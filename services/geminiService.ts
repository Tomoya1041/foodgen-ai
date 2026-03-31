
import { AssetOption, DesignConcept, GenerationMode, ImageSize } from "../types";

type GenerateImageResponse = {
  imageUrl: string;
  remainingDailyQuota: number;
};

const parseError = async (response: Response): Promise<string> => {
  try {
    const payload = await response.json();
    return payload?.error || "リクエストに失敗しました。";
  } catch {
    return "リクエストに失敗しました。";
  }
};

export const generateDesignConcepts = async (
  base64Image: string,
  idToken: string
): Promise<DesignConcept[]> => {
  const response = await fetch("/api/design-concepts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ base64Image }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = await response.json();
  return payload.concepts || [];
};

export const generateFoodImage = async (
  base64Image: string,
  mode: GenerationMode,
  size: ImageSize,
  idToken: string,
  assetOption?: AssetOption,
  concept?: DesignConcept,
  customInstructions?: string
): Promise<GenerateImageResponse> => {
  const response = await fetch("/api/generate-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      base64Image,
      mode,
      size,
      assetOption,
      concept,
      customInstructions,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json();
};
