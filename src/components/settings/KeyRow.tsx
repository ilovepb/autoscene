import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { type AIProvider, BUILTIN_MODELS, PROVIDER_META } from "@/lib/settings";

export function KeyRow({
  provider,
  registration,
  hasKey,
}: {
  provider: AIProvider;
  registration: UseFormRegisterReturn;
  hasKey: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const meta = PROVIDER_META[provider];
  const modelCount = BUILTIN_MODELS[provider].length;

  return (
    <div className="group grid grid-cols-[8px_1fr] gap-3 items-start py-2.5 px-3 -mx-3 transition-colors hover:bg-foreground/[0.02]">
      {/* Status dot */}
      <div className="pt-[7px]">
        <div
          className={
            hasKey ? "size-1.5 bg-emerald-500/80" : "size-1.5 bg-foreground/10"
          }
        />
      </div>

      <div className="grid gap-1.5 min-w-0">
        {/* Provider name + model count */}
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={registration.name}
            className="text-[11px] font-medium text-foreground/80"
          >
            {meta.label}
          </label>
          <span className="text-[9px] tabular-nums text-foreground/20">
            {modelCount} {modelCount === 1 ? "model" : "models"}
          </span>
        </div>

        {/* Key input */}
        <div className="flex gap-1 items-center">
          <div className="relative flex-1 min-w-0">
            <input
              id={registration.name}
              type={revealed ? "text" : "password"}
              placeholder={meta.placeholder}
              spellCheck={false}
              autoComplete="off"
              className="w-full h-7 bg-foreground/[0.03] border border-foreground/[0.06] px-2 text-[11px] text-foreground/70 placeholder:text-foreground/15 focus:outline-none focus:border-foreground/15 focus:bg-foreground/[0.05] transition-colors font-[inherit]"
              {...registration}
            />
          </div>
          {hasKey && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="shrink-0 size-7 inline-flex items-center justify-center text-foreground/20 hover:text-foreground/50 transition-colors"
              aria-label={revealed ? "hide key" : "show key"}
            >
              {revealed ? (
                <EyeOff className="size-3" />
              ) : (
                <Eye className="size-3" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
