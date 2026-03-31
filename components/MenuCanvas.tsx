
import React, { useEffect, useRef, memo } from 'react';
import { MenuText, DesignConcept, ImageSize } from '../types';

interface MenuCanvasProps {
  imageUrl: string;
  text: MenuText;
  concept: DesignConcept;
  size: ImageSize;
  onExport: (dataUrl: string) => void;
  className?: string;
}

const MenuCanvas = ({ imageUrl, text, concept, size, onExport, className }: MenuCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastParamsRef = useRef<string>("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl || !concept) return;
    
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const currentParams = JSON.stringify({ imageUrl, text, concept, size });
    if (lastParamsRef.current === currentParams) return;
    
    let isMounted = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;

    img.onload = () => {
      if (!isMounted) return;

      try {
        let targetW = img.width;
        let targetH = img.height;
        if (size === ImageSize.FLYER_1_1_4) targetH = Math.round(targetW * 1.4);
        else if (size === ImageSize.FLYER_LONG) targetH = Math.round(targetW * 1.428);

        canvas.width = targetW;
        canvas.height = targetH;
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // 背景写真描画
        const scale = Math.max(targetW / img.width, targetH / img.height);
        const x = (targetW - img.width * scale) / 2;
        const y = (targetH - img.height * scale) / 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        const w = canvas.width;
        const h = canvas.height;
        const padding = w * 0.06;
        const themeColor = concept.themeColor || '#FFD700';
        
        const sansFont = '"Noto Sans JP", sans-serif';
        const serifFont = '"Noto Serif JP", serif';
        const primaryFont = concept.fontStyle === 'SERIF' ? serifFont : sansFont;

        // デザイン・オーバーレイ開始
        const layout = concept.layoutStyle;

        // 1. バッジデザイン (参考画像1, 3風)
        if (layout === 'TOP_CENTER' || layout === 'POP_ART') {
          const badgeSize = w * 0.28;
          const badgeX = w - badgeSize * 0.7;
          const badgeY = badgeSize * 0.7;

          ctx.save();
          ctx.translate(badgeX, badgeY);
          if (layout === 'POP_ART') ctx.rotate(-0.05);

          // 影
          ctx.shadowColor = 'rgba(0,0,0,0.2)';
          ctx.shadowBlur = 40;
          ctx.shadowOffsetY = 10;
          
          // メイン円
          ctx.fillStyle = themeColor;
          ctx.beginPath();
          ctx.arc(0, 0, badgeSize / 2, 0, Math.PI * 2);
          ctx.fill();
          
          // 縁取り
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = w * 0.01;
          ctx.stroke();

          // テキスト
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = (parseInt(themeColor.replace('#',''), 16) > 0xffffff / 2) ? '#000' : '#fff';
          
          ctx.font = `bold ${badgeSize * 0.12}px ${sansFont}`;
          ctx.fillText('RECOMMENDED', 0, -badgeSize * 0.15);
          ctx.font = `900 ${badgeSize * 0.2}px ${sansFont}`;
          ctx.fillText('SPECIAL', 0, 5);
          ctx.font = `bold ${badgeSize * 0.1}px ${sansFont}`;
          ctx.fillText('MENU', 0, badgeSize * 0.18);
          ctx.restore();
        }

        // 2. 情報帯レイアウト (参考画像1, 2の融合)
        if (layout === 'TOP_CENTER' || layout === 'POP_ART' || layout === 'SIDE_BAR') {
          const bandH = h * 0.18;
          const bandY = h - bandH - padding;
          const bandX = padding;
          const bandW = w - padding * 2;

          // 半透明ホワイトパネル (参考画像1風)
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.1)';
          ctx.shadowBlur = 50;
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.fillRect(bandX, bandY, bandW, bandH);
          
          // アクセントの縦線
          ctx.fillStyle = themeColor;
          ctx.fillRect(bandX, bandY, 8, bandH);

          // テキスト配置
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          
          if (text.title) {
            ctx.fillStyle = '#1a202c';
            ctx.font = `900 ${h * 0.038}px ${primaryFont}`;
            ctx.fillText(text.title, bandX + w * 0.04, bandY + bandH * 0.35);
          }
          
          if (text.subtitle) {
            ctx.fillStyle = '#64748b';
            ctx.font = `bold ${h * 0.014}px ${sansFont}`;
            ctx.fillText(text.subtitle, bandX + w * 0.04, bandY + bandH * 0.65);
          }
          
          if (text.price) {
            ctx.textAlign = 'right';
            ctx.fillStyle = '#000';
            ctx.font = `900 ${h * 0.05}px ${sansFont}`;
            ctx.fillText(`¥${text.price}`, w - padding - w * 0.04, bandY + bandH * 0.5);
            
            // 税込表示
            ctx.font = `bold ${h * 0.01}px ${sansFont}`;
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('TAX INCLUDED', w - padding - w * 0.04, bandY + bandH * 0.75);
          }
          ctx.restore();
        }

        // 3. 全面オーバーレイ (参考画像2風のダイナミックレイアウト)
        if (layout === 'BOTTOM_LEFT') {
          // 下部グラデーション
          const grad = ctx.createLinearGradient(0, h * 0.3, 0, h);
          grad.addColorStop(0, 'transparent');
          grad.addColorStop(1, 'rgba(0,0,0,0.8)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, h * 0.3, w, h * 0.7);

          // メインタイトル
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          
          if (text.title) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `900 ${h * 0.065}px ${primaryFont}`;
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 20;
            ctx.fillText(text.title, padding, h - padding - h * 0.12);
            
            // アンダーライン
            ctx.shadowBlur = 0;
            ctx.fillStyle = themeColor;
            ctx.fillRect(padding, h - padding - h * 0.11, w * 0.3, 4);
          }
          
          if (text.price) {
            ctx.fillStyle = themeColor;
            ctx.font = `900 ${h * 0.08}px ${sansFont}`;
            ctx.fillText(`¥${text.price}`, padding, h - padding);
          }
          
          // 装飾パターン (ドット)
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = '#ffffff';
          for(let i=0; i<6; i++) {
            for(let j=0; j<6; j++) {
              ctx.beginPath();
              ctx.arc(padding + i*20, padding + j*20, 2, 0, Math.PI*2);
              ctx.fill();
            }
          }
          ctx.globalAlpha = 1.0;
        }

        // 4. 中央フローティング (参考画像なし、独自のラグジュアリースタイル)
        if (layout === 'OVERLAY_CENTER') {
          const boxW = w * 0.75;
          const boxH = h * 0.25;
          const boxX = (w - boxW) / 2;
          const boxY = (h - boxH) / 2;

          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.15)';
          ctx.shadowBlur = 60;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(boxX, boxY, boxW, boxH);
          
          // 二重枠
          ctx.strokeStyle = themeColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(boxX + 12, boxY + 12, boxW - 24, boxH - 24);
          ctx.strokeRect(boxX + 18, boxY + 18, boxW - 36, boxH - 36);

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (text.title) {
            ctx.fillStyle = '#1a202c';
            ctx.font = `900 ${h * 0.045}px ${primaryFont}`;
            ctx.letterSpacing = '0.15em';
            ctx.fillText(text.title, w / 2, boxY + boxH * 0.38);
          }
          if (text.price) {
            ctx.fillStyle = '#000';
            ctx.font = `900 ${h * 0.06}px ${sansFont}`;
            ctx.fillText(`¥${text.price}`, w / 2, boxY + boxH * 0.72);
          }
          ctx.restore();
        }

        const finalDataUrl = canvas.toDataURL('image/png', 1.0);
        lastParamsRef.current = currentParams;
        onExport(finalDataUrl);
      } catch (err) {
        console.error("Canvas rendering error:", err);
      }
    };

    return () => { isMounted = false; };
  }, [imageUrl, text, concept, size, onExport]);

  return (
    <canvas 
      ref={canvasRef} 
      className={`max-w-full h-auto shadow-2xl rounded-sm ${className}`}
      style={{ display: 'block', maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain' }} 
    />
  );
};

export default memo(MenuCanvas);
