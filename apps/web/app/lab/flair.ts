// Dora's catchphrases follow the language being learned ("amigo" is Spanish; English-only gets "friend").
const FRIEND: Record<string, string> = { "": "friend", es: "amigo", fr: "mon ami", de: "mein Freund", zh: "朋友", hi: "दोस्त", ja: "友達" };

export const localFlair = (text: string, language: string) => text.replace(/\bamigos?\b/gi, FRIEND[language] ?? "friend");
