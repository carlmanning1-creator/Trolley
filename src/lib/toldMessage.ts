// The message after "Tell everyone": who got the notification, and who couldn't.

function names(list: string[]): string {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

export function describeTold(result: { told?: string[]; notTold?: string[] }): string {
  const told = result.told ?? [];
  const notTold = result.notTold ?? [];
  const missing = notTold.length
    ? `${names(notTold)} ${notTold.length === 1 ? "doesn't" : "don't"} have notifications on yet (Settings, Notifications).`
    : "";
  if (told.length === 0) return notTold.length ? `Nobody was told. ${missing}` : "There's nobody else to tell.";
  return `Sent to ${names(told)}.${missing ? ` ${missing}` : ""}`;
}
