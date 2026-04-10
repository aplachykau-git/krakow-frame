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

function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
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
  }, [imageSrc, theme, customColor, hasBelka, hasStopka, zapraszajacyCount, zapr1Text, zapr2Text, belkaText, sponsorLogos]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const loadFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
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

  const getBoxColors = () => {
    switch (theme) {
      case 'blue': return { boxColor: '#005baa', textColor: '#ffffff' };
      case 'negative': return { boxColor: '#ffffff', textColor: '#005baa' };
      case 'achromatic-black': return { boxColor: '#000000', textColor: '#ffffff' };
      case 'achromatic-white': return { boxColor: '#ffffff', textColor: '#000000' };
      case 'custom': return { boxColor: customColor, textColor: '#ffffff' };
      default: return { boxColor: '#005baa', textColor: '#ffffff' };
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
      canvas.height = img.height + footerH;

      // White background (covers footer area)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Base image
      ctx.drawImage(img, 0, 0);

      // ── Belka ──
      if (hasBelka) {
        const bY = img.height - 1.0 * U;
        const bH = 0.5 * U;
        ctx.fillStyle = boxColor;
        ctx.fillRect(M, bY, img.width - 2 * M, bH);
        const text = belkaText.toUpperCase().trim();
        ctx.fillStyle = textColor;
        ctx.font = `bold ${0.22 * U}px Lato, sans-serif`;
        (ctx as any).letterSpacing = '0.05em';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, img.width / 2, bY + bH / 2);
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
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(zaprX, blockY, zaprW, zaprBlockH);

          const lines = text.split('\n').map(l => l.trim()).filter(l => l);
          const fontSize = 0.11 * U;    // sized to fit 3 lines inside 0.6U block
          const lineH = fontSize * 1.2; // tight but readable line spacing
          const totalTextH = lines.length * lineH;
          const startY = blockY + zaprBlockH / 2 - totalTextH / 2 + lineH / 2;

          ctx.fillStyle = '#005baa';
          ctx.font = `bold ${fontSize}px Lato, sans-serif`;
          (ctx as any).letterSpacing = '0.005em'; // very tight, nearly zero tracking
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          lines.forEach((line, i) => {
            ctx.fillText(line.toUpperCase(), zaprX + zaprW / 2, startY + i * lineH);
          });
          (ctx as any).letterSpacing = '0px';
        };

        drawZaprBlock(zapr1Text, zaprY1);

        if (zapraszajacyCount === 2) {
          // Thin 1px separator line then second block directly after (no colored gap)
          const separatorY = zaprY1 + zaprBlockH;
          ctx.fillStyle = '#c8d8ea';
          ctx.fillRect(zaprX, separatorY, zaprW, 1);
          drawZaprBlock(zapr2Text, separatorY + 1);
        }
      }

      // ── Standard Frame (drawn AFTER zapraszający so frame line is on top of white boxes) ──
      ctx.strokeStyle = frameColor;
      ctx.lineWidth = S;
      ctx.lineJoin = 'miter';
      ctx.strokeRect(M + strokeOffset, M + strokeOffset, img.width - 2 * M - S, img.height - 2 * M - S);

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
          const footerY = img.height + footerPad;
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
  }, [imageSrc, theme, customColor, hasBelka, hasStopka, zapraszajacyCount, zapr1Text, zapr2Text, belkaText, sponsorLogos]);

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

    // ── Vector frame ──
    let elements = `<rect x="${M+so}" y="${M+so}" width="${w-2*M-S}" height="${totalH-2*M-S}" stroke="${frameColor}" stroke-width="${S}" fill="none" stroke-linejoin="miter"/>`;

    // ── Belka ──
    if (hasBelka) {
      const bY = totalH - U; const bH = 0.5 * U;
      elements += `\n<rect x="${M}" y="${bY}" width="${w-2*M}" height="${bH}" fill="${boxColor}"/>`;
      elements += `\n<text x="${w/2}" y="${bY+bH/2}" fill="${textColor}" font-family="Lato,sans-serif" font-weight="bold" font-size="${0.22*U}" letter-spacing="0.05em" text-anchor="middle" dominant-baseline="central">${belkaText.toUpperCase().trim()}</text>`;
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

    // NOTE: We use BOTH xlink:href (Illustrator/legacy) and href (Figma/modern) on the image.
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${totalH}" width="${w}" height="${totalH}">
  <rect width="${w}" height="${totalH}" fill="#ffffff"/>
  <image xlink:href="${imageSrc}" href="${imageSrc}" x="0" y="0" width="${w}" height="${totalH}" preserveAspectRatio="none"/>
  ${elements}
  ${logoElement}
</svg>`;
  };

  // ── Layer helpers ──
  const zaprLabel = zapraszajacyCount === 0 ? t.zaprTile
    : zapraszajacyCount === 1 ? `${t.zaprTile} ×1`
    : `${t.zaprTile} ×2`;

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

          <div className="settings-panel">
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
                  <span className="layer-tile-label">{zaprLabel}</span>
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
                <label>{t.zaprText1Label}</label>
                <textarea
                  value={zapr1Text}
                  onChange={e => setZapr1Text(e.target.value)}
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
                  onChange={e => setZapr2Text(e.target.value)}
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
                <input
                  type="text"
                  value={belkaText}
                  onChange={e => setBelkaText(e.target.value)}
                  className="text-input"
                  placeholder={t.belkaPlaceholder}
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
