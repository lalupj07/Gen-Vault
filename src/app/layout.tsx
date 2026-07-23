import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { ThemeProvider } from '@/lib/theme';
import { FontProvider } from '@/lib/font';
import { fontVariableClassName } from '@/lib/fonts';
import { COMPANY, PRODUCT } from '@/lib/company';
import './globals.css';

export const metadata: Metadata = {
  title: `${PRODUCT.name} v${PRODUCT.version} — ${PRODUCT.tagline} | ${COMPANY.name}`,
  description: PRODUCT.shortDescription,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`theme-dark font-ui-system ${fontVariableClassName}`} data-theme="dark" data-font="system">
      <body className="bg-vault-black text-vault-light antialiased">
        <ThemeProvider>
          <FontProvider>
            <Providers>
              {children}
            </Providers>
          </FontProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
