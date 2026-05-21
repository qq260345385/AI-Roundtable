import type {
  EvidencePack,
  SearchEvidence,
} from "./evidence-pack";
import { normalizeEvidencePack } from "./evidence-pack";
import {
  buildTavilySearchQueries,
  searchTavilyEvidence,
  type TavilyEvidenceDraft,
} from "./tavily-search";
import type {
  ModelParticipant,
  ModelProvider,
} from "../types";

const MAX_MODEL_DRIVEN_QUERIES = 8;
const WEB_SEARCH_RESULTS_PER_QUERY = 5;

type Searcher = (
  query: string,
  options?: { maxResults?: number },
) => Promise<TavilyEvidenceDraft[]>;

type BuildModelDrivenWebEvidencePackOptions = {
  baseEvidencePack?: EvidencePack;
  participants: ModelParticipant[];
  provider: ModelProvider;
  searcher?: Searcher;
  topic: string;
};

export async function buildModelDrivenWebEvidencePack({
  baseEvidencePack,
  participants,
  provider,
  searcher = searchTavilyEvidence,
  topic,
}: BuildModelDrivenWebEvidencePackOptions): Promise<EvidencePack> {
  const searchQueries = await buildParticipantSearchQueries(
    topic,
    participants,
    provider,
  );
  const webDrafts = dedupeEvidenceDrafts(
    (
      await Promise.all(
        searchQueries.map((query) =>
          searcher(query, { maxResults: WEB_SEARCH_RESULTS_PER_QUERY }),
        ),
      )
    ).flat(),
  );
  const baseItems = baseEvidencePack?.enabled ? baseEvidencePack.items : [];
  const preflightPack = normalizeEvidencePack(
    {
      enabled: baseItems.length > 0 || webDrafts.length > 0,
      items: [...baseItems, ...webDrafts],
    },
    {
      topic,
    },
  );
  const evidenceStatus =
    preflightPack.evidenceStatus ??
    (preflightPack.items.length > 0 ? "low" : "none");
  const evidenceWarnings = [
    ...(baseEvidencePack?.evidenceWarnings ?? []),
    ...getEvidenceWarnings(evidenceStatus),
  ];

  return normalizeEvidencePack(
    {
      enabled: preflightPack.items.length > 0,
      evidenceStatus,
      evidenceWarnings,
      items: preflightPack.items,
      searchQueries,
      strategy: baseEvidencePack?.strategy ?? "text_pack",
    },
    {
      topic,
    },
  );
}

async function buildParticipantSearchQueries(
  topic: string,
  participants: ModelParticipant[],
  provider: ModelProvider,
): Promise<string[]> {
  const plannedQueries = (
    await Promise.all(
      participants.map(async (participant) => {
        if (!provider.generateSearchQueries) {
          return [];
        }

        try {
          return provider.generateSearchQueries(participant, topic);
        } catch {
          return [];
        }
      }),
    )
  ).flat();
  const queries = Array.from(
    new Set(plannedQueries.map((query) => query.trim()).filter(Boolean)),
  );

  if (queries.length > 0) {
    return queries.slice(0, MAX_MODEL_DRIVEN_QUERIES);
  }

  return buildTavilySearchQueries(topic).slice(0, MAX_MODEL_DRIVEN_QUERIES);
}

function dedupeEvidenceDrafts<T extends Pick<SearchEvidence, "title" | "url">>(
  drafts: T[],
): T[] {
  const seen = new Set<string>();

  return drafts.filter((draft) => {
    const key = (draft.url || draft.title).toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getEvidenceWarnings(status: string): string[] {
  if (status === "low") {
    return [
      "未找到高质量联网资料，已切换为低证据会议模式。本次会议仍会继续，但涉及实时事实的结论请人工核验。",
    ];
  }

  if (status === "none") {
    return [
      "未找到可用联网资料，本次会议将主要基于模型已有知识和推理，涉及实时事实请人工核验。",
    ];
  }

  return [];
}
