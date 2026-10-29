import ru from "@/messages/ru.json";
import en from "@/messages/en.json";
import type { Locale } from "./config";

export type Messages = typeof ru;
export const messageCatalogs: Record<Locale, Messages> = { ru, en };
