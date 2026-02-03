import type { UseFormReturn } from "react-hook-form";
import { KeyRow } from "@/components/settings/KeyRow";
import { Button } from "@/components/ui/button";
import { ALL_PROVIDERS, type KeysFormValues } from "@/lib/settings";

interface KeysFormProps {
  form: UseFormReturn<KeysFormValues>;
  configuredCount: number;
  onSave: () => void;
  saveDisabled?: boolean;
}

export function KeysForm({
  form,
  configuredCount,
  onSave,
  saveDisabled,
}: KeysFormProps) {
  const watched = form.watch("providers");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!saveDisabled) onSave();
      }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] tracking-[0.1em] text-foreground/30">
            API keys
          </div>
          <div className="text-[9px] tabular-nums text-foreground/20">
            {configuredCount}/{ALL_PROVIDERS.length} configured
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-foreground/[0.06]" />

      {/* Provider rows */}
      <div className="px-3 py-1">
        {ALL_PROVIDERS.map((provider, i) => (
          <div key={provider}>
            {i > 0 && <div className="h-px bg-foreground/[0.04] mx-0" />}
            <KeyRow
              provider={provider}
              registration={form.register(`providers.${provider}.apiKey`)}
              hasKey={!!watched[provider].apiKey}
            />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="h-px bg-foreground/[0.06]" />
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[9px] text-foreground/15">
          Keys never leave your browser
        </span>
        <Button
          type="submit"
          size="xs"
          variant="outline"
          disabled={saveDisabled}
        >
          <span className="text-[10px]">Save</span>
        </Button>
      </div>
    </form>
  );
}
