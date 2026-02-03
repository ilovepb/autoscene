import { CheckIcon, MessageSquare } from "lucide-react";
import { useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
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
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { ChatMessages } from "@/components/ChatMessageParts";
import type { ChatManager } from "@/hooks/useChatManager";

interface Props {
  chat: ChatManager;
  open: boolean;
}

const PROVIDER_SLUG: Record<string, string> = {
  cerebras: "cerebras",
  groq: "groq",
  openai: "openai",
  anthropic: "anthropic",
};

export function ChatSidebar({ chat, open }: Props) {
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  const settings = chat.loadSettings();
  const availableModels = chat.getAvailableModels(settings);
  const parsed = chat.parseModelKey(chat.selectedModel);
  const selectedModelData = availableModels.find(
    (m) => m.provider === parsed.provider && m.id === parsed.model,
  );

  const configuredProviders = new Set(
    chat.ALL_PROVIDERS.filter((p) => settings.providers[p].apiKey),
  );

  if (!open) return null;

  return (
    <div className="flex flex-col h-full w-96 border-l border-border bg-background shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <MessageSquare className="size-4 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium tracking-wide text-muted-foreground">
          Scene agent
        </span>
      </div>

      {/* Messages */}
      <Conversation>
        <ConversationContent className="gap-4 p-3">
          {chat.messages.length === 0 && (
            <ConversationEmptyState
              title="Scene agent"
              description="Describe what to add to your 3D scene"
            />
          )}
          <ChatMessages messages={chat.messages} />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <PromptInput
          onSubmit={({ text }) => {
            chat.sendMessage({ text });
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea placeholder="Add a sphere, terrain, trees..." />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
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
                                  <ModelSelectorName>
                                    {m.label}
                                  </ModelSelectorName>
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
      </div>
    </div>
  );
}
