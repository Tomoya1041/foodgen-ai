
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

const hex2rgb = (hex: string): [number, number, number] => {
  const h = (hex || '#000000').replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) || 0,
    parseInt(h.substring(2, 4), 16) || 0,
    parseInt(h.substring(4, 6), 16) || 0,
  ];
};

const isLight = (hex: string): boolean => {
  const [r, g, b] = hex2rgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
};

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

// Letter-spacing emulation for canvas
const fillTextTracked = (
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  tracking: number,
  align: 'left' | 'center' | 'right' = 'left'
) => {
  if (!str) return;
  const chars = str.split('');
  const widths = chars.map(ch => ctx.measureText(ch).width + tracking);
  const totalW = widths.reduce((a, b) => a + b, 0) - tracking;
  let cx = align === 'center' ? x - totalW / 2 : align === 'right' ? x - totalW : x;
  const savedAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((ch, i) => {
    ctx.fillText(ch, cx, y);
    cx += widths[i];
  });
  ctx.textAlign = savedAlign;
};

const MenuCanvas = ({ imageUrl, text, concept, size, onExport, className }: MenuCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastParamsRef = useRef<string>('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl || !concept) return;

    const currentParams = JSON.stringify({ imageUrl, text, concept, size });
    if (lastParamsRef.current === currentParams) return;

    let isMounted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;

    img.onload = async () => {
      if (!isMounted) return;

      try {
        // Ensure fonts are loaded before drawing
        await document.fonts.ready.catch(() => {});

        let targetW = img.width;
        let targetH = img.height;
        if (size === ImageSize.FLYER_1_1_4) targetH = Math.round(targetW * 1.4);
        else if (size === ImageSize.FLYER_LONG) targetH = Math.round(targetW * 1.428);

        canvas.width = targetW;
        canvas.height = targetH;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const w = canvas.width;
        const h = canvas.height;

        const theme    = concept.themeColor   || '#C8A96E';
        const bgPanel  = concept.bgPanelColor || '#FAFAF7';
        const textCol  = concept.textColor    || '#1A1A1A';
        const layout   = concept.layoutStyle;

        const sans  = '"Noto Sans JP", sans-serif';
        const serif = '"Noto Serif JP", serif';
        const pFont = concept.fontStyle === 'SERIF' ? serif : sans;

        // Helper: draw full-bleed image
        const drawFullBleed = () => {
          const scale = Math.max(w / img.width, h / img.height);
          const ix = (w - img.width * scale) / 2;
          const iy = (h - img.height * scale) / 2;
          ctx.fillStyle = bgPanel;
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, ix, iy, img.width * scale, img.height * scale);
        };

        // ─────────────────────────────────────────────────────
        // TOP_CENTER — Luxury Editorial Panel
        // Image top 65%, clean panel bottom 35%
        // ─────────────────────────────────────────────────────
        if (layout === 'TOP_CENTER') {
          const panelH = h * 0.33;
          const imgH   = h - panelH;
          const pad    = w * 0.07;

          // Panel background
          ctx.fillStyle = bgPanel;
          ctx.fillRect(0, 0, w, h);

          // Image clipped to top zone
          const scale = Math.max(w / img.width, imgH / img.height);
          const ix = (w - img.width * scale) / 2;
          const iy = (imgH - img.height * scale) / 2;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, w, imgH);
          ctx.clip();
          ctx.drawImage(img, ix, iy, img.width * scale, img.height * scale);
          ctx.restore();

          // Accent line separator
          ctx.fillStyle = theme;
          ctx.fillRect(0, imgH, w, 2.5);

          // Panel content
          const panelTop = imgH + 2.5;
          const midY = panelTop + panelH / 2;

          // Title
          if (text.title) {
            const titleSize = Math.min(h * 0.068, panelH * 0.3);
            ctx.save();
            ctx.font = `900 ${titleSize}px ${pFont}`;
            ctx.fillStyle = textCol;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(text.title, pad, midY - panelH * 0.1);
            ctx.restore();
          }

          // Subtitle with tracking
          if (text.subtitle) {
            const subSize = Math.max(h * 0.016, 12);
            ctx.save();
            ctx.font = `500 ${subSize}px ${sans}`;
            ctx.fillStyle = theme;
            ctx.textBaseline = 'middle';
            fillTextTracked(ctx, text.subtitle.toUpperCase(), pad, midY + panelH * 0.14, subSize * 0.25, 'left');
            ctx.restore();
          }

          // Thin rule left-side
          ctx.save();
          ctx.strokeStyle = theme;
          ctx.lineWidth = 0.8;
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.moveTo(pad, midY + panelH * 0.28);
          ctx.lineTo(w * 0.45, midY + panelH * 0.28);
          ctx.stroke();
          ctx.restore();

          // Price — right side
          if (text.price) {
            const priceSize = Math.min(h * 0.082, panelH * 0.38);
            ctx.save();
            ctx.font = `100 ${priceSize}px ${sans}`;
            ctx.fillStyle = textCol;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(`¥${text.price}`, w - pad, midY - panelH * 0.06);
            // Tax label
            ctx.font = `300 ${priceSize * 0.16}px ${sans}`;
            ctx.fillStyle = '#aaaaaa';
            fillTextTracked(ctx, 'TAX INCLUDED', w - pad, midY + panelH * 0.24, 1.5, 'right');
            ctx.restore();
          }

          // Decorative corner brackets on panel
          ctx.save();
          ctx.strokeStyle = theme;
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = 0.4;
          const bs = w * 0.028;
          const bPad = pad * 0.55;
          // top-left bracket
          ctx.beginPath(); ctx.moveTo(bPad, panelTop + bPad); ctx.lineTo(bPad, panelTop + bPad + bs); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(bPad, panelTop + bPad); ctx.lineTo(bPad + bs, panelTop + bPad); ctx.stroke();
          // bottom-right bracket
          ctx.beginPath(); ctx.moveTo(w - bPad, panelTop + panelH - bPad); ctx.lineTo(w - bPad, panelTop + panelH - bPad - bs); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(w - bPad, panelTop + panelH - bPad); ctx.lineTo(w - bPad - bs, panelTop + panelH - bPad); ctx.stroke();
          ctx.restore();
        }

        // ─────────────────────────────────────────────────────
        // BOTTOM_LEFT — Modern Editorial Dark
        // Full-bleed image, dark gradient, left-aligned type
        // ─────────────────────────────────────────────────────
        else if (layout === 'BOTTOM_LEFT') {
          drawFullBleed();

          const pad = w * 0.07;

          // Bottom gradient overlay
          const grad = ctx.createLinearGradient(0, h * 0.35, 0, h);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
          grad.addColorStop(1, 'rgba(0,0,0,0.82)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, h * 0.35, w, h * 0.65);

          // Dot grid decoration — top-right
          ctx.save();
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = '#ffffff';
          const dsp = w * 0.022;
          for (let di = 0; di < 6; di++) {
            for (let dj = 0; dj < 5; dj++) {
              ctx.beginPath();
              ctx.arc(w - pad - di * dsp, pad + dj * dsp, 1.4, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();

          // Subtitle above title
          if (text.subtitle) {
            const subSize = Math.max(h * 0.018, 11);
            ctx.save();
            ctx.font = `500 ${subSize}px ${sans}`;
            ctx.fillStyle = theme;
            ctx.textBaseline = 'bottom';
            fillTextTracked(ctx, text.subtitle.toUpperCase(), pad, h - pad - h * 0.24, subSize * 0.3, 'left');
            ctx.restore();
          }

          // Title
          if (text.title) {
            const titleSize = Math.min(h * 0.075, w * 0.13);
            ctx.save();
            ctx.font = `900 ${titleSize}px ${pFont}`;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.shadowColor = 'rgba(0,0,0,0.4)';
            ctx.shadowBlur = 24;
            ctx.fillText(text.title, pad, h - pad - h * 0.115);
            ctx.restore();
          }

          // Accent line
          ctx.save();
          ctx.fillStyle = theme;
          ctx.fillRect(pad, h - pad - h * 0.1, w * 0.22, 2);
          ctx.restore();

          // Price
          if (text.price) {
            const priceSize = Math.min(h * 0.062, w * 0.1);
            ctx.save();
            ctx.font = `100 ${priceSize}px ${sans}`;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`¥${text.price}`, pad, h - pad * 0.7);
            ctx.restore();
          }
        }

        // ─────────────────────────────────────────────────────
        // OVERLAY_CENTER — Frosted Luxury
        // Full-bleed image, semi-opaque center panel, double frame
        // ─────────────────────────────────────────────────────
        else if (layout === 'OVERLAY_CENTER') {
          drawFullBleed();

          const boxW = w * 0.72;
          const boxH = h * 0.34;
          const boxX = (w - boxW) / 2;
          const boxY = (h - boxH) / 2;
          const pad  = w * 0.05;

          // Panel shadow
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.25)';
          ctx.shadowBlur = 80;
          ctx.shadowOffsetY = 12;
          const [pr, pg, pb] = hex2rgb(bgPanel);
          ctx.fillStyle = `rgba(${pr},${pg},${pb},0.93)`;
          ctx.fillRect(boxX, boxY, boxW, boxH);
          ctx.restore();

          // Outer border
          ctx.save();
          ctx.strokeStyle = theme;
          ctx.lineWidth = 0.8;
          ctx.globalAlpha = 0.6;
          ctx.strokeRect(boxX + 10, boxY + 10, boxW - 20, boxH - 20);
          // Inner border
          ctx.globalAlpha = 0.2;
          ctx.strokeRect(boxX + 17, boxY + 17, boxW - 34, boxH - 34);
          ctx.restore();

          // Corner marks (L-shape)
          ctx.save();
          ctx.strokeStyle = theme;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.85;
          const cm = 14;
          [
            [boxX + 10, boxY + 10,  1,  1],
            [boxX + boxW - 10, boxY + 10, -1,  1],
            [boxX + 10, boxY + boxH - 10,  1, -1],
            [boxX + boxW - 10, boxY + boxH - 10, -1, -1],
          ].forEach(([cx, cy, dx, dy]) => {
            ctx.beginPath(); ctx.moveTo(cx + dx * cm, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * cm); ctx.stroke();
          });
          ctx.restore();

          const cY = boxY + boxH / 2;
          ctx.textAlign = 'center';

          // Subtitle (top of panel)
          if (text.subtitle) {
            const subSize = Math.max(h * 0.016, 11);
            ctx.save();
            ctx.font = `500 ${subSize}px ${sans}`;
            ctx.fillStyle = theme;
            ctx.globalAlpha = 0.85;
            ctx.textBaseline = 'middle';
            fillTextTracked(ctx, text.subtitle.toUpperCase(), w / 2, cY - boxH * 0.3, subSize * 0.28, 'center');
            ctx.restore();
          }

          // Thin rule above title
          ctx.save();
          ctx.strokeStyle = theme;
          ctx.lineWidth = 0.6;
          ctx.globalAlpha = 0.25;
          ctx.beginPath();
          ctx.moveTo(boxX + boxW * 0.2, cY - boxH * 0.16);
          ctx.lineTo(boxX + boxW * 0.8, cY - boxH * 0.16);
          ctx.stroke();
          ctx.restore();

          // Title
          if (text.title) {
            const titleSize = Math.min(h * 0.058, boxH * 0.3);
            ctx.save();
            ctx.font = `900 ${titleSize}px ${pFont}`;
            ctx.fillStyle = textCol;
            ctx.textBaseline = 'middle';
            ctx.fillText(text.title, w / 2, cY - boxH * 0.02);
            ctx.restore();
          }

          // Diamond divider
          ctx.save();
          ctx.fillStyle = theme;
          ctx.globalAlpha = 0.6;
          const dmSize = 4;
          ctx.beginPath();
          ctx.moveTo(w / 2, cY + boxH * 0.17 - dmSize);
          ctx.lineTo(w / 2 + dmSize, cY + boxH * 0.17);
          ctx.lineTo(w / 2, cY + boxH * 0.17 + dmSize);
          ctx.lineTo(w / 2 - dmSize, cY + boxH * 0.17);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // Price
          if (text.price) {
            const priceSize = Math.min(h * 0.055, boxH * 0.28);
            ctx.save();
            ctx.font = `100 ${priceSize}px ${sans}`;
            ctx.fillStyle = textCol;
            ctx.textBaseline = 'middle';
            ctx.fillText(`¥${text.price}`, w / 2, cY + boxH * 0.34);
            ctx.restore();
          }
        }

        // ─────────────────────────────────────────────────────
        // SIDE_BAR — Vertical Editorial Panel
        // Left panel + right image
        // ─────────────────────────────────────────────────────
        else if (layout === 'SIDE_BAR') {
          const sideW = w * 0.31;
          const pad   = w * 0.046;

          // Base fill
          ctx.fillStyle = bgPanel;
          ctx.fillRect(0, 0, w, h);

          // Image — right zone
          const imgZoneW = w - sideW;
          const scale = Math.max(imgZoneW / img.width, h / img.height);
          const ix = sideW + (imgZoneW - img.width * scale) / 2;
          const iy = (h - img.height * scale) / 2;
          ctx.save();
          ctx.beginPath();
          ctx.rect(sideW, 0, imgZoneW, h);
          ctx.clip();
          ctx.drawImage(img, ix, iy, img.width * scale, img.height * scale);
          ctx.restore();

          // Side panel
          const [sr, sg, sb] = hex2rgb(bgPanel);
          ctx.fillStyle = `rgba(${sr},${sg},${sb},0.97)`;
          ctx.fillRect(0, 0, sideW, h);

          // Right edge accent line
          ctx.fillStyle = theme;
          ctx.fillRect(sideW - 2.5, 0, 2.5, h);

          const cx = sideW / 2;
          ctx.textAlign = 'center';

          // Top thin rule
          ctx.save();
          ctx.strokeStyle = theme;
          ctx.lineWidth = 0.6;
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.moveTo(pad, h * 0.14);
          ctx.lineTo(sideW - pad, h * 0.14);
          ctx.stroke();
          ctx.restore();

          // Title — word-wrapped
          if (text.title) {
            const titleSize = Math.min(sideW * 0.13, h * 0.044);
            ctx.save();
            ctx.font = `900 ${titleSize}px ${pFont}`;
            ctx.fillStyle = textCol;
            ctx.textBaseline = 'middle';
            const maxLineW = sideW - pad * 2;
            const chars = text.title.split('');
            let line = '';
            let lineY = h * 0.34;
            for (const ch of chars) {
              if (ctx.measureText(line + ch).width > maxLineW && line !== '') {
                ctx.fillText(line, cx, lineY);
                line = ch;
                lineY += titleSize * 1.55;
              } else {
                line += ch;
              }
            }
            ctx.fillText(line, cx, lineY);
            ctx.restore();
          }

          // Subtitle
          if (text.subtitle) {
            const subSize = Math.max(h * 0.013, 10);
            ctx.save();
            ctx.font = `300 ${subSize}px ${sans}`;
            ctx.fillStyle = theme;
            ctx.textBaseline = 'middle';
            fillTextTracked(ctx, text.subtitle.toUpperCase(), cx, h * 0.56, subSize * 0.2, 'center');
            ctx.restore();
          }

          // Middle rule
          ctx.save();
          ctx.strokeStyle = theme;
          ctx.lineWidth = 0.8;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.moveTo(pad * 1.5, h * 0.63);
          ctx.lineTo(sideW - pad * 1.5, h * 0.63);
          ctx.stroke();
          ctx.restore();

          // Price
          if (text.price) {
            const priceSize = Math.min(sideW * 0.17, h * 0.058);
            ctx.save();
            ctx.font = `100 ${priceSize}px ${sans}`;
            ctx.fillStyle = theme;
            ctx.textBaseline = 'middle';
            ctx.fillText(`¥${text.price}`, cx, h * 0.74);
            ctx.restore();
          }

          // Tax label
          ctx.save();
          ctx.font = `300 ${Math.max(h * 0.012, 9)}px ${sans}`;
          ctx.fillStyle = '#b0b0b0';
          ctx.textBaseline = 'middle';
          fillTextTracked(ctx, 'TAX INCLUDED', cx, h * 0.81, 1.2, 'center');
          ctx.restore();

          // Bottom thin rule
          ctx.save();
          ctx.strokeStyle = theme;
          ctx.lineWidth = 0.6;
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.moveTo(pad, h * 0.88);
          ctx.lineTo(sideW - pad, h * 0.88);
          ctx.stroke();
          ctx.restore();
        }

        // ─────────────────────────────────────────────────────
        // POP_ART — Modern Bold Color Band
        // Full-bleed image, bold color band bottom, pill tag
        // ─────────────────────────────────────────────────────
        else if (layout === 'POP_ART') {
          drawFullBleed();

          const pad   = w * 0.06;
          const bandH = h * 0.21;
          const bandY = h - bandH;
          const onTheme = isLight(theme) ? '#000000' : '#ffffff';

          // Left edge vertical accent strip
          ctx.save();
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = theme;
          ctx.fillRect(0, 0, w * 0.016, bandY);
          ctx.restore();

          // Color band
          ctx.fillStyle = theme;
          ctx.fillRect(0, bandY, w, bandH);

          // Diagonal notch on band
          ctx.save();
          ctx.fillStyle = isLight(theme) ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
          ctx.beginPath();
          ctx.moveTo(0, bandY);
          ctx.lineTo(w * 0.4, bandY);
          ctx.lineTo(0, bandY + h * 0.045);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // Title on band
          if (text.title) {
            const titleSize = Math.min(h * 0.065, bandH * 0.42);
            ctx.save();
            ctx.font = `900 ${titleSize}px ${pFont}`;
            ctx.fillStyle = onTheme;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.1)';
            ctx.shadowBlur = 8;
            ctx.fillText(text.title, pad, bandY + bandH * 0.44);
            ctx.restore();
          }

          // Price on band — right
          if (text.price) {
            const priceSize = Math.min(h * 0.06, bandH * 0.38);
            ctx.save();
            ctx.font = `100 ${priceSize}px ${sans}`;
            ctx.fillStyle = onTheme;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(`¥${text.price}`, w - pad, bandY + bandH * 0.44);
            ctx.restore();
          }

          // Thin rule inside band (above text)
          ctx.save();
          ctx.strokeStyle = onTheme;
          ctx.lineWidth = 0.6;
          ctx.globalAlpha = 0.2;
          ctx.beginPath();
          ctx.moveTo(pad, bandY + bandH * 0.15);
          ctx.lineTo(w - pad, bandY + bandH * 0.15);
          ctx.stroke();
          ctx.restore();

          // Subtitle pill tag above band
          if (text.subtitle) {
            const subSize = Math.max(h * 0.017, 11);
            ctx.save();
            ctx.font = `700 ${subSize}px ${sans}`;
            const measured = ctx.measureText(text.subtitle);
            const tagW = measured.width + subSize * 1.8;
            const tagH = subSize * 1.9;
            const tagX = pad;
            const tagY = bandY - tagH - h * 0.015;
            // pill background
            ctx.fillStyle = theme;
            ctx.globalAlpha = 0.92;
            roundRect(ctx, tagX, tagY, tagW, tagH, tagH / 2);
            ctx.fill();
            // pill text
            ctx.globalAlpha = 1;
            ctx.fillStyle = onTheme;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(text.subtitle, tagX + subSize * 0.9, tagY + tagH / 2);
            ctx.restore();
          }
        }

        const finalDataUrl = canvas.toDataURL('image/png', 1.0);
        lastParamsRef.current = currentParams;
        onExport(finalDataUrl);
      } catch (err) {
        console.error('Canvas rendering error:', err);
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
