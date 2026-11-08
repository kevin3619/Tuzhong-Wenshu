import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

// 🔥 Bug修复：生产环境此前不缓存实例 —— pm2 重启/热更新后每次都新建 PrismaClient，
//   连接数膨胀直至 SQLite 拒绝接入（生产单实例部署，全局缓存是安全且必要的）
globalForPrisma.prisma = prisma