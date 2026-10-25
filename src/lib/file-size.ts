const KB = 1024;
const MB = 1024 * 1024;

/**
 * A file's size as a person reads it: "29 KB", "2.5 MB".
 *
 * Megabytes alone made a small photo "0.0MB". Under a megabyte it is
 * kilobytes, rounded up so anything at all is at least "1 KB".
 */
export function fileSize(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes <= 0) return "0 KB";
  return `${Math.max(1, Math.round(bytes / KB))} KB`;
}
