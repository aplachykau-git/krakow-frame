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
  const orientation: Orientation = (width === height) ? 'square' : (height > width) ? 'vertical' : 'horizontal';
  
  // SIW Guidelines: Vertical layouts use H/15, Horizontal/Square use H/10.5
  const U = orientation === 'vertical' ? height / 15 : height / 10.5;
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
