(function (root) {
  "use strict";

  function avatarKey(item) {
    return `${item.gender || "1"}_${item.avatar_id}`;
  }

  function petKey(item) {
    return item.pet_id;
  }


  function selectNextReward(options) {
    const rules = root.GrowthNoteRules;
    const ownedAvatars = options.ownedAvatars || [];
    const random = options.random || Math.random;

    const ownedAvatarKeys = new Set(ownedAvatars.map(avatarKey));
    
    // 1. 남학생과 여학생 미획득 아바타 풀 분리
    const availableMale = rules.AVATAR_POOL.filter(
      (item) => item.gender === "1" && !ownedAvatarKeys.has(avatarKey(item))
    );
    const availableFemale = rules.AVATAR_POOL.filter(
      (item) => item.gender === "2" && !ownedAvatarKeys.has(avatarKey(item))
    );

    // 둘 다 모두 수집했다면 null 반환
    if (!availableMale.length && !availableFemale.length) return null;

    // 2. 성별을 50:50 확률로 먼저 결정 (한쪽 성별을 다 모았다면 남은 성별로 자동 대체)
    let selectedGender;
    if (availableMale.length && availableFemale.length) {
      selectedGender = random() < 0.5 ? "1" : "2";
    } else {
      selectedGender = availableMale.length ? "1" : "2";
    }

    const availableList = selectedGender === "1" ? availableMale : availableFemale;
    const ownedOfGender = ownedAvatars.filter((item) => String(item.gender) === selectedGender);

    // 3. 등급 돌파 확률 판정 (마이펫 방식 동일화)
    const r = random();
    let targetTier = null;
    if (r < 0.001) {
      targetTier = "Mythic";
    } else if (r < 0.005) {
      targetTier = "Legendary";
    } else if (r < 0.035) {
      targetTier = "Epic";
    } else if (r < 0.115) {
      targetTier = "Rare";
    }

    function getAvatarTier(avatarIdStr) {
      const id = parseInt(avatarIdStr, 10);
      if (id >= 1 && id <= 30) return "Common";
      if (id >= 31 && id <= 50) return "Rare";
      if (id >= 51 && id <= 70) return "Epic";
      if (id >= 71 && id <= 90) return "Legendary";
      return "Mythic";
    }

    // 돌파 판정이 떴고, 해당 등급의 미획득 아바타가 있다면 무작위 지급
    if (targetTier) {
      const tierAvatars = availableList.filter((item) => getAvatarTier(item.avatar_id) === targetTier);
      if (tierAvatars.length > 0) {
        const idx = Math.floor(random() * tierAvatars.length);
        return { type: "avatar", item: tierAvatars[idx] };
      }
    }

    // 4. 기본 모드: 슬라이딩 윈도우 방식 (해당 성별의 보유 개수 M + 15 범위 제한)
    const M = ownedOfGender.length;
    const maxWindowId = M + 15;

    const windowAvatars = availableList.filter((item) => {
      const id = parseInt(item.avatar_id, 10);
      return id <= maxWindowId;
    });

    if (windowAvatars.length > 0) {
      const idx = Math.floor(random() * windowAvatars.length);
      return { type: "avatar", item: windowAvatars[idx] };
    }

    // 5. Fallback: 윈도우 내 미획득 아바타가 없으면 남은 모든 아바타 중 무작위
    const idx = Math.floor(random() * availableList.length);
    return { type: "avatar", item: availableList[idx] };
  }

  function selectDailyPetReward(options) {
    const rules = root.GrowthNoteRules;
    const ownedPets = options.ownedPets || [];
    const random = options.random || Math.random;

    const ownedPetKeys = new Set(ownedPets.map(petKey));
    const availablePets = rules.PET_POOL.filter((item) => !ownedPetKeys.has(petKey(item)));

    if (!availablePets.length) return null;

    // 1. 등급 돌파 확률 판정 (Method C)
    const r = random();
    let targetTier = null;
    if (r < 0.001) {
      targetTier = "Mythic";
    } else if (r < 0.005) {
      targetTier = "Legendary";
    } else if (r < 0.035) {
      targetTier = "Epic";
    } else if (r < 0.115) {
      targetTier = "Rare";
    }

    function getPetTier(petIdStr) {
      const id = parseInt(petIdStr, 10);
      if (id >= 1 && id <= 30) return "Common";
      if (id >= 31 && id <= 50) return "Rare";
      if (id >= 51 && id <= 70) return "Epic";
      if (id >= 71 && id <= 90) return "Legendary";
      return "Mythic";
    }

    // 돌파 판정이 떴고, 해당 등급의 미획득 펫이 있다면 무작위 지급
    if (targetTier) {
      const tierPets = availablePets.filter((item) => getPetTier(item.pet_id) === targetTier);
      if (tierPets.length > 0) {
        const idx = Math.floor(random() * tierPets.length);
        return { type: "pet", item: tierPets[idx] };
      }
    }

    // 2. 기본 모드: 슬라이딩 윈도우 방식 (보유 개수 M + 15 범위 제한)
    const M = ownedPets.length;
    const maxWindowId = M + 15;

    const windowPets = availablePets.filter((item) => {
      const id = parseInt(item.pet_id, 10);
      return id <= maxWindowId;
    });

    if (windowPets.length > 0) {
      const idx = Math.floor(random() * windowPets.length);
      return { type: "pet", item: windowPets[idx] };
    }

    // 3. 대체 방안 (Fallback): 윈도우 내 미획득 펫이 없으면 남은 모든 펫 중 랜덤
    const idx = Math.floor(random() * availablePets.length);
    return { type: "pet", item: availablePets[idx] };
  }

  async function assignPraise(studentId, praiseItemId, options) {
    const rules = root.GrowthNoteRules;
    const client = root.GrowthNoteSupabase.getClient();
    let praise = rules.PRAISE_ITEMS.find((item) => item.id === praiseItemId);
    
    // custom praise 이거나 rules에 없는 경우 기본 커스텀 객체 생성
    if (!praise) {
      praise = {
        id: praiseItemId || "custom",
        label: "칭찬 점수 부여",
        xp: options && typeof options.customXp === "number" ? options.customXp : 10
      };
    }

    const note = options && options.note ? String(options.note).trim() : "";
    const xpChange = options && typeof options.customXp === "number" ? options.customXp : praise.xp;

    const { data: student, error: studentError } = await client
      .from("students")
      .select("*")
      .eq("id", studentId)
      .single();

    if (studentError) throw studentError;

    const [{ data: ownedAvatars, error: avatarError }, { data: ownedPets, error: petError }] =
      await Promise.all([
        client.from("unlocked_avatars").select("avatar_id, gender").eq("student_id", studentId),
        client.from("unlocked_pets").select("pet_id").eq("student_id", studentId)
      ]);

    if (avatarError) throw avatarError;
    if (petError) throw petError;

    const oldXp = Number(student.total_xp || 0);
    const oldLevel = Number(student.level || rules.calculateLevel(oldXp));
    const newXp = oldXp + xpChange;
    const newLevel = rules.calculateLevel(newXp);
    const reward = null;

    const studentUpdate = {
      total_xp: newXp,
      level: newLevel
    };

    const { error: updateError } = await client
      .from("students")
      .update(studentUpdate)
      .eq("id", studentId);

    if (updateError) throw updateError;

    if (reward && reward.type === "avatar") {
      const { error } = await client.from("unlocked_avatars").insert({
        student_id: studentId,
        avatar_id: reward.item.avatar_id,
        gender: reward.item.gender,
        quantity: 1
      });
      if (error) throw error;
    }

    if (reward && reward.type === "pet") {
      const { error } = await client.from("unlocked_pets").insert({
        student_id: studentId,
        pet_id: reward.item.pet_id,
        quantity: 1
      });
      if (error) throw error;
    }

    const rewardId = reward
      ? reward.type === "avatar"
        ? `${reward.item.gender}_${reward.item.avatar_id}`
        : reward.item.pet_id
      : null;

    const { error: logError } = await client.from("student_logs").insert({
      student_id: studentId,
      type: "praise",
      category: praise.id,
      description: note ? `${praise.label} - ${note}` : (praise.id === "custom" ? "칭찬 점수 부여" : praise.label),
      xp_change: xpChange,
      reward_type: reward ? reward.type : null,
      reward_id: rewardId,
      level_before: oldLevel,
      level_after: newLevel
    });

    if (logError) throw logError;

    return {
      praise,
      oldXp,
      newXp,
      oldLevel,
      newLevel,
      reward
    };
  }

  root.GrowthNoteRewards = {
    selectNextReward,
    selectDailyPetReward,
    assignPraise
  };
})(typeof window !== "undefined" ? window : globalThis);
