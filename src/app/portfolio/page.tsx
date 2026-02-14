import type { Metadata } from 'next';
import { PortfolioPageClient } from './PortfolioPageClient';

export const metadata: Metadata = {
  title: 'Portfolio | Intrinsic',
  description: 'Dein Portfolio - Positionen verwalten und Performance verfolgen',
};

export default function PortfolioPage() {
  return <PortfolioPageClient />;
}
