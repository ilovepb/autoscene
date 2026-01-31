import { CheckIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { ChatMessages } from "@/components/ChatMessageParts";
import { PromptInputAttachmentsDisplay } from "@/components/PromptInputAttachmentsDisplay";
import { SettingsDialog } from "@/components/SettingsDialog";
import type { ChatManager } from "@/hooks/useChatManager";

interface Props {
  chat: ChatManager;
  onFirstMessage: () => void;
}

const PROVIDER_SLUG: Record<string, string> = {
  cerebras: "cerebras",
  groq: "groq",
  openai: "openai",
  anthropic: "anthropic",
};

export function CenteredChat({ chat, onFirstMessage }: Props) {
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const hasSentRef = useRef(false);

  const handleSubmit = useCallback(
    ({
      text,
      files,
    }: {
      text: string;
      files?: { url: string; mediaType: string; filename?: string }[];
    }) => {
      if (!hasSentRef.current) {
        hasSentRef.current = true;
        onFirstMessage();
      }
      chat.sendMessage({ text, files });
    },
    [chat, onFirstMessage],
  );

  const settings = chat.loadSettings();
  const availableModels = chat.getAvailableModels(settings);
  const parsed = chat.parseModelKey(chat.selectedModel);
  const selectedModelData = availableModels.find(
    (m) => m.provider === parsed.provider && m.id === parsed.model,
  );

  const configuredProviders = new Set(
    chat.ALL_PROVIDERS.filter((p) => settings.providers[p].apiKey),
  );

  const hasMessages = chat.messages.length > 0;

  const promptInputJSX = (
    <PromptInput
      multiple
      globalDrop
      onSubmit={({ text, files }) => {
        handleSubmit({ text, files });
      }}
    >
      <PromptInputHeader>
        <PromptInputAttachmentsDisplay />
      </PromptInputHeader>
      <PromptInputBody>
        <PromptInputTextarea placeholder="Describe a scene, or upload an image..." />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger />
            <PromptInputActionMenuContent>
              <PromptInputActionAddAttachments />
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
          <ModelSelector
            onOpenChange={setModelSelectorOpen}
            open={modelSelectorOpen}
          >
            <ModelSelectorTrigger asChild>
              <PromptInputButton size="sm">
                {selectedModelData ? (
                  <>
                    <ModelSelectorLogo
                      provider={PROVIDER_SLUG[selectedModelData.provider]}
                    />
                    <ModelSelectorName>
                      {selectedModelData.label}
                    </ModelSelectorName>
                  </>
                ) : (
                  <ModelSelectorName>Select model</ModelSelectorName>
                )}
              </PromptInputButton>
            </ModelSelectorTrigger>
            <ModelSelectorContent>
              <ModelSelectorInput placeholder="Search models..." />
              <ModelSelectorList>
                <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                {chat.ALL_PROVIDERS.map((provider) => {
                  const isConfigured = configuredProviders.has(provider);
                  const providerModels = chat.BUILTIN_MODELS[provider];
                  return (
                    <ModelSelectorGroup
                      heading={chat.PROVIDER_META[provider].label}
                      key={provider}
                    >
                      {isConfigured ? (
                        providerModels.map((m) => {
                          const key = `${m.provider}:${m.id}`;
                          return (
                            <ModelSelectorItem
                              key={key}
                              value={`${m.label} ${chat.PROVIDER_META[m.provider].label}`}
                              onSelect={() => {
                                chat.setSelectedModel(key);
                                setModelSelectorOpen(false);
                              }}
                            >
                              <ModelSelectorLogo
                                provider={PROVIDER_SLUG[m.provider]}
                              />
                              <ModelSelectorName>{m.label}</ModelSelectorName>
                              {chat.selectedModel === key ? (
                                <CheckIcon className="ml-auto size-4" />
                              ) : (
                                <div className="ml-auto size-4" />
                              )}
                            </ModelSelectorItem>
                          );
                        })
                      ) : (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          Add API key in settings to use{" "}
                          {chat.PROVIDER_META[provider].label} models
                        </div>
                      )}
                    </ModelSelectorGroup>
                  );
                })}
              </ModelSelectorList>
            </ModelSelectorContent>
          </ModelSelector>
        </PromptInputTools>
        <PromptInputSubmit status={chat.status} />
      </PromptInputFooter>
    </PromptInput>
  );

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 shrink-0">
        <span className="text-xs tracking-[0.1em] text-muted-foreground">
          Autoscene
        </span>
        <div className="flex items-center gap-1.5">
          <SettingsDialog />
        </div>
      </header>

      {hasMessages ? (
        <>
          <Conversation>
            <ConversationContent className="gap-4 p-3 max-w-2xl mx-auto w-full">
              <ChatMessages messages={chat.messages} />
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <div className="p-3 max-w-2xl mx-auto w-full shrink-0">
            {promptInputJSX}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-2xl px-3">
            <div className="text-center mb-6">
              <h1 className="text-lg font-medium tracking-tight text-foreground/80">
                autoscene
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Describe a 3D scene or upload an image
              </p>
            </div>
            {promptInputJSX}
          </div>
        </div>
      )}
    </div>
  );
}
