import { h } from "../dom";

export interface SegmentedItem<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedOptions<T extends string> {
  items: SegmentedItem<T>[];
  value: T;
  ariaLabel?: string;
  signal: AbortSignal;
  onChange: (value: T) => void;
}

export interface SegmentedController<T extends string> {
  root: HTMLElement;
  getValue(): T;
  setValue(next: T, notify?: boolean): void;
}

export function createSegmented<T extends string>(
  opts: SegmentedOptions<T>
): SegmentedController<T> {
  let currentValue = opts.value;
  const count = Math.max(1, opts.items.length);

  const indicator = h("span", {
    class: "ob-segmented-indicator",
    "aria-hidden": "true",
  });
  indicator.style.setProperty("--seg-count", String(count));

  const buttons: HTMLButtonElement[] = [];

  const updatePositions = () => {
    const activeIndex = Math.max(
      0,
      opts.items.findIndex((item) => item.value === currentValue)
    );
    indicator.style.setProperty("--seg-index", String(activeIndex));
    buttons.forEach((btn, idx) => {
      const isSelected = idx === activeIndex;
      btn.classList.toggle("is-active", isSelected);
      btn.setAttribute("aria-checked", isSelected ? "true" : "false");
      btn.tabIndex = isSelected ? 0 : -1;
    });
  };

  opts.items.forEach((item, idx) => {
    const btn = h(
      "button",
      {
        type: "button",
        role: "radio",
        class: "ob-segmented-btn",
        "aria-checked": item.value === currentValue ? "true" : "false",
        dataset: { segValue: item.value },
      },
      item.label
    ) as HTMLButtonElement;

    btn.addEventListener(
      "click",
      () => {
        if (currentValue === item.value) return;
        currentValue = item.value;
        updatePositions();
        opts.onChange(currentValue);
      },
      { signal: opts.signal }
    );

    btn.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const nextIdx = (idx + dir + count) % count;
        const nextItem = opts.items[nextIdx];
        if (!nextItem) return;
        currentValue = nextItem.value;
        updatePositions();
        buttons[nextIdx]?.focus();
        opts.onChange(currentValue);
      },
      { signal: opts.signal }
    );

    buttons.push(btn);
  });

  const root = h(
    "div",
    {
      class: "ob-segmented",
      role: "radiogroup",
      ...(opts.ariaLabel ? { "aria-label": opts.ariaLabel } : {}),
    },
    indicator,
    ...buttons
  );
  root.style.setProperty("--seg-count", String(count));
  updatePositions();

  return {
    root,
    getValue() {
      return currentValue;
    },
    setValue(next: T, notify = false) {
      if (currentValue === next) return;
      currentValue = next;
      updatePositions();
      if (notify) {
        opts.onChange(currentValue);
      }
    },
  };
}
