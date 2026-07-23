import {
  DM_Sans,
  Nunito,
  Source_Serif_4,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  Noto_Sans,
  Noto_Sans_Devanagari,
  Noto_Sans_JP,
  Noto_Sans_SC,
  Noto_Sans_KR,
  Noto_Sans_Arabic,
  Noto_Serif,
  Outfit,
} from 'next/font/google';

/** Self-hosted via next/font — no runtime CDN. */

export const fontDmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const fontNunito = Nunito({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-nunito',
  display: 'swap',
});

export const fontSourceSerif = Source_Serif_4({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-source-serif',
  display: 'swap',
});

export const fontIbmPlexSans = IBM_Plex_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

export const fontIbmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600'],
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

export const fontNotoSans = Noto_Sans({
  subsets: ['latin', 'latin-ext', 'cyrillic', 'vietnamese'],
  variable: '--font-noto-sans',
  display: 'swap',
});

export const fontNotoDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  variable: '--font-noto-devanagari',
  display: 'swap',
});

export const fontNotoJp = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-noto-jp',
  display: 'swap',
  weight: ['400', '500', '700'],
});

export const fontNotoSc = Noto_Sans_SC({
  subsets: ['latin'],
  variable: '--font-noto-sc',
  display: 'swap',
  weight: ['400', '500', '700'],
});

export const fontNotoKr = Noto_Sans_KR({
  subsets: ['latin'],
  variable: '--font-noto-kr',
  display: 'swap',
  weight: ['400', '500', '700'],
});

export const fontNotoArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  variable: '--font-noto-arabic',
  display: 'swap',
});

export const fontNotoSerif = Noto_Serif({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-noto-serif',
  display: 'swap',
});

export const fontOutfit = Outfit({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-outfit',
  display: 'swap',
});

export const fontVariableClassName = [
  fontDmSans.variable,
  fontNunito.variable,
  fontSourceSerif.variable,
  fontIbmPlexSans.variable,
  fontIbmPlexMono.variable,
  fontNotoSans.variable,
  fontNotoDevanagari.variable,
  fontNotoJp.variable,
  fontNotoSc.variable,
  fontNotoKr.variable,
  fontNotoArabic.variable,
  fontNotoSerif.variable,
  fontOutfit.variable,
].join(' ');
