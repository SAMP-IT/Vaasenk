import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Vaasenk — Teach more. Copy less.',
    template: '%s · Vaasenk',
  },
  description:
    'Vaasenk is a classroom productivity platform for Indian schools, colleges, and coaching centers. Teachers photograph board notes, students stop copying, and AI helps generate question papers from the syllabus.',
  applicationName: 'Vaasenk',
  authors: [{ name: 'Vaasenk' }],
};

export const viewport: Viewport = {
  themeColor: '#A00000',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
