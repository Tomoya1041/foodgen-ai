
import { ImageSize } from './types';

export const SYSTEM_RULES = `
- PROTECT THE CORE ASSET: Never alter the actual food item from the uploaded image.
- NO TRANSFORMATIONS: Preserve the exact shape, color, and texture of the food.
- COMPOSITION: Always place the main food item in the center of the frame. Ensure the subject is fully visible and not cut off at the edges.
- EDITORIAL QUALITY: High-end commercial food photography (Vogue Food style). 
- LIGHTING: Soft studio side-lighting, natural shadows, professional color grading.
- BACKGROUND: Minimalist, clean, and elegant. Must not contain text, logos, or distracting elements.
- NO TEXT: Do not generate any letters, characters, or symbols on the image.
- DEPTH: Use a shallow depth of field to make the food stand out against a creamy, sophisticated background.
`;

export const ASPECT_RATIOS: Record<ImageSize, string> = {
  [ImageSize.FLYER]: "3:4",
  [ImageSize.MOBILE_4_3]: "4:3",
  [ImageSize.SQUARE]: "1:1",
  [ImageSize.FLYER_LONG]: "3:4", // API mapped
  [ImageSize.FLYER_1_1_4]: "3:4" // API mapped
};

export const PROMPTS = {
  ASSET_PRO: "Commercial high-end food photography for luxury magazine. Soft lighting, centered composition, blurred professional background.",
  ASSET_SIZZLE: "Ultra-macro food photography showing glistening textures, steam, and vibrant fresh details. Focus on appetite appeal, centered subject.",
  MENU_BASE: "Editorial graphic design canvas. The main dish is positioned in the center to ensure it is fully visible and not cut off. Clean, modern, high-contrast lighting, 8k resolution photography. NO TEXT."
};
