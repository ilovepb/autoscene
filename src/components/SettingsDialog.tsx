import { useAtom } from "jotai";
import { Eye, EyeOff, Settings } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { type RenderMode, renderModeAtom } from "@/atoms/renderMode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  type AIProvider,
  type AISettings,
  ALL_PROVIDERS,
  BUILTIN_MODELS,
  loadSettings,
  PROVIDER_META,
  saveSettings,
} from "@/lib/settings";

function KeyRow({
  provider,
  apiKey,
  onChange,
}: {
  provider: AIProvider;
  apiKey: string;
  onChange: (value: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const meta = PROVIDER_META[provider];
  const modelCount = BUILTIN_MODELS[provider].length;
  const hasKey = apiKey.length > 0;

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
          <span className="text-[11px] font-medium text-foreground/80">
            {meta.label}
          </span>
          <span className="text-[9px] tabular-nums text-foreground/20">
            {modelCount} {modelCount === 1 ? "model" : "models"}
          </span>
        </div>

        {/* Key input */}
        <div className="flex gap-1 items-center">
          <div className="relative flex-1 min-w-0">
            <input
              ref={inputRef}
              type={revealed ? "text" : "password"}
              value={apiKey}
              onChange={(e) => onChange(e.target.value)}
              placeholder={meta.placeholder}
              spellCheck={false}
              autoComplete="off"
              className="w-full h-7 bg-foreground/[0.03] border border-foreground/[0.06] px-2 text-[11px] text-foreground/70 placeholder:text-foreground/15 focus:outline-none focus:border-foreground/15 focus:bg-foreground/[0.05] transition-colors font-[inherit]"
            />
          </div>
          {apiKey && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="shrink-0 size-7 inline-flex items-center justify-center text-foreground/20 hover:text-foreground/50 transition-colors"
              aria-label={revealed ? "Hide key" : "Show key"}
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

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AISettings>(loadSettings);
  const [renderMode, setRenderMode] = useAtom(renderModeAtom);

  const handleOpen = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setSettings(loadSettings());
    }
    setOpen(nextOpen);
  }, []);

  const updateKey = useCallback((provider: AIProvider, value: string) => {
    setSettings((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: { ...prev.providers[provider], apiKey: value },
      },
    }));
  }, []);

  const handleSave = useCallback(() => {
    saveSettings(settings);
    setOpen(false);
  }, [settings]);

  const configuredCount = ALL_PROVIDERS.filter(
    (p) => settings.providers[p].apiKey,
  ).length;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/5 backdrop-blur-sm"
          aria-label="Settings"
        >
          <Settings className="size-3.5" />
        </Button>
      </DialogTrigger>

      <DialogContent showCloseButton={false} className="p-0 gap-0 sm:max-w-sm">
        {/* Display section */}
        <div className="px-4 pt-4 pb-3">
          <div className="text-[10px] tracking-[0.1em] text-foreground/30">
            Display
          </div>
        </div>
        <div className="h-px bg-foreground/[0.06]" />
        <div className="px-3 py-1">
          <div className="flex items-center justify-between py-2.5 px-3 -mx-3 transition-colors hover:bg-foreground/[0.02]">
            <div className="grid gap-0.5">
              <span className="text-[11px] font-medium text-foreground/80">
                Render mode
              </span>
              <span className="text-[9px] text-foreground/30">
                {renderMode === "ascii" ? "ASCII art" : "3D WebGL"}
              </span>
            </div>
            <NativeSelect
              value={renderMode}
              onChange={(e) =>
                setRenderMode(e.target.value as "ascii" | "webgl")
              }
              className="w-auto text-[11px]"
            >
              <NativeSelectOption value="ascii">ASCII</NativeSelectOption>
              <NativeSelectOption value="webgl">WebGL</NativeSelectOption>
            </NativeSelect>
          </div>
        </div>
        <div className="h-px bg-foreground/[0.06]" />

        {/* API Keys header */}
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
                apiKey={settings.providers[provider].apiKey}
                onChange={(v) => updateKey(provider, v)}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="h-px bg-foreground/[0.06]" />
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[9px] text-foreground/15">
            Keys stored in localStorage
          </span>
          <Button onClick={handleSave} size="xs" variant="outline">
            <span className="text-[10px]">Save</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
