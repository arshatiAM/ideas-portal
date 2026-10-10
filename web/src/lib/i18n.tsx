"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";

const dict: Record<string, { en: string; ar: string }> = {
  brand: { en: "Ideas Portal", ar: "بوابة الأفكار" },
  nav_submit: { en: "Submit an idea", ar: "قدّم فكرتك" },
  nav_mine: { en: "My submissions", ar: "مشاركاتي" },
  nav_track: { en: "Track", ar: "تتبّع" },
  nav_leaderboard: { en: "Leaderboard", ar: "لوحة المتصدرين" },
  nav_admin: { en: "Admin", ar: "الإدارة" },
  nav_signin: { en: "Sign in", ar: "تسجيل الدخول" },
  nav_signout: { en: "Sign out", ar: "تسجيل الخروج" },
  hero_title: {
    en: "Help ease traffic between Dubai and Sharjah. The best ideas win.",
    ar: "ساهم في تخفيف الازدحام المروري بين دبي والشارقة. أفضل الأفكار تفوز بالجائزة.",
  },
  hero_sub: {
    en: "Open to everyone, anywhere in the world. Share your solution as a document, video, audio or text, get a reference ID instantly, and see how your idea scores.",
    ar: "المشاركة مفتوحة للجميع في أي مكان في العالم. قدّم حلّك كمستند أو فيديو أو صوت أو نص، واحصل على رقم مرجعي فورًا، وتعرّف على تقييم فكرتك.",
  },
  cta_submit: { en: "Submit your idea", ar: "قدّم فكرتك" },
  cta_start: { en: "Get started", ar: "ابدأ الآن" },
  cta_board: { en: "See the leaderboard", ar: "عرض لوحة المتصدرين" },
  prize: { en: "Prize pool", ar: "قيمة الجائزة" },
  closes: { en: "Closes", ar: "آخر موعد" },
  who_for: { en: "Who is it for?", ar: "لمن هذه المنصة؟" },
  how_title: { en: "How it works", ar: "كيف تعمل المنصة" },
  step1_t: { en: "1. Submit", ar: "١. قدّم" },
  step1_d: {
    en: "Upload documents, diagrams, audio or video, or just write. State cost and timeline.",
    ar: "ارفع مستندات أو رسومًا أو صوتًا أو فيديو، أو اكتب فكرتك. اذكر التكلفة والمدة.",
  },
  step2_t: { en: "2. Get your ID", ar: "٢. احصل على رقمك" },
  step2_d: {
    en: "You receive a reference ID instantly and can track progress at any time.",
    ar: "تحصل على رقم مرجعي فورًا ويمكنك متابعة التقدم في أي وقت.",
  },
  step3_t: { en: "3. Evaluated", ar: "٣. التقييم" },
  step3_d: {
    en: "AI reads every format and scores impact, cost, feasibility, sustainability and originality.",
    ar: "يقرأ الذكاء الاصطناعي كل الصيغ ويقيّم الأثر والتكلفة والجدوى والاستدامة والأصالة.",
  },
  step4_t: { en: "4. Judged by people", ar: "٤. تحكيم بشري" },
  step4_d: {
    en: "Evaluators review the top ideas, eligibility is verified, and winners are published.",
    ar: "يراجع المحكّمون أفضل الأفكار ويتم التحقق من الأهلية ثم تُعلن أسماء الفائزين.",
  },
  footer: {
    en: "Scores are produced by AI with a transparent rubric and reviewed by people before winners are announced.",
    ar: "تُنتج الدرجات بواسطة الذكاء الاصطناعي وفق معايير شفافة وتُراجع من قبل مختصين قبل إعلان الفائزين.",
  },
};

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const Ctx = createContext<I18n | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "ar" || saved === "en") setLangState(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("lang", l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback((key: string) => dict[key]?.[lang] ?? dict[key]?.en ?? key, [lang]);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n must be used inside LangProvider");
  return v;
}
