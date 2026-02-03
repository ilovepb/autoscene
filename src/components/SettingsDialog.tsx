import { Settings } from "lucide-react";
import { useCallback, useState } from "react";
import { KeysForm } from "@/components/settings/KeysForm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useKeysForm } from "@/hooks/useKeysForm";

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const { form, configuredCount, handleSave, reset } = useKeysForm();

  const handleOpen = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) reset();
      setOpen(nextOpen);
    },
    [reset],
  );

  const onSave = useCallback(() => {
    handleSave(() => setOpen(false));
  }, [handleSave]);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/5 backdrop-blur-sm"
          aria-label="settings"
        >
          <Settings className="size-3.5" />
        </Button>
      </DialogTrigger>

      <DialogContent showCloseButton={false} className="p-0 gap-0 sm:max-w-sm">
        <KeysForm
          form={form}
          configuredCount={configuredCount}
          onSave={onSave}
        />
      </DialogContent>
    </Dialog>
  );
}
