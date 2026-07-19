(function (root) {
  "use strict";

  let client = null;

  function getConfig() {
    return root.GROWTH_NOTE_SUPABASE || null;
  }

  function validateConfig(config) {
    if (!config || !config.url || !config.anonKey) {
      throw new Error("assets/js/supabase-config.js 파일을 새 Supabase 프로젝트 정보로 만들어 주세요.");
    }

    if (
      config.url.includes("YOUR-NEW-PROJECT") ||
      config.anonKey.includes("YOUR-NEW-PROJECT")
    ) {
      throw new Error("supabase-config.js의 placeholder를 새 Supabase URL과 anon key로 교체해 주세요.");
    }
  }

  function getClient() {
    if (client) return client;

    if (!root.supabase || !root.supabase.createClient) {
      throw new Error("Supabase CDN 라이브러리를 불러오지 못했습니다.");
    }

    const config = getConfig();
    validateConfig(config);
    client = root.supabase.createClient(config.url, config.anonKey);
    return client;
  }

  function formatError(error) {
    if (!error) return "알 수 없는 오류가 발생했습니다.";
    if (typeof error === "string") return error;
    return error.message || "알 수 없는 오류가 발생했습니다.";
  }

  root.GrowthNoteSupabase = {
    getClient,
    formatError
  };
})(typeof window !== "undefined" ? window : globalThis);

