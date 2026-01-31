interface Props {
  message: string;
  progress?: number;
}

export function LoadingState({ message, progress }: Props) {
  const barWidth = 30;
  const filled =
    progress != null ? Math.round((progress / 100) * barWidth) : 0;
  const bar =
    progress != null
      ? `[${"#".repeat(filled)}${".".repeat(barWidth - filled)}]`
      : "";

  return (
    <pre className="loading-pre">
      {`
  ${message}
  ${bar}${progress != null ? ` ${Math.round(progress)}%` : ""}
`}
    </pre>
  );
}
