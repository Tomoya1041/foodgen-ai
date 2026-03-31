
export enum GenerationMode {
  MENU = 'MENU',
  ASSET = 'ASSET'
}

export enum ImageSize {
  FLYER = 'FLYER', // 3:4
  MOBILE_4_3 = 'MOBILE_4_3', // 4:3
  SQUARE = 'SQUARE', // 1:1
  FLYER_LONG = 'FLYER_LONG', // 7:10
  FLYER_1_1_4 = 'FLYER_1_1_4' // 1:1.4
}

export enum AssetOption {
  PRO = 'PRO',
  SIZZLE = 'SIZZLE'
}

export interface MenuText {
  title: string;
  subtitle: string;
  price: string;
}

export interface DesignConcept {
  id: string;
  label: string;
  description: string;
  prompt: string;
  layoutStyle: 'TOP_CENTER' | 'BOTTOM_LEFT' | 'OVERLAY_CENTER' | 'SIDE_BAR' | 'POP_ART';
  fontStyle: 'SANS' | 'SERIF';
  themeColor?: string;
}

export interface Job {
  id: string;
  timestamp: number;
  mode: GenerationMode;
  originalImageUrl: string;
  generatedImageUrl: string;
  finalImageUrl: string;
  size: ImageSize;
  text?: MenuText;
  concept?: DesignConcept;
}
