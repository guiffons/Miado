import { h } from "../dom";
import { icon, type IconName } from "../icons";
import { drawCheck, shake } from "../motion";
import { OB_TEXT, type HandleCheckStatus } from "../onboarding/flow";

export interface FieldOptions {
  id: string;
  label: string;
  type?: "text" | "email" | "password" | "search";
  autocomplete?: string;
  inputmode?: string;
  autocapitalize?: string;
  maxLength?: number;
  value?: string;
  leadingIcon?: IconName;
  prefixText?: string;
  showPasswordToggle?: boolean;
  showBioCounterFrom?: number;
  signal: AbortSignal;
  onInput?: (value: string) => void;
  onEnter?: () => void;
}

export interface FieldController {
  root: HTMLElement;
  input: HTMLInputElement;
  getValue(): string;
  setValue(val: string): void;
  setError(msg: string): void;
  clearError(): void;
  setHandleStatus(status: HandleCheckStatus): void;
  focus(): void;
}

export function createField(opts: FieldOptions): FieldController {
  const inputId = opts.id;
  const msgId = `${opts.id}-msg`;

  const input = h("input", {
    id: inputId,
    class: "ob-field-input",
    type: opts.type || "text",
    value: opts.value || "",
    autocomplete: opts.autocomplete || "off",
    ...(opts.inputmode ? { inputmode: opts.inputmode } : {}),
    ...(opts.autocapitalize ? { autocapitalize: opts.autocapitalize } : {}),
    ...(opts.maxLength ? { maxlength: String(opts.maxLength) } : {}),
    "aria-describedby": msgId,
  }) as HTMLInputElement;

  const labelEl = h(
    "label",
    {
      for: inputId,
      class: "ob-field-label",
    },
    opts.label
  );

  const prefixNode = opts.prefixText
    ? h("span", { class: "ob-field-prefix", "aria-hidden": "true" }, opts.prefixText)
    : null;

  const leadingIconNode = opts.leadingIcon
    ? h("span", { class: "ob-field-leading-icon" }, icon(opts.leadingIcon, 20))
    : null;

  const trailingWrap = h("div", { class: "ob-field-trailing" });

  let isPasswordVisible = false;
  if (opts.showPasswordToggle) {
    const toggleBtn = h(
      "button",
      {
        type: "button",
        class: "ob-field-toggle-btn",
        "aria-label": OB_TEXT.auth.showPassword,
        "aria-pressed": "false",
      },
      icon("eye", 20)
    ) as HTMLButtonElement;

    toggleBtn.addEventListener(
      "click",
      () => {
        isPasswordVisible = !isPasswordVisible;
        input.type = isPasswordVisible ? "text" : "password";
        toggleBtn.setAttribute("aria-pressed", isPasswordVisible ? "true" : "false");
        toggleBtn.setAttribute(
          "aria-label",
          isPasswordVisible ? OB_TEXT.auth.hidePassword : OB_TEXT.auth.showPassword
        );
        toggleBtn.textContent = "";
        toggleBtn.appendChild(icon(isPasswordVisible ? "eye-off" : "eye", 20));
        input.focus();
      },
      { signal: opts.signal }
    );
    trailingWrap.appendChild(toggleBtn);
  }

  const statusSlot = h("span", { class: "ob-field-status-slot" });
  trailingWrap.appendChild(statusSlot);

  const counterSlot = h("span", { class: "ob-field-counter", "aria-hidden": "true" });

  const shell = h(
    "div",
    {
      class: [
        "ob-field-shell",
        opts.value ? "has-value" : "",
        opts.prefixText ? "has-prefix" : "",
        opts.leadingIcon ? "has-leading-icon" : "",
      ]
        .filter(Boolean)
        .join(" "),
    },
    leadingIconNode,
    prefixNode,
    h("div", { class: "ob-field-control" }, input, labelEl),
    trailingWrap
  );

  const liveRegion = h("div", {
    id: msgId,
    class: "ob-field-message",
    "aria-live": "polite",
  });

  const footerRow = h("div", { class: "ob-field-footer" }, liveRegion, counterSlot);

  const root = h("div", { class: "ob-field" }, shell, footerRow);

  const syncFloatingState = () => {
    const val = input.value;
    shell.classList.toggle("has-value", val.length > 0);
    if (opts.showBioCounterFrom && opts.maxLength) {
      if (val.length >= opts.showBioCounterFrom) {
        counterSlot.textContent = `${val.length}/${opts.maxLength}`;
        counterSlot.classList.add("is-visible");
      } else {
        counterSlot.textContent = "";
        counterSlot.classList.remove("is-visible");
      }
    }
  };

  syncFloatingState();

  input.addEventListener(
    "focus",
    () => {
      shell.classList.add("is-focused");
    },
    { signal: opts.signal }
  );

  input.addEventListener(
    "blur",
    () => {
      shell.classList.remove("is-focused");
      syncFloatingState();
    },
    { signal: opts.signal }
  );

  input.addEventListener(
    "input",
    () => {
      syncFloatingState();
      if (opts.onInput) {
        opts.onInput(input.value);
      }
    },
    { signal: opts.signal }
  );

  input.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && opts.onEnter) {
        e.preventDefault();
        opts.onEnter();
      }
    },
    { signal: opts.signal }
  );

  return {
    root,
    input,
    getValue() {
      return input.value;
    },
    setValue(val: string) {
      input.value = val;
      syncFloatingState();
    },
    setError(msg: string) {
      shell.classList.remove("is-valid");
      shell.classList.add("is-invalid");
      input.setAttribute("aria-invalid", "true");
      liveRegion.className = "ob-field-message is-error is-visible";
      liveRegion.textContent = msg;
      shake(shell);
    },
    clearError() {
      shell.classList.remove("is-invalid");
      input.removeAttribute("aria-invalid");
      if (liveRegion.classList.contains("is-error")) {
        liveRegion.className = "ob-field-message";
        liveRegion.textContent = "";
      }
    },
    setHandleStatus(status: HandleCheckStatus) {
      statusSlot.textContent = "";
      shell.classList.remove("is-invalid", "is-valid");
      input.removeAttribute("aria-invalid");

      if (status === "idle") {
        liveRegion.className = "ob-field-message";
        liveRegion.textContent = "";
        return;
      }

      if (status === "checking") {
        statusSlot.appendChild(icon("spinner", 20, "is-spinning"));
        liveRegion.className = "ob-field-message is-visible";
        liveRegion.textContent = OB_TEXT.profile.checking;
        return;
      }

      if (status === "available") {
        shell.classList.add("is-valid");
        const checkSvg = icon("check", 20, "is-success");
        statusSlot.appendChild(checkSvg);
        const pathEl = checkSvg.querySelector(".ob-icon-check-path") as SVGElement | null;
        drawCheck(pathEl);
        liveRegion.className = "ob-field-message is-success is-visible";
        liveRegion.textContent = OB_TEXT.profile.available;
        return;
      }

      if (status === "taken") {
        shell.classList.add("is-invalid");
        input.setAttribute("aria-invalid", "true");
        statusSlot.appendChild(icon("alert", 20, "is-danger"));
        liveRegion.className = "ob-field-message is-error is-visible";
        liveRegion.textContent = OB_TEXT.profile.taken;
        shake(shell);
        return;
      }

      if (status === "invalid") {
        shell.classList.add("is-invalid");
        input.setAttribute("aria-invalid", "true");
        statusSlot.appendChild(icon("alert", 20, "is-danger"));
        liveRegion.className = "ob-field-message is-error is-visible";
        liveRegion.textContent = OB_TEXT.errors.invalidUsername;
      }
    },
    focus() {
      input.focus();
    },
  };
}
