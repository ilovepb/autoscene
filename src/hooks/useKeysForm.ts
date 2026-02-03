import { useCallback } from "react";
import { useForm } from "react-hook-form";
import {
  type AISettings,
  ALL_PROVIDERS,
  type KeysFormValues,
  loadSettings,
  saveSettings,
} from "@/lib/settings";

export function useKeysForm() {
  const form = useForm<KeysFormValues>({
    defaultValues: extractProviders(loadSettings()),
  });

  const watched = form.watch("providers");
  const configuredCount = ALL_PROVIDERS.filter((p) => watched[p].apiKey).length;

  const handleSave = useCallback(
    (onAfterSave?: () => void) => {
      const values = form.getValues();
      const current = loadSettings();
      const merged: AISettings = {
        ...current,
        providers: values.providers,
      };
      saveSettings(merged);
      onAfterSave?.();
    },
    [form],
  );

  const reset = useCallback(() => {
    form.reset(extractProviders(loadSettings()));
  }, [form]);

  return { form, configuredCount, handleSave, reset };
}

function extractProviders(settings: AISettings): KeysFormValues {
  return { providers: settings.providers };
}
