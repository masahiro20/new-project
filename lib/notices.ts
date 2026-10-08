// Trailing notices the generator appends to a stream when it could not finish.
// Shared with the client so an incomplete set is never cached as finished.
export const NOTICES = {
  refusal: "生成できませんでした。入力内容を見直して、もう一度お試しください。",
  maxTokens: "文字数の上限に達したため、途中で終了しました。",
  rateLimited: "現在混み合っています。少し時間をおいて再度お試しください。",
  error: "生成中にエラーが発生しました。時間をおいて再度お試しください。",
} as const;

export function endsWithNotice(text: string): boolean {
  const tail = text.trimEnd();
  return Object.values(NOTICES).some((n) => tail.endsWith(`> ${n}`));
}
