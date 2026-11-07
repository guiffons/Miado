import { h } from "../dom";
import { OB_TEXT } from "../onboarding/flow";

export interface StepperOptions {
  step: 1 | 2;
  verticalOnDesktop?: boolean;
}

export function createStepper(opts: StepperOptions): HTMLElement {
  const stepLabelText =
    opts.step === 1 ? OB_TEXT.profile.stepLabel : OB_TEXT.artists.stepLabel;
  const stepTitleText =
    opts.step === 1 ? OB_TEXT.profile.title : OB_TEXT.artists.title;

  const fill = h("div", { class: "ob-stepper-bar-fill" });
  fill.style.setProperty("--step-scale", opts.step === 1 ? "0.5" : "1");

  const track = h("div", { class: "ob-stepper-bar-track", "aria-hidden": "true" }, fill);

  const item1 = h(
    "div",
    {
      class: `ob-stepper-node ${opts.step === 1 ? "is-current" : "is-done"}`,
      ...(opts.step === 1 ? { "aria-current": "step" } : {}),
    },
    h("span", { class: "ob-stepper-dot", "aria-hidden": "true" }, "1"),
    h("span", { class: "ob-stepper-node-label" }, OB_TEXT.profile.title)
  );

  const item2 = h(
    "div",
    {
      class: `ob-stepper-node ${opts.step === 2 ? "is-current" : ""}`,
      ...(opts.step === 2 ? { "aria-current": "step" } : {}),
    },
    h("span", { class: "ob-stepper-dot", "aria-hidden": "true" }, "2"),
    h("span", { class: "ob-stepper-node-label" }, OB_TEXT.artists.title)
  );

  return h(
    "div",
    {
      class: `ob-stepper ${opts.verticalOnDesktop ? "ob-stepper-vertical-desktop" : ""}`,
      "aria-label": `${stepTitleText} - ${stepLabelText}`,
    },
    h(
      "div",
      { class: "ob-stepper-meta" },
      h("span", { class: "ob-stepper-step-count" }, stepLabelText)
    ),
    track,
    h("div", { class: "ob-stepper-nodes" }, item1, item2)
  );
}
