import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Props {
  message: string;
  progress?: number;
}

export function LoadingState({ message, progress }: Props) {
  return (
    <Card className="w-80">
      <CardContent className="flex flex-col gap-4 py-8">
        <p className="text-sm text-center text-muted-foreground">{message}</p>
        {progress != null && <Progress value={progress} aria-label="Loading" />}
      </CardContent>
    </Card>
  );
}
