import { describe, expect, test } from "vitest";
import { getUiText, isLocale, type Locale } from "./ui-text";

describe("ui text", () => {
  test("recognizes supported locales", () => {
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  test("returns Chinese and English settings labels", () => {
    expect(getUiText("zh").settings.title).toBe("设置");
    expect(getUiText("en").settings.title).toBe("Settings");
  });

  test("returns Chinese and English brief mode labels", () => {
    expect(getUiText("zh").meetingForm.briefMode).toBe("启用简要会议模式");
    expect(getUiText("en").meetingForm.briefMode).toBe(
      "Enable brief meeting mode",
    );
  });

  test("returns Chinese and English meeting room labels", () => {
    expect(getUiText("zh").meetingRoom.title).toBe("圆桌会议室");
    expect(getUiText("en").meetingRoom.title).toBe("Roundtable Room");
  });

  test("returns Chinese and English document input strategy labels", () => {
    expect(getUiText("zh").evidence.strategyNativeFile).toContain("原生附件");
    expect(getUiText("en").evidence.strategyNativeFile).toContain("Native");
  });

  test("returns Chinese and English evidence delivery labels", () => {
    expect(getUiText("zh").evidence.deliveryTitle).toBe("实际投递方式");
    expect(getUiText("en").evidence.deliveryTitle).toBe("Actual delivery mode");
  });

  test("returns automatic web evidence search labels", () => {
    expect(getUiText("zh").evidence.webSearchTitle).toBe("启用联网搜索");
    expect(getUiText("zh").evidence.webSearchDescription).toContain(
      "当前会议议题",
    );
    expect(getUiText("en").evidence.webSearchDescription).toContain(
      "meeting topic",
    );
  });

  test("returns Chinese and English model capability warnings", () => {
    expect(getUiText("zh").participants.capabilityWarnings.noDocumentRecognition).toBe(
      "不支持文档识别",
    );
    expect(getUiText("en").participants.capabilityWarnings.noImageRecognition).toBe(
      "no image recognition",
    );
    expect(
      getUiText("zh").participants.capabilityWarnings.noDocumentOrImageRecognition,
    ).toBe("不支持文档/图片识别");
  });

  test("keeps locale keys aligned", () => {
    const locales: Locale[] = ["zh", "en"];
    const keyCounts = locales.map(
      (locale) => Object.keys(getUiText(locale)).length,
    );

    expect(new Set(keyCounts).size).toBe(1);
  });
});
