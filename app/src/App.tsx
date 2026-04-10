import { useState, useRef, useEffect, useCallback } from 'react';
import './index.css';
import { calculateDimensions, getThemeColors, type ThemeColor } from './siwMath';
import { jsPDF } from 'jspdf';
import { translations, type Lang } from './i18n';

type ExportFormat = 'png' | 'jpeg' | 'pdf' | 'svg';

interface SponsorLogo {
  id: string;
  src: string;
  name: string;
}

const computeWrappedLines = (
  text: string, 
  availWidth: number, 
  measure: (s: string) => number
): { lines: string[], isTooLong: boolean } => {
  const paragraphs = text.split('\n');
  let lines: string[] = [];
  let isTooLong = false;

  for (const para of paragraphs) {
    if (para === '') { 
      lines.push(''); 
      continue; 
    }
    const words = para.split(' ');
    let currentLine = words[0];
    if (measure(currentLine) > availWidth) {
      isTooLong = true; break;
    }
    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      if (measure(currentLine + " " + word) <= availWidth) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
        if (measure(currentLine) > availWidth) {
          isTooLong = true; break;
        }
      }
    }
    lines.push(currentLine);
    if (isTooLong) break;
  }
  return { lines, isTooLong };
};

function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [rawUploadedSvg, setRawUploadedSvg] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeColor>('blue');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');
  const [lang, setLang] = useState<Lang>('pl');
  const [customColor, setCustomColor] = useState<string>('#ed1c24');
  const t = translations[lang];

  // Additive layer toggles
  const [hasBelka, setHasBelka] = useState(false);
  const [hasStopka, setHasStopka] = useState(false);
  const [zapraszajacyCount, setZapraszajacyCount] = useState<0 | 1 | 2>(0);

  // Zapraszający content — use real newlines so textarea & split work correctly
  const [zapr1Text, setZapr1Text] = useState("JAN KOWALSKI\nPREZYDENT MIASTA KRAKOWA\nZAPRASZA");
  const [zapr2Text, setZapr2Text] = useState("JAN NOWAK\nPRZEWODNICZĄCY RADY MIASTA KRAKOWA\nZAPRASZA");
  const [zaprTransparentBg, setZaprTransparentBg] = useState(false);

  // Belka content
  const [belkaText, setBelkaText] = useState('INSTYTUCJA KULTURY MIASTA KRAKOWA');

  // Stopka content
  const [sponsorLogos, setSponsorLogos] = useState<SponsorLogo[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rawSvgBlueprint = useRef<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/krakow logo with frame.svg')
      .then(r => r.text())
      .then(text => { rawSvgBlueprint.current = text; })
      .then(() => drawCanvas());
  }, []);

  useEffect(() => {
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => drawCanvas());
    } else {
      drawCanvas();
    }
  }, [imageSrc, theme, customColor, hasBelka, hasStopka, zapraszajacyCount, zapr1Text, zapr2Text, zaprTransparentBg, belkaText, sponsorLogos]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const loadFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;

    // Extract raw vector paths if SVG
    if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
      const textReader = new FileReader();
      textReader.onload = ev => setRawUploadedSvg(ev.target?.result as string);
      textReader.readAsText(file);
    } else {
      setRawUploadedSvg(null);
    }

    const reader = new FileReader();
    reader.onload = ev => setImageSrc(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  const handleSponsorLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        setSponsorLogos(prev => [...prev, {
          id: `${Date.now()}-${Math.random()}`,
          src: ev.target?.result as string,
          name: file.name.replace(/\.[^.]+$/, '')
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeSponsorLogo = (id: string) => setSponsorLogos(prev => prev.filter(l => l.id !== id));

  const getBoxColors = useCallback(() => {
    switch (theme) {
      case 'blue': return { boxColor: '#005baa', textColor: '#ffffff' };
      case 'negative': return { boxColor: '#ffffff', textColor: '#005baa' };
      case 'achromatic-black': return { boxColor: '#000000', textColor: '#ffffff' };
      case 'achromatic-white': return { boxColor: '#ffffff', textColor: '#000000' };
      case 'custom': return { boxColor: customColor, textColor: '#ffffff' };
      default: return { boxColor: '#005baa', textColor: '#ffffff' };
    }
  }, [theme, customColor]);

  const validateAndSetText = (newText: string, setter: (val: string) => void, type: 'belka' | 'zapr') => {
    if (!canvasRef.current || !imageSrc) return setter(newText);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return setter(newText);

    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const { U, M } = calculateDimensions(w, h);

    let fontSize, availableW, letterSpacing;
    if (type === 'zapr') {
      fontSize = 0.14 * U;
      const zaprPad = 0.15 * U; // Increased padding for more space from edges
      const logoW = U * (466.944 / 143.38);
      availableW = logoW - 2 * zaprPad;
      letterSpacing = '0.005em';
    } else {
      fontSize = 0.22 * U;
      const paddingX = 1.0 * U;
      availableW = w - 2 * M - paddingX;
      letterSpacing = '0.05em';
    }

    ctx.font = `bold ${fontSize}px Lato, sans-serif`;
    (ctx as any).letterSpacing = letterSpacing;

    const measure = (s: string) => ctx.measureText(s).width;
    const { lines, isTooLong } = computeWrappedLines(newText.toUpperCase(), availableW, measure);

    if (!isTooLong && lines.length <= 3) {
      setter(newText);
    }
  };

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSrc || !rawSvgBlueprint.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      const { U, M, S } = calculateDimensions(img.width, img.height);
      const { frame: defaultFrameColor } = getThemeColors(theme);
      const frameColor = theme === 'custom' ? customColor : defaultFrameColor;
      const { boxColor, textColor } = getBoxColors();
      const strokeOffset = S / 2;

      // Footer area (SIW: 0.25U pad top&bottom, 0.5U logo slot height)
      const footerPad = 0.25 * U;
      const footerLogoH = 0.5 * U;
      const footerH = hasStopka ? footerPad + footerLogoH + footerPad : 0;

      canvas.width = img.width;
      canvas.height = img.height;

      // White background (base canvas)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Base image
      ctx.drawImage(img, 0, 0);

      // ── Stopka Background (Overlaid over the entire bottom) ──
      if (hasStopka) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, img.height - footerH, img.width, footerH);
      }

      // ── Belka ──
      if (hasBelka) {
        const rawText = belkaText.toUpperCase().trim();
        ctx.font = `bold ${0.22 * U}px Lato, sans-serif`;
        (ctx as any).letterSpacing = '0.05em';
        
        const paddingX = 1.0 * U;
        const availableW = img.width - 2 * M - paddingX;
        
        const measure = (s: string) => ctx.measureText(s).width;
        let { lines } = computeWrappedLines(rawText, availableW, measure);
        if (lines.length === 0) lines = [''];
        if (lines.length > 3) lines = lines.slice(0, 3);

        const lineHeight = 0.3 * U;
        const bH = 0.5 * U + (lines.length - 1) * 0.3 * U;
        const stopkaOffset = hasStopka ? footerH : 0;
        const bY = img.height - M - stopkaOffset - bH;

        ctx.fillStyle = boxColor;
        ctx.fillRect(M, bY, img.width - 2 * M, bH);
        
        ctx.fillStyle = textColor;
        (ctx as any).letterSpacing = '0.05em';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const opticalOffsetY = 0.015 * U; // Optical adjustment to center uppercase text visually
        const startY = bY + bH / 2 - (lines.length - 1) * lineHeight / 2 + opticalOffsetY;
        lines.forEach((line, i) => {
          ctx.fillText(line, img.width / 2, startY + i * lineHeight);
        });
        (ctx as any).letterSpacing = '0px';
      }

      // ── Zapraszający ── (drawn BEFORE frame so frame line appears on top)
      // White box(es) below logo apla: same left/width as logo, 0.1U gap
      if (zapraszajacyCount > 0) {
        const logoH = U;
        const logoW = logoH * (466.944 / 143.38);
        const zaprX = M;
        const zaprW = logoW;
        const zaprGap = 0.1 * U;    // gap between logo bottom and first block (= 1/10 of logo H)
        const zaprBlockH = 0.6 * U; // SIW spec: 6/10 of apla height
        const zaprY1 = M + logoH + zaprGap;

        // Helper: draw one white block with centered blue multiline text
        const drawZaprBlock = (text: string, blockY: number) => {
          if (!zaprTransparentBg) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(zaprX, blockY, zaprW, zaprBlockH);
          }

          const rawText = text.toUpperCase().trim();
          const fontSize = 0.14 * U;
          const lineH = fontSize * 1.15;
          ctx.font = `bold ${fontSize}px Lato, sans-serif`;
          (ctx as any).letterSpacing = '0.005em';

          const zaprPad = 0.15 * U; // Increased padding
          const availableW = zaprW - 2 * zaprPad;
          const measure = (s: string) => ctx.measureText(s).width;
          let { lines } = computeWrappedLines(rawText, availableW, measure);
          
          if (lines.length > 3) lines = lines.slice(0, 3);

          const totalTextH = lines.length * lineH;
          const startY = blockY + zaprBlockH / 2 - totalTextH / 2 + lineH / 2;

          ctx.fillStyle = boxColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          lines.forEach((line, i) => {
            ctx.fillText(line.toUpperCase(), zaprX + zaprW / 2, startY + i * lineH);
          });
          (ctx as any).letterSpacing = '0px';
        };

        drawZaprBlock(zapr1Text, zaprY1);

        if (zapraszajacyCount === 2) {
          // Gap of 0.1U between the two blocks
          const zaprY2 = zaprY1 + zaprBlockH + 0.1 * U;
          drawZaprBlock(zapr2Text, zaprY2);
        }
      }

      // ── Standard Frame (drawn AFTER zapraszający so frame line is on top of white boxes) ──
      ctx.strokeStyle = frameColor;
      ctx.lineWidth = S;
      ctx.lineJoin = 'miter';
      const stopkaOffset = hasStopka ? footerH : 0;
      ctx.strokeRect(M + strokeOffset, M + strokeOffset, img.width - 2 * M - S, img.height - stopkaOffset - 2 * M - S);

      // ── Krakow Logo Apla (drawn on top) ──
      const customizedSvg = rawSvgBlueprint.current!
        .replace(/fill="black"/g, `fill="${boxColor}"`)
        .replace(/fill="white"/g, `fill="${textColor}"`);
      const base64Data = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(customizedSvg)))}`;

      const logoImg = new Image();
      logoImg.onload = () => {
        const lH = U;
        const lW = lH * (466.944 / 143.38);
        ctx.drawImage(logoImg, M, M, lW, lH);

        // ── Stopka footer logos ──
        if (hasStopka && sponsorLogos.length > 0) {
          const footerY = img.height - footerH + footerPad;
          const availableW = img.width - 2 * M;
          const gap = 0.25 * U;
          const n = sponsorLogos.length;
          const slotW = (availableW - gap * (n - 1)) / n;

          sponsorLogos.forEach((sl, i) => {
            const sImg = new Image();
            sImg.onload = () => {
              const aspect = sImg.width / sImg.height;
              let dW = slotW, dH = footerLogoH;
              if (aspect > slotW / footerLogoH) dH = dW / aspect;
              else dW = dH * aspect;
              const x = M + i * (slotW + gap) + (slotW - dW) / 2;
              const y = footerY + (footerLogoH - dH) / 2;
              ctx.drawImage(sImg, x, y, dW, dH);
            };
            sImg.src = sl.src;
          });
        }
      };
      logoImg.src = base64Data;
    };
  }, [imageSrc, theme, customColor, hasBelka, hasStopka, zapraszajacyCount, zapr1Text, zapr2Text, zaprTransparentBg, belkaText, sponsorLogos]);

  const handleExport = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSrc) return;

    // Build the content blob for each format
    const getBlob = (): Promise<Blob> => {
      if (exportFormat === 'pdf') {
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [canvas.width, canvas.height]
        });
        pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, canvas.width, canvas.height);
        return Promise.resolve(pdf.output('blob'));
      }
      if (exportFormat === 'svg') {
        const svgSource = generateSVGExport();
        return Promise.resolve(new Blob([svgSource], { type: 'image/svg+xml;charset=utf-8' }));
      }
      const mime = exportFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
      return new Promise(resolve => canvas.toBlob(b => resolve(b!), mime, 1.0));
    };

    const ext    = exportFormat === 'jpeg' ? 'jpg' : exportFormat;
    const name   = `krakow-frame.${ext}`;
    const mimeTypes: Record<string, Record<string, string[]>> = {
      png:  { 'image/png':           ['.png'] },
      jpeg: { 'image/jpeg':          ['.jpg'] },
      svg:  { 'image/svg+xml':       ['.svg'] },
      pdf:  { 'application/pdf':     ['.pdf'] },
    };
    const descriptions: Record<string, string> = {
      png: 'PNG Image', jpeg: 'JPEG Image', svg: 'SVG Vector', pdf: 'PDF Document'
    };

    // ── Try native Save As dialog (Chrome / Edge) ──────────────────────────
    if ('showSaveFilePicker' in window) {
      try {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: name,
          types: [{ description: descriptions[exportFormat], accept: mimeTypes[exportFormat] }],
        });
        const blob = await getBlob();
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return; // user cancelled → do nothing
        // other error → fall through to legacy download
      }
    }

    // ── Legacy fallback (Firefox / Safari) ────────────────────────────────
    const blob = await getBlob();
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const generateSVGExport = (): string => {
    if (!imageSrc || !canvasRef.current || !rawSvgBlueprint.current) return '';
    const w = canvasRef.current.width;
    const totalH = canvasRef.current.height;
    const { U, M, S } = calculateDimensions(w, totalH);
    const { frame: defaultFrameColor } = getThemeColors(theme);
    const frameColor = theme === 'custom' ? customColor : defaultFrameColor;
    const { boxColor, textColor } = getBoxColors();
    const so = S / 2;
    const lH = U;
    const lW = lH * (466.944 / 143.38);

    const footerPad = 0.25 * U;
    const footerLogoH = 0.5 * U;
    const footerH = hasStopka ? footerPad + footerLogoH + footerPad : 0;
    const stopkaOffset = hasStopka ? footerH : 0;

    // ── Vector frame ──
    let elements = `<rect x="${M+so}" y="${M+so}" width="${w-2*M-S}" height="${totalH-stopkaOffset-2*M-S}" stroke="${frameColor}" stroke-width="${S}" fill="none" stroke-linejoin="miter"/>`;

    // ── Stopka Background ──
    if (hasStopka) {
      elements += `\n<rect x="0" y="${totalH - footerH}" width="${w}" height="${footerH}" fill="#ffffff"/>`;
    }

    // ── Belka ──
    if (hasBelka) {
      const rawText = belkaText.toUpperCase().trim();
      
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      let lines = [rawText];
      if (tempCtx) {
        tempCtx.font = `bold ${0.22 * U}px Lato, sans-serif`;
        (tempCtx as any).letterSpacing = '0.05em';
        const paddingX = 1.0 * U;
        const availableW = w - 2 * M - paddingX;
        const measure = (s: string) => tempCtx.measureText(s).width;
        lines = computeWrappedLines(rawText, availableW, measure).lines;
      }
      if (lines.length === 0) lines = [''];
      if (lines.length > 3) lines = lines.slice(0, 3);

      const lineHeight = 0.3 * U;
      const bH = 0.5 * U + (lines.length - 1) * 0.3 * U;
      const bY = totalH - M - stopkaOffset - bH;
      
      elements += `\n<rect x="${M}" y="${bY}" width="${w-2*M}" height="${bH}" fill="${boxColor}"/>`;
      
      const opticalOffsetY = 0.015 * U; // Optical adjustment to center uppercase text visually
      const startY = bY + bH / 2 - (lines.length - 1) * lineHeight / 2 + opticalOffsetY;
      lines.forEach((line, i) => {
        elements += `\n<text x="${w/2}" y="${startY + i * lineHeight}" fill="${textColor}" font-family="Lato,sans-serif" font-weight="bold" font-size="${0.22*U}" letter-spacing="0.05em" text-anchor="middle" dominant-baseline="central">${line}</text>`;
      });
    }

    // ── Zapraszający SVG ──
    if (zapraszajacyCount > 0) {
      const zX = M;
      const zW = lW;
      const zGap = 0.1 * U;
      const zBlockH = 0.6 * U;
      const zY1 = M + lH + zGap;

      const appendZaprSvg = (text: string, bY: number) => {
        if (!zaprTransparentBg) {
          elements += `\n<rect x="${zX}" y="${bY}" width="${zW}" height="${zBlockH}" fill="#ffffff"/>`;
        }
        const rawText = text.toUpperCase().trim();
        const fontSize = 0.14 * U;
        const lineH = fontSize * 1.15;
        
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        let lines = [rawText];
        if (tempCtx) {
          tempCtx.font = `bold ${fontSize}px Lato, sans-serif`;
          (tempCtx as any).letterSpacing = '0.005em';
          const zaprPad = 0.15 * U; // Increased padding
          const availableW = zW - 2 * zaprPad;
          const measure = (s: string) => tempCtx.measureText(s).width;
          lines = computeWrappedLines(rawText, availableW, measure).lines;
        }
        if (lines.length > 3) lines = lines.slice(0, 3);

        const totalTextH = lines.length * lineH;
        const startY = bY + zBlockH / 2 - totalTextH / 2 + lineH / 2;
        
        lines.forEach((line, i) => {
          elements += `\n<text x="${zX + zW / 2}" y="${startY + i * lineH}" fill="${boxColor}" font-family="Lato,sans-serif" font-weight="bold" font-size="${fontSize}" letter-spacing="0.005em" text-anchor="middle" dominant-baseline="central">${line}</text>`;
        });
      };

      appendZaprSvg(zapr1Text, zY1);
      if (zapraszajacyCount === 2) {
        const zY2 = zY1 + zBlockH + 0.1 * U;
        appendZaprSvg(zapr2Text, zY2);
      }
    }

    // ── Inline logo SVG directly (nested <svg>) ──
    // Using a nested <svg> with the original viewBox is the ONLY reliable way to
    // render vector SVG content inside an SVG in both Figma and Illustrator.
    const customizedSvg = rawSvgBlueprint.current
      .replace(/fill="black"/g, `fill="${boxColor}"`)
      .replace(/fill="white"/g, `fill="${textColor}"`);

    const viewBoxMatch = customizedSvg.match(/viewBox="([^"]+)"/);
    const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 466.944 143.38';
    const innerContentMatch = customizedSvg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
    const innerContent = innerContentMatch ? innerContentMatch[1].trim() : '';
    const logoElement = `<svg x="${M}" y="${M}" width="${lW}" height="${lH}" viewBox="${viewBox}" overflow="visible">${innerContent}</svg>`;

    let imageElement = `<image xlink:href="${imageSrc}" href="${imageSrc}" x="0" y="0" width="${w}" height="${totalH}" preserveAspectRatio="none"/>`;
    if (rawUploadedSvg) {
      const srcSvgMatch = rawUploadedSvg.match(/<svg([^>]*)>([\s\S]*?)<\/svg>/i);
      if (srcSvgMatch) {
        let attrs = srcSvgMatch[1];
        // Remove existing x, y, width, height, preserveAspectRatio, overflow so we can safely inject ours
        attrs = attrs.replace(/\b(x|y|width|height|preserveAspectRatio|overflow)="[^"]*"/gi, '');
        imageElement = `<svg x="0" y="0" width="${w}" height="${totalH}" preserveAspectRatio="none" overflow="visible"${attrs}>\n${srcSvgMatch[2]}\n</svg>`;
      }
    }

    // NOTE: We use BOTH xlink:href (Illustrator/legacy) and href (Figma/modern) on the image.
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${totalH}" width="${w}" height="${totalH}">
  <rect width="${w}" height="${totalH}" fill="#ffffff"/>
  ${imageElement}
  ${elements}
  ${logoElement}
</svg>`;
  };

  const layers = [
    { key: 'belka', label: t.belkaTile, active: hasBelka, onAdd: () => setHasBelka(true), onRemove: () => setHasBelka(false) },
    { key: 'stopka', label: t.stopkaTile, active: hasStopka, onAdd: () => setHasStopka(true), onRemove: () => setHasStopka(false) },
  ];

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="brand-header">
          <div className="brand-row">
            <h1 className="title">{t.title}</h1>
            <div className="lang-toggle">
              <button
                className={`lang-btn ${lang === 'pl' ? 'active' : ''}`}
                onClick={() => setLang('pl')}
              >PL</button>
              <button
                className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
                onClick={() => setLang('en')}
              >EN</button>
            </div>
          </div>
        </div>

        <div className="control-section">
          {/* Upload */}
          <div className="control-group">
            <label>{t.uploadArtwork}</label>
            <div className="upload-dropzone">
              <input type="file" id="file-upload" ref={fileInputRef} accept="image/*" onChange={handleImageUpload} />
              <label htmlFor="file-upload" className="upload-label">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="upload-icon">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span>{imageSrc ? t.changeImage : t.browseFiles}</span>
              </label>
            </div>
          </div>

          <div className={`settings-panel ${!imageSrc ? 'disabled' : ''}`}>
            {/* Frame Elements */}
            <div className="control-group">
              <label>{t.frameElements}</label>
              <div className="layer-grid">
                {layers.map(layer => (
                  <div key={layer.key} className={`layer-tile ${layer.active ? 'active' : ''}`}>
                    <span className="layer-tile-label">{layer.label}</span>
                    {layer.active
                      ? <button className="layer-tile-btn remove" onClick={layer.onRemove}>✕</button>
                      : <button className="layer-tile-btn add" onClick={layer.onAdd}>+</button>
                    }
                  </div>
                ))}

                {/* Zapraszający counter tile */}
                <div className={`layer-tile ${zapraszajacyCount > 0 ? 'active' : ''}`}>
                  <span className="layer-tile-label">
                    {t.zaprTile}
                    {zapraszajacyCount > 0 && (
                      <span style={{ display: 'block', fontSize: '0.8em', marginTop: '2px', opacity: 0.8 }}>
                        ×{zapraszajacyCount}
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {zapraszajacyCount > 0 && (
                      <button className="layer-tile-btn remove" onClick={() => setZapraszajacyCount((zapraszajacyCount - 1) as 0 | 1 | 2)}>−</button>
                    )}
                    {zapraszajacyCount < 2 && (
                      <button className="layer-tile-btn add" onClick={() => setZapraszajacyCount((zapraszajacyCount + 1) as 0 | 1 | 2)}>+</button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Zapraszający text inputs */}
            {zapraszajacyCount >= 1 && (
              <div className="control-group layer-option">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', textTransform: 'none', color: 'var(--text-main)', marginBottom: '12px' }}>
                  <input
                    type="checkbox"
                    checked={zaprTransparentBg}
                    onChange={e => setZaprTransparentBg(e.target.checked)}
                  />
                  {(t as any).zaprTransparentBg}
                </label>
                <label>{t.zaprText1Label}</label>
                <textarea
                  value={zapr1Text}
                  onChange={e => validateAndSetText(e.target.value, setZapr1Text, 'zapr')}
                  className="text-input"
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>
            )}
            {zapraszajacyCount === 2 && (
              <div className="control-group layer-option">
                <label>{t.zaprText2Label}</label>
                <textarea
                  value={zapr2Text}
                  onChange={e => validateAndSetText(e.target.value, setZapr2Text, 'zapr')}
                  className="text-input"
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>
            )}

            {/* Belka text input */}
            {hasBelka && (
              <div className="control-group layer-option">
                <label>{t.belkaLabel}</label>
                <textarea
                  value={belkaText}
                  onChange={e => validateAndSetText(e.target.value, setBelkaText, 'belka')}
                  className="text-input"
                  rows={3}
                  style={{ resize: 'vertical' }}
                  placeholder={(t as any).belkaPlaceholder}
                />
              </div>
            )}

            {/* Stopka logo upload */}
            {hasStopka && (
              <div className="control-group layer-option">
                <label>{t.stopkaLabel}</label>
                <div className="upload-dropzone">
                  <input type="file" id="logo-upload" accept="image/*" multiple onChange={handleSponsorLogoUpload} />
                  <label htmlFor="logo-upload" className="upload-label">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="upload-icon">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span>{t.addLogos}</span>
                  </label>
                </div>
                {sponsorLogos.length > 0 && (
                  <div className="logo-chips">
                    {sponsorLogos.map(logo => (
                      <div key={logo.id} className="logo-chip">
                        <img src={logo.src} alt={logo.name} className="logo-chip-img" />
                        <span className="logo-chip-name">{logo.name}</span>
                        <button className="logo-chip-remove" onClick={() => removeSponsorLogo(logo.id)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Color Theme */}
            <div className="control-group">
              <label>{t.colorTheme}</label>
              <div className="select-wrapper">
                <select value={theme} onChange={e => setTheme(e.target.value as ThemeColor)}>
                  <option value="blue">{t.themeBasic}</option>
                  <option value="negative">{t.themeNeg}</option>
                  <option value="achromatic-black">{t.themeAchroBlack}</option>
                  <option value="achromatic-white">{t.themeAchroWhite}</option>
                  <option value="custom">{t.themeCustom}</option>
                </select>
              </div>
              {theme === 'custom' && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <input
                    type="color"
                    value={customColor}
                    onChange={e => setCustomColor(e.target.value)}
                    style={{ width: '40px', height: '40px', padding: '0', border: '1px solid #1f2937', borderRadius: '4px', cursor: 'pointer', background: 'none' }}
                  />
                  <input
                    type="text"
                    value={customColor}
                    onChange={e => setCustomColor(e.target.value)}
                    className="text-input"
                    style={{ flex: 1 }}
                    placeholder="#HEXCODE"
                  />
                </div>
              )}
            </div>

            {/* Export Format */}
            <div className="control-group">
              <label>{t.exportFormat}</label>
              <div className="select-wrapper">
                <select value={exportFormat} onChange={e => setExportFormat(e.target.value as ExportFormat)}>
                  <option value="png">{t.fmtPng}</option>
                  <option value="jpeg">{t.fmtJpeg}</option>
                  <option value="svg">{t.fmtSvg}</option>
                  <option value="pdf">{t.fmtPdf}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <button className="download-btn" onClick={handleExport} disabled={!imageSrc}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="download-icon">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {t.exportResult}
        </button>
      </div>

      <div
        className="preview-area"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {imageSrc ? (
          <div className="canvas-wrapper">
            <canvas ref={canvasRef} className="preview-canvas" />
          </div>
        ) : (
          <div className="drop-zone-wrapper">
            <div
              className={`drop-zone ${isDragging ? 'drag-active' : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
              <svg className="drop-zone-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <h2>{t.dropTitle}</h2>
              <p>{t.dropSub}</p>
              <button
                className="drop-zone-btn"
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                {t.browseFiles}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Font preloader */}
      <div style={{ fontFamily: 'Lato', fontWeight: 'bold', position: 'absolute', opacity: 0, pointerEvents: 'none' }}>.</div>
    </div>
  );
}

export default App;
