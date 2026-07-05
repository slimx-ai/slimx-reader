import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'SlimX Reader',
  description:
    'A local-first intelligent PDF and document reader — read, highlight, comment, ask questions, and save evidence, powered by SlimX and SlimX-RAG.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
