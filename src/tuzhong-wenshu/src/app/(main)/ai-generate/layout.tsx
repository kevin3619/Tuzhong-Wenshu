import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI 小说自动创作向导 - 途中文枢',
}

export default function AIGenerateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}