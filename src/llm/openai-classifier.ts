import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import {
  classificationPayloadSchema,
  ClassificationValidationError,
  validateClassificationPayload
} from "../analysis/classification-validator";
import type {
  ClassificationRequest,
  ClassificationResult,
  CodeClassifier
} from "../domain/classification";
import {
  buildClassificationMessages,
  CLASSIFICATION_PROMPT_VERSION
} from "./classification-prompt";

export interface OpenAIClassifierOptions {
  apiKey: string;
  model: string;
  client?: OpenAI;
}

export class OpenAIClassifier implements CodeClassifier {
  readonly id = "openai";
  readonly version = CLASSIFICATION_PROMPT_VERSION;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIClassifierOptions) {
    this.client = options.client ?? new OpenAI({ apiKey: options.apiKey, timeout: 60_000 });
    this.model = options.model;
  }

  async classify(request: ClassificationRequest): Promise<ClassificationResult> {
    let retryReason: string | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const messages = buildClassificationMessages(request, retryReason);
      const response = await this.client.responses.parse({
        model: this.model,
        store: false,
        input: [
          { role: "system", content: messages.system },
          { role: "user", content: messages.user }
        ],
        text: {
          format: zodTextFormat(
            classificationPayloadSchema,
            "semantic_code_classification"
          )
        }
      });
      if (response.output_parsed === null) {
        throw new Error("OpenAI returned no classification payload.");
      }
      try {
        return validateClassificationPayload(
          response.output_parsed,
          request,
          `${this.id}:${this.model}:${this.version}`
        );
      } catch (error) {
        if (!(error instanceof ClassificationValidationError) || attempt === 1) {
          throw error;
        }
        retryReason = error.message.slice(0, 300);
      }
    }
    throw new Error("OpenAI classification failed validation.");
  }
}

