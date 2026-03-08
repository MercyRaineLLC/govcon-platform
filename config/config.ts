type AppConfig = {
  env: string
  port: number
  rateLimit: {
    windowMs: number
    max: number
  }
}

export const config: AppConfig = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000), // 15 min
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
  },
}