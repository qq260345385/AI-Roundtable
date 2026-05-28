"use client";

import { useMemo } from "react";
import type {
  LiveParticipantStatuses,
  MeetingResult,
  MeetingSummary,
  MeetingTurn,
  ModelParticipant,
} from "@/lib/types";
import type { UiText } from "@/lib/i18n/ui-text";
import { APP_VERSION } from "@/lib/version";
import {
  buildMeetingStageViews,
  type MeetingStageView,
} from "@/lib/meeting/meeting-room";
import { formatModelDisplayName } from "@/lib/models/model-display-name";
import { WebSearchProcessPanel } from "./MeetingBoard";

type MeetingRoomProps = {
  activeStageId: string;
  copyMessage: string;
  isCompleted: boolean;
  isLive: boolean;
  isStopConfirming?: boolean;
  meeting: MeetingResult;
  onBackToSetup: () => void;
  onCancelStopMeeting?: () => void;
  onCopyMarkdown: () => void;
  onStageChange: (stageId: string) => void;
  onStopMeeting?: () => void;
  participants: ModelParticipant[];
  participantStatuses: LiveParticipantStatuses;
  statusMessage: string;
  statusType: "initial" | "loading" | "success" | "error";
  text: UiText;
};

export function MeetingRoom({
  activeStageId,
  copyMessage,
  isCompleted,
  isLive,
  isStopConfirming = false,
  meeting,
  onBackToSetup,
  onCancelStopMeeting,
  onCopyMarkdown,
  onStageChange,
  onStopMeeting,
  participants,
  participantStatuses,
  statusMessage,
  statusType,
  text,
}: MeetingRoomProps) {
  const stageViews = useMemo(() => buildMeetingStageViews(meeting), [meeting]);
  const activeStage =
    stageViews.find((stage) => stage.id === activeStageId) ?? stageViews[0];

  return (
    <main className="min-h-screen animate-[meetingFadeIn_420ms_ease-out] bg-[radial-gradient(circle_at_top_left,#ecfdf5_0,#f4f4f5_34%,#f8fafc_70%)] text-zinc-950">
      <section className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-6 lg:min-h-screen">
        <header className="flex flex-col gap-4 border-b border-emerald-900/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">
              AI Roundtable · {APP_VERSION}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-zinc-950 md:text-5xl">
              {text.meetingRoom.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              {meeting.topic}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {text.meetingRoom.subtitle}
            </p>
            {isLive ? (
              <p className="mt-3 inline-flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
                {text.meetingRoom.liveInProgress}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {isLive && onStopMeeting ? (
              isStopConfirming ? (
                <>
                  <div className="w-full text-sm leading-5 text-red-700 md:w-auto md:max-w-72">
                    {text.meetingRoom.stopMeetingHint}
                  </div>
                  <button
                    className="border border-red-700 bg-red-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-[background-color,transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:cursor-pointer hover:bg-red-800 hover:shadow-md active:translate-y-0"
                    onClick={onStopMeeting}
                    type="button"
                  >
                    {text.meetingRoom.confirmStopMeeting}
                  </button>
                  <button
                    className="border border-zinc-300 bg-white/80 px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-[background-color,transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:cursor-pointer hover:bg-white hover:shadow-md active:translate-y-0"
                    onClick={onCancelStopMeeting}
                    type="button"
                  >
                    {text.meetingRoom.keepMeeting}
                  </button>
                </>
              ) : (
                <button
                  className="border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition-[background-color,transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:cursor-pointer hover:border-red-300 hover:bg-red-100 hover:shadow-md active:translate-y-0"
                  onClick={onStopMeeting}
                  type="button"
                >
                  {text.meetingRoom.stopMeeting}
                </button>
              )
            ) : (
              <button
                className="border border-zinc-300 bg-white/80 px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-[background-color,transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:cursor-pointer hover:bg-white hover:shadow-md active:translate-y-0"
                onClick={onBackToSetup}
                type="button"
              >
                {text.meetingRoom.backToSetup}
              </button>
            )}
            <button
              className="border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-[background-color,transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:cursor-pointer hover:bg-emerald-800 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
              disabled={!isCompleted}
              onClick={onCopyMarkdown}
              type="button"
            >
              {isCompleted
                ? text.meetingRoom.copyMarkdown
                : text.meetingRoom.copyAfterDone}
            </button>
          </div>
        </header>

        {statusMessage ? (
          <p
            className={`border px-4 py-3 text-sm ${
              statusType === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {statusMessage}
          </p>
        ) : null}

        {copyMessage ? (
          <p className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {copyMessage}
          </p>
        ) : null}

        <div className="grid flex-1 gap-5 lg:grid-cols-[310px_1fr]">
          <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
            <section className="border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur">
              <h2 className="text-lg font-semibold">
                {text.meetingRoom.councilMembers}
              </h2>
              <div className="mt-4 space-y-3">
                {participants.map((participant, index) => (
                  <article
                    className="group border border-emerald-100 bg-emerald-50/40 p-3 transition-[border-color,background-color,transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-white hover:shadow-sm"
                    key={participant.id}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-900 transition-transform duration-150 ease-out group-hover:scale-105">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-500">
                          {text.meetingRoom.seat} {index + 1}
                        </p>
                        <h3 className="mt-1 break-words font-medium text-zinc-950">
                          {formatModelDisplayName(participant.model)}
                        </h3>
                        {participantStatuses[participant.id] ===
                        "speaking" ? (
                          <span className="mt-2 inline-flex border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                            {text.meetingRoom.participantStatus.speaking}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </aside>

          <section className="relative min-h-[620px] border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur">
            <div className="mb-5 flex flex-col gap-2 border-b border-zinc-200 pb-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
                  {text.meetingRoom.currentStage}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-zinc-950">
                  {activeStage.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  {activeStage.description}
                </p>
              </div>
              <span className="w-fit border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
                {activeStage.index}/{stageViews.length}
              </span>
            </div>

            {meeting.searchSummary?.enabled ? (
              <div className="mb-5">
                <WebSearchProcessPanel meeting={meeting} text={text} />
              </div>
            ) : null}

            <StageContent stage={activeStage} text={text} />
          </section>
        </div>
      </section>

      <nav className="fixed bottom-4 right-4 z-30 max-w-[calc(100vw-2rem)] border border-zinc-200 bg-white/95 p-2 shadow-xl backdrop-blur">
        <p className="px-2 pb-2 text-xs font-medium text-zinc-500">
          {text.meetingRoom.stageSwitcher}
        </p>
        <div className="flex gap-2">
          {stageViews.map((stage) => (
            <button
              className={`min-w-20 border px-3 py-2 text-left text-xs font-medium transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:cursor-pointer hover:shadow-sm ${
                stage.id === activeStage.id
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-emerald-200 hover:bg-emerald-50"
              }`}
              key={stage.id}
              onClick={() => onStageChange(stage.id)}
              type="button"
            >
              <span className="block text-sm">{stage.index}</span>
              <span className="block max-w-28 truncate">{stage.title}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

type StageContentProps = {
  stage: MeetingStageView;
  text: UiText;
};

function StageContent({ stage, text }: StageContentProps) {
  if (stage.kind === "summary") {
    return <SummaryStage summary={stage.summary} text={text} />;
  }

  if (stage.phase.turns.length === 0) {
    return (
      <p className="border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-500">
        {text.meetingRoom.noTurns}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {stage.phase.turns.map((turn, index) => (
        <TurnCard index={index} key={turn.id} text={text} turn={turn} />
      ))}
    </div>
  );
}

type TurnCardProps = {
  index: number;
  text: UiText;
  turn: MeetingTurn;
};

function TurnCard({ index, text, turn }: TurnCardProps) {
  return (
    <article className="border border-zinc-200 bg-white p-5 shadow-sm transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-700">
            {text.meetingBoard.speech} {index + 1} · {turn.speakerName}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {turn.provider} / {turn.model}
          </p>
        </div>
        <span className="w-fit border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-500">
          {turn.phaseId}
        </span>
      </div>
      <p className="mt-4 whitespace-pre-wrap text-base leading-8 text-zinc-800">
        {turn.content}
      </p>
    </article>
  );
}

type SummaryStageProps = {
  summary: MeetingSummary;
  text: UiText;
};

function SummaryStage({ summary, text }: SummaryStageProps) {
  const hasMinorityViews = summary.minorityViews.some((item) => item.trim().length > 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SummaryList title={text.meetingBoard.consensus} items={summary.consensus} text={text} />
      <SummaryList title={text.meetingBoard.differences} items={summary.differences} text={text} />
      {hasMinorityViews ? (
        <SummaryList title={text.meetingBoard.minorityViews} items={summary.minorityViews} text={text} />
      ) : null}
      <SummaryList title={text.meetingBoard.risks} items={summary.risks} text={text} />
      <div className="md:col-span-2">
        <SummaryList title={text.meetingBoard.nextSteps} items={summary.nextSteps} text={text} />
      </div>
    </div>
  );
}

type SummaryListProps = {
  items: string[];
  text: UiText;
  title: string;
};

function SummaryList({ items, text, title }: SummaryListProps) {
  return (
    <section className="border border-amber-200 bg-amber-50/80 p-4">
      <h3 className="font-semibold text-zinc-950">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">{text.meetingRoom.summaryEmpty}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-700">
          {items.map((item) => (
            <li className="border-l-2 border-amber-300 pl-3" key={item}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
