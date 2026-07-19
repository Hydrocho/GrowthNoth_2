(function (root) {
  "use strict";

  const PRAISE_ITEMS = [
    { id: "presentation", label: "발표를 잘했어요", xp: 10 },
    { id: "help_friend", label: "친구를 도왔어요", xp: 10 },
    { id: "focus", label: "끝까지 집중했어요", xp: 10 },
    { id: "assignment", label: "과제를 완성했어요", xp: 20 }
  ];

  function buildLevels() {
    const levels = [];
    let currentXP = 0;

    for (let level = 1; level <= 50; level += 1) {
      levels.push({ level, threshold: currentXP });
      currentXP += 100;
    }

    return levels;
  }

  const LEVELS = buildLevels();

  function calculateLevel(totalXp) {
    const xp = Number(totalXp || 0);

    for (let i = LEVELS.length - 1; i >= 0; i -= 1) {
      if (xp >= LEVELS[i].threshold) {
        return LEVELS[i].level;
      }
    }

    return 1;
  }

  function getLevelProgress(totalXp) {
    const xp = Number(totalXp || 0);
    const currentLevel = calculateLevel(xp);
    const current = LEVELS.find((item) => item.level === currentLevel) || LEVELS[0];
    const next = LEVELS.find((item) => item.level === currentLevel + 1);

    if (!next) {
      return { currentLevel, currentXp: xp, nextXp: null, percent: 100 };
    }

    const span = next.threshold - current.threshold;
    const gained = xp - current.threshold;

    return {
      currentLevel,
      currentXp: xp,
      nextXp: next.threshold,
      percent: Math.max(0, Math.min(100, Math.round((gained / span) * 100)))
    };
  }

  function pad3(value) {
    return String(value).padStart(3, "0");
  }

  function normalizeStudentId(value) {
    const digits = String(value || "").replace(/\D/g, "");

    if (digits.length === 4) {
      return `${digits.slice(0, 1)}0${digits.slice(1)}`;
    }

    return digits;
  }

  const AVATAR_POOL = [];
  for (let id = 1; id <= 100; id += 1) {
    AVATAR_POOL.push({ avatar_id: pad3(id), gender: "1" });
    AVATAR_POOL.push({ avatar_id: pad3(id), gender: "2" });
  }

  const PET_POOL = [];
  for (let id = 1; id <= 100; id += 1) {
    PET_POOL.push({ pet_id: pad3(id) });
  }

  const STARTER_AVATARS = [
    { gender: "1", avatar_id: "001" },
    { gender: "2", avatar_id: "001" }
  ];

  function ownsStarterAvatar(avatars) {
    const list = Array.isArray(avatars) ? avatars : [];
    return STARTER_AVATARS.some((starter) =>
      list.some((avatar) =>
        String(avatar.gender) === starter.gender &&
        String(avatar.avatar_id) === starter.avatar_id
      )
    );
  }

  function needsStarterAvatarGift(avatars) {
    return !ownsStarterAvatar(avatars);
  }

  function avatarImagePath(avatar) {
    const gender = avatar && avatar.gender ? avatar.gender : "1";
    const avatarId = avatar && avatar.avatar_id ? avatar.avatar_id : "001";
    return `assets/img/avatarLibrary_IMG/avatarLibrary_${gender}_${avatarId}.png`;
  }

  function levelAvatarImagePath(student) {
    const current = student && student.current_avatar_num ? student.current_avatar_num : "1_001";
    const parts = current.split("_");
    const gender = parts[0] === "2" ? "2" : "1";
    return `assets/img/avatarLibrary_IMG/avatarLibrary_${gender}_001.png`;
  }

  function petImagePath(pet) {
    const petId = pet && pet.pet_id ? pet.pet_id : "000";
    return `assets/img/myPet_IMG/myPet_${petId}.png`;
  }

  async function hashPin(pin) {
    const val = String(pin || "");
    if (typeof window === "undefined" && typeof require !== "undefined") {
      const cryptoNode = require("crypto");
      return cryptoNode.createHash("sha256").update(val).digest("hex");
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(val);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function cssSize(value) {
    return typeof value === "number" ? `${value}px` : value;
  }

  function getReceiptPetOffset(settings) {
    const receiptPet = root.ReceiptCore &&
      root.ReceiptCore.LAYOUT &&
      root.ReceiptCore.LAYOUT.PET;

    if (receiptPet) {
      return {
        x: typeof receiptPet.x === "number" ? receiptPet.x : 0,
        y: typeof receiptPet.y === "number" ? receiptPet.y : 0
      };
    }

    return {
      x: typeof settings.receiptPetX === "number" ? settings.receiptPetX : 0,
      y: typeof settings.receiptPetY === "number" ? settings.receiptPetY : 0
    };
  }

  function getNormalizedPetSize(petSize) {
    const fallback = { width: "auto", height: `${petSize}px` };
    const media = root.ReceiptMedia;
    if (!media || typeof media.normalizeImageSize !== "function") {
      return fallback;
    }

    try {
      const normalized = media.normalizeImageSize({ width: petSize, height: petSize });
      if (normalized && typeof normalized === "object") {
        return {
          width: cssSize(normalized.width || fallback.width),
          height: cssSize(normalized.height || fallback.height)
        };
      }
    } catch (error) {
      // Fall back to local sizing when the shared receipt helper is unavailable or incompatible.
    }

    return fallback;
  }

  /**
   * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
   * [강력 경고] 절대로 이 함수의 반환값(위치, 크기, 정렬 등 레이아웃 수치)을 변경하지 마십시오!
   * 이 값들은 아바타와 마이펫을 차트 영역에 정밀하게 배치하여 겹쳐 그리는 데 사용되는 최적화된 수치입니다.
   * 임의로 수정할 시 전체 레이아웃 정렬이 완전히 어긋나거나 이미지 캡처/렌더링 시 심각한 UI 오류가 발생합니다.
   * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
   */
  function getAvatarPetLayout(settings) {
    const s = settings || {};
    const chartY = s.chartY || 0;
    const chartX = s.chartX || 0;
    const chartSize = s.chartSize || 200;
    const avatarY = s.avatarY || 0;
    const avatarX = s.avatarX || 0;
    const avatarSize = s.avatarSize || 120;
    const petY = s.petY || 0;
    const petX = s.petX || 0;
    const petSize = (s.petSize || 80) * (2 / 3);

    const receiptPetOffset = getReceiptPetOffset(s);
    const normalizedPetSize = getNormalizedPetSize(petSize);

    return {
      radarChart: {
        position: "absolute",
        top: `${115 + chartY}px`,
        left: `calc(50% + ${chartX}px)`,
        width: `${chartSize}px`,
        height: `${chartSize}px`,
        transform: "translate(-50%, -50%)",
        zIndex: 50
      },
      avatarImage: {
        position: "relative",
        height: `${avatarSize}px`,
        width: "auto",
        objectFit: "contain",
        marginBottom: `${avatarY}px`,
        zIndex: 20
      },
      petImage: {
        position: "relative",
        width: normalizedPetSize.width,
        height: normalizedPetSize.height,
        objectFit: "contain",
        marginBottom: `${petY}px`,
        marginLeft: "-10px",
        transform: `translate(${receiptPetOffset.x}px, ${receiptPetOffset.y}px)`,
        zIndex: 30
      }
    };
  }

  root.GrowthNoteRules = {
    PRAISE_ITEMS,
    LEVELS,
    AVATAR_POOL,
    PET_POOL,
    STARTER_AVATARS,
    ownsStarterAvatar,
    needsStarterAvatarGift,
    calculateLevel,
    getLevelProgress,
    normalizeStudentId,
    avatarImagePath,
    levelAvatarImagePath,
    petImagePath,
    hashPin,
    getAvatarPetLayout
  };
})(typeof window !== "undefined" ? window : globalThis);
