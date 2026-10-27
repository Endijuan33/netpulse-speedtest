import { z } from "zod";

/** Speedtest result payload shared by the client, share API and exports. */
export const speedResultSchema = z.object({
  id: z.string().min(1).max(64),
  timestamp: z.string().datetime(),
  downloadMbps: z.number().nonnegative(),
  uploadMbps: z.number().nonnegative(),
  idleLatencyMs: z.number().nonnegative(),
  downloadLatencyMs: z.number().nonnegative(),
  uploadLatencyMs: z.number().nonnegative(),
  jitterMs: z.number().nonnegative(),
  maxJitterMs: z.number().nonnegative(),
  httpRequestLossPercent: z.number().min(0).max(100),
  server: z.string().max(256),
  isp: z.string().max(256).optional(),
  publicIp: z.string().max(64).optional(),
  hideIp: z.boolean().optional().default(false),
});

export type SpeedResult = z.infer<typeof speedResultSchema>;

export const shareRequestSchema = z.object({
  result: speedResultSchema,
});

export const diagnosticsQuerySchema = z.object({
  host: z.string().min(1).max(253).optional(),
});

export const downloadQuerySchema = z.object({
  bytes: z.coerce.number().int().min(1024).max(100 * 1024 * 1024).optional(),
});
