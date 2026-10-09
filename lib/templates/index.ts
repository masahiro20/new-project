import type { Part } from "../parts";
import { committeeTemplate } from "./committee";
import type { TemplateContext } from "./context";
import { restraintTemplate } from "./restraint";
import { trainingTemplate } from "./training";

export { templateContext, templateParts } from "./context";
export type { ServiceType, TemplateContext, TemplateInput } from "./context";

const BUILDERS: Record<Part, (ctx: TemplateContext) => string> = {
  committee: committeeTemplate,
  training: trainingTemplate,
  restraint: restraintTemplate,
};

export function buildTemplate(part: Part, ctx: TemplateContext): string {
  return BUILDERS[part](ctx);
}
