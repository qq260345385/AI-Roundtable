import type { RoundtableMode } from "@/lib/types";
import type { Locale, UiText } from "@/lib/i18n/ui-text";

type MeetingHeaderProps = {
  topic: string;
  participantCount: number;
  phaseCount: number;
  mode: RoundtableMode | null;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  text: UiText;
};

export function MeetingHeader({
  topic,
  participantCount,
  phaseCount,
  mode,
  locale,
  onLocaleChange,
  text,
}: MeetingHeaderProps) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            AI Roundtable · v0.4
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-zinc-950 md:text-5xl">
            {text.header.appName}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">
            {text.header.topicPrefix}
            {topic}
          </p>
          <p className="mt-2 text-sm font-medium text-zinc-700">
            {text.header.currentMode}
            {getModeText(mode, text)}
          </p>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            {getModeDescription(mode, text)}
          </p>
        </div>

        <div className="space-y-3 text-sm md:w-72">
          <LanguageSwitch
            locale={locale}
            onLocaleChange={onLocaleChange}
            text={text}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-zinc-500">{text.header.participantCount}</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-950">
                {participantCount}
              </p>
            </div>
            <div className="border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-zinc-500">{text.header.phaseCount}</p>
              <p className="mt-1 text-lg font-semibold text-zinc-950">
                {phaseCount}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

type LanguageSwitchProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  text: UiText;
};

function LanguageSwitch({
  locale,
  onLocaleChange,
  text,
}: LanguageSwitchProps) {
  return (
    <div
      aria-label={text.settings.language}
      className="ml-auto flex w-fit border border-zinc-300 bg-zinc-50 p-1 shadow-sm"
      role="group"
    >
      <button
        aria-pressed={locale === "zh"}
        className={`px-3 py-1.5 text-sm font-medium transition-[background-color,color,transform,box-shadow] duration-150 ease-out hover:cursor-pointer hover:shadow-sm active:scale-95 ${
          locale === "zh"
            ? "bg-emerald-700 text-white"
            : "text-zinc-600 hover:bg-white hover:text-zinc-950"
        }`}
        onClick={() => onLocaleChange("zh")}
        type="button"
      >
        {text.settings.chinese}
      </button>
      <button
        aria-pressed={locale === "en"}
        className={`px-3 py-1.5 text-sm font-medium transition-[background-color,color,transform,box-shadow] duration-150 ease-out hover:cursor-pointer hover:shadow-sm active:scale-95 ${
          locale === "en"
            ? "bg-emerald-700 text-white"
            : "text-zinc-600 hover:bg-white hover:text-zinc-950"
        }`}
        onClick={() => onLocaleChange("en")}
        type="button"
      >
        {text.settings.english}
      </button>
    </div>
  );
}

function getModeText(mode: RoundtableMode | null, text: UiText): string {
  if (mode === "real") {
    return "Real";
  }

  if (mode === "mock") {
    return "Mock";
  }

  return text.header.loadingMode;
}

function getModeDescription(mode: RoundtableMode | null, text: UiText): string {
  if (mode === "real") {
    return text.header.realDescription;
  }

  if (mode === "mock") {
    return text.header.mockDescription;
  }

  return text.header.loadingDescription;
}
