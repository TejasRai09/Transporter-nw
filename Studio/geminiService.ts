
import { Evaluation, Vehicle } from "./types";

// AI calls are disabled to avoid requiring any API keys.
export async function analyzePerformance(_evaluation: Evaluation, _vehicle: Vehicle) {
  return "AI insights are disabled (no API key required).";
}

export async function summarizeLogs(_logs: any[]) {
  return "AI log summaries are disabled (no API key required).";
}
