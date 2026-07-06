// Stock WebLLM worker: the MLCEngine (model download, GPU compilation, generation) lives here so
// token streaming never blocks the reader UI.
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
