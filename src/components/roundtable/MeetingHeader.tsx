import { useRef, useState } from "react";
import type { RoundtableMode, SearchIntensity, SearchRegion } from "@/lib/types";
import type { Locale, UiText } from "@/lib/i18n/ui-text";
import { APP_VERSION } from "@/lib/version";

type MeetingHeaderProps = {
  topic: string;
  participantCount: number;
  phaseCount: number;
  mode: RoundtableMode | null;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  searchRegion: SearchRegion;
  onSearchRegionChange: (region: SearchRegion) => void;
  searchIntensity: SearchIntensity;
  onSearchIntensityChange: (intensity: SearchIntensity) => void;
  text: UiText;
};

export function MeetingHeader({
  topic,
  participantCount,
  phaseCount,
  mode,
  locale,
  onLocaleChange,
  searchRegion,
  onSearchRegionChange,
  searchIntensity,
  onSearchIntensityChange,
  text,
}: MeetingHeaderProps) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            AI Roundtable · {APP_VERSION}
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
          <SettingsDropdown
            locale={locale}
            onLocaleChange={onLocaleChange}
            searchRegion={searchRegion}
            onSearchRegionChange={onSearchRegionChange}
            searchIntensity={searchIntensity}
            onSearchIntensityChange={onSearchIntensityChange}
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

type SettingsDropdownProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  searchRegion: SearchRegion;
  onSearchRegionChange: (region: SearchRegion) => void;
  searchIntensity: SearchIntensity;
  onSearchIntensityChange: (intensity: SearchIntensity) => void;
  text: UiText;
};

function SettingsDropdown({
  locale,
  onLocaleChange,
  searchRegion,
  onSearchRegionChange,
  searchIntensity,
  onSearchIntensityChange,
  text,
}: SettingsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const regionOptions: { value: SearchRegion; label: string }[] = [
    { value: "auto", label: text.settings.searchRegionOptions.auto },
    { value: "global", label: text.settings.searchRegionOptions.global },
    { value: "china", label: text.settings.searchRegionOptions.china },
    { value: "us", label: text.settings.searchRegionOptions.us },
    { value: "europe", label: text.settings.searchRegionOptions.europe },
    { value: "japan", label: text.settings.searchRegionOptions.japan },
    { value: "korea", label: text.settings.searchRegionOptions.korea },
  ];

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="ml-auto flex w-fit items-center gap-1.5 border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition-[background-color,color,transform,box-shadow] duration-150 ease-out hover:cursor-pointer hover:bg-white hover:text-zinc-950 hover:shadow-sm active:scale-95"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
        {text.settings.title}
      </button>

      {isOpen ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-72 border border-zinc-200 bg-white p-4 shadow-lg">
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                  {text.settings.language}
                </label>
                <div className="flex gap-1">
                  <button
                    className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                      locale === "zh"
                        ? "bg-emerald-700 text-white"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                    onClick={() => onLocaleChange("zh")}
                    type="button"
                  >
                    {text.settings.chinese}
                  </button>
                  <button
                    className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                      locale === "en"
                        ? "bg-emerald-700 text-white"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                    onClick={() => onLocaleChange("en")}
                    type="button"
                  >
                    {text.settings.english}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                  {text.settings.searchRegion}
                </label>
                <select
                  className="w-full border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800"
                  onChange={(event) => onSearchRegionChange(event.target.value as SearchRegion)}
                  value={searchRegion}
                >
                  {regionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                  {text.settings.searchIntensity}
                </label>
                <div className="flex gap-1">
                  <button
                    className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                      searchIntensity === "standard"
                        ? "bg-emerald-700 text-white"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                    onClick={() => onSearchIntensityChange("standard")}
                    type="button"
                  >
                    {text.settings.searchIntensityOptions.standard}
                  </button>
                  <button
                    className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                      searchIntensity === "deep"
                        ? "bg-emerald-700 text-white"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                    onClick={() => onSearchIntensityChange("deep")}
                    type="button"
                  >
                    {text.settings.searchIntensityOptions.deep}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
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
