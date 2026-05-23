import type { ExtractProvider } from "./extract-provider";
import { TavilyExtractProvider } from "./tavily-extract";

export function getExtractProvider(): ExtractProvider {
  return new TavilyExtractProvider();
}
