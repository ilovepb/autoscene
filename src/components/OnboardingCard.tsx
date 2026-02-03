import { motion } from "motion/react";
import { useCallback } from "react";
import { KeysForm } from "@/components/settings/KeysForm";
import { useKeysForm } from "@/hooks/useKeysForm";
import {
  type AIProvider,
  ALL_PROVIDERS,
  BUILTIN_MODELS,
  loadSettings,
  saveSettings,
} from "@/lib/settings";

interface OnboardingCardProps {
  onComplete: () => void;
}

export function OnboardingCard({ onComplete }: OnboardingCardProps) {
  const { form, configuredCount, handleSave } = useKeysForm();

  const onSave = useCallback(() => {
    handleSave(() => {
      // Auto-select the first available model if the current selection has no key
      const current = loadSettings();
      const currentProvider = current.selectedModel.slice(
        0,
        current.selectedModel.indexOf(":"),
      ) as AIProvider;
      const hasCurrentKey = current.providers[currentProvider]?.apiKey;

      if (!hasCurrentKey) {
        const firstConfigured = ALL_PROVIDERS.find(
          (p) => current.providers[p].apiKey,
        );
        if (firstConfigured) {
          const firstModel = BUILTIN_MODELS[firstConfigured][0];
          saveSettings({
            ...current,
            selectedModel: `${firstModel.provider}:${firstModel.id}`,
          });
        }
      }

      onComplete();
    });
  }, [handleSave, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="w-full max-w-md"
    >
      {/* Title */}
      <div className="text-center mb-6">
        <h1 className="text-lg font-medium tracking-tight text-foreground/80">
          autoscene
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Add an API key to get started
        </p>
      </div>

      {/* Card */}
      <div className="border border-foreground/[0.06] bg-background">
        <KeysForm
          form={form}
          configuredCount={configuredCount}
          onSave={onSave}
          saveDisabled={configuredCount === 0}
        />
      </div>
    </motion.div>
  );
}
