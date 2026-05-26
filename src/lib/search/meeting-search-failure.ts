import type {
  EvidencePack,
  SearchProcess,
  SearchFailureReason,
} from "./evidence-pack";

export function assertMeetingSearchSucceeded(evidencePack: EvidencePack) {
  const searchProcess = evidencePack.searchProcess;

  if (searchProcess?.evidenceMode !== "search_failed") {
    return;
  }

  throw new MeetingSearchFailedError(searchProcess.failureReason, searchProcess);
}

export class MeetingSearchFailedError extends Error {
  status = 502;

  constructor(
    readonly failureReason: SearchFailureReason | undefined,
    readonly searchProcess?: SearchProcess,
  ) {
    super(
      `联网资料搜索失败，会议已终止。请检查网络连接或搜索服务配置后重试。失败原因：${formatMeetingSearchFailureReason(failureReason)}。`,
    );
  }
}

function formatMeetingSearchFailureReason(
  reason: SearchFailureReason | undefined,
) {
  switch (reason) {
    case "missing_api_key":
      return "缺少搜索服务 API Key";
    case "invalid_request":
      return "搜索请求无效";
    case "unauthorized":
      return "搜索服务认证失败";
    case "rate_limited":
      return "搜索服务限流";
    case "network_error":
      return "网络连接失败";
    case "invalid_response":
      return "搜索服务返回异常";
    case "unknown_error":
    default:
      return "未知错误";
  }
}
