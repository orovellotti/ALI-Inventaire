import { createRoot } from "react-dom/client";
import App from "./App";
import { clearAnalysisConversationsForBuild } from "./lib/analysisHistory";
import "./index.css";

declare const __APP_BUILD_ID__: string;

async function clearHistoryAfterRepublish(): Promise<void> {
  await clearAnalysisConversationsForBuild(__APP_BUILD_ID__);
}

async function bootstrap(): Promise<void> {
  try {
    await clearHistoryAfterRepublish();
  } catch (error) {
    console.warn("Could not reset history for this release.", error);
  }
  createRoot(document.getElementById("root")!).render(<App />);
}

void bootstrap();
