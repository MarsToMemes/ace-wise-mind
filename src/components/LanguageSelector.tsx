import { useI18n, Lang } from "@/lib/i18n";
import { Languages } from "lucide-react";

export const LanguageSelector = () => {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-muted p-1 text-xs">
      <Languages className="w-3.5 h-3.5 ml-1.5 text-muted-foreground" />
      {(["en", "fr"] as Lang[]).map(l => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-2.5 py-1 rounded transition font-semibold uppercase ${
            lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
};
