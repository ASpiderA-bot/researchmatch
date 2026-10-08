import type { NextFunction, Request, Response } from "express";
import { CONFIG } from "../utils/config.ts";

const allowAll = CONFIG.CORS_ORIGINS.includes("*");
const allowed = new Set(CONFIG.CORS_ORIGINS);

/**
 * Explicit origin allowlist. Cross-origin only happens when the frontend is
 * served from GitHub Pages and the API runs elsewhere; same-origin requests
 * (local dev, single-host deploys) are unaffected.
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  if (origin && (allowAll || allowed.has(origin))) {
    res.setHeader("Access-Control-Allow-Origin", allowAll ? "*" : origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
