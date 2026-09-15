import { solveCoverage } from "./coverage-solver";

export interface CoverageSolveRequest {
  requestId: number;
}

export type CoverageSolveResponse =
  | {
      requestId: number;
      status: "success";
      minCoverFlat: Uint8Array;
      requiredThresholdFlat: Uint8Array;
      dpFullByCombo: Uint8Array;
      characterCount: number;
    }
  | {
      requestId: number;
      status: "error";
      error: string;
    };

self.onmessage = (event: MessageEvent<CoverageSolveRequest>) => {
  const { requestId } = event.data;
  try {
    const { minCoverFlat, requiredThresholdFlat, dpFullByCombo, characterCount } = solveCoverage();
    const response: CoverageSolveResponse = {
      requestId,
      status: "success",
      minCoverFlat,
      requiredThresholdFlat,
      dpFullByCombo,
      characterCount,
    };
    self.postMessage(response);
  } catch (error) {
    const response: CoverageSolveResponse = { requestId, status: "error", error: `${error}` };
    self.postMessage(response);
  }
};
