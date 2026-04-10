export interface SIWDimensions {
  U: number;
  M: number; // Margin (0.5U)
  S: number; // Stroke (0.1U)
  width: number;
  height: number;
}

export type Orientation = 'vertical' | 'horizontal' | 'square';
export type Variant = 'podstawowa' | 'stopka' | 'apla' | 'belka' | 'bez_ramy';
export type ThemeColor = 'blue' | 'negative' | 'achromatic-black' | 'achromatic-white' | 'custom';

export function calculateDimensions(width: number, height: number): SIWDimensions {
  const isPortrait = height > width;
  const isLandscape = width > height;
  const isExtremeLandscape = isLandscape && width >= 1.5 * height;
  const isExtremePortrait = isPortrait && height >= 2.3 * width;

  let U: number;
  
  // SIW Grid Logic: The logo box width (3.2567 * U) must be exactly 1/5, 1/3, or 1/2 
  // of the INNER frame width (width - U).
  // 1/5 of inner width: 3.2567 U = 0.2 * (W - U)  => 3.4567 U = 0.2 W => U = W / 17.2835
  // 1/3 of inner width: 3.2567 U = 1/3 * (W - U)  => 3.5900 U = 0.333 W => U = W / 10.7701
  // 1/2 of inner width: 3.2567 U = 0.5 * (W - U)  => 3.7567 U = 0.5 W => U = W / 7.5134

  if (isExtremeLandscape) {
    // Exactly 5 logos fit in the inner frame
    U = width / 17.2835;
  } else if (isExtremePortrait) {
    // Exactly 2 logos fit in the inner frame
    U = width / 7.5134;
  } else {
    // Square, Standard Landscape, or Standard Portrait (3 logos fit in the inner frame)
    U = width / 10.7701;
  }
  
  const M = 0.5 * U;
  const S = 0.1 * U;

  return { U, M, S, width, height };
}

export function getThemeColors(theme: ThemeColor) {
  switch (theme) {
    case 'blue':
      return { frame: '#005baa', logo: 'white' }; // Wait, standard is blue frame on white background... logo is blue? Actually standard layout is white logo on blue frame... No, page 25 says "Rama w wersji podstawowej występuje w kolorze niebieskim z logo w wersji podstawowej niebieskiej" wait no "z logo w wersji negatywowej (white)". So blue frame, white logo if it's on the frame, or blue logo if it's on white background.
      // Actually let's just make it simple:
      // blue: blue frame, blue logo (mostly placed on white)
      // negative: white frame, white logo
      // achromatic-black: black frame, black logo
      // achromatic-white: white frame, white logo
    case 'negative':
      return { frame: '#ffffff', logo: 'white' };
    case 'achromatic-black':
      return { frame: '#000000', logo: 'black' };
    case 'achromatic-white':
      return { frame: '#ffffff', logo: 'white' };
    case 'custom':
      return { frame: '#000000', logo: 'white' }; // The custom frame color will be handled in App.tsx
    default:
      return { frame: '#005baa', logo: '#005baa' };
  }
}
