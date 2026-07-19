(function (root) {
  "use strict";

  function avatarKey(item) {
    return `${item.gender || "1"}_${item.avatar_id}`;
  }

  function petKey(item) {
    return item.pet_id;
  }

  function chooseFrom(items, random) {
    if (!items.length) return null;
    // 거듭제곱 지수 10.0을 적용하여 91~100번대 획득 확률을 약 1% 수준으로 제한 (앞 번호에 강력한 쏠림)
    const biasedRandom = Math.pow(random(), 10.0);
    const index = Math.floor(biasedRandom * items.length);
    return items[Math.max(0, Math.min(items.length - 1, index))];
  }

  function selectNextReward(options) {
    const rules = root.GrowthNoteRules;
    const ownedAvatars = options.ownedAvatars || [];
    const random = options.random || Math.random;

    const ownedAvatarKeys = new Set(ownedAvatars.map(avatarKey));
    const availableAvatars = rules.AVATAR_POOL.filter((item) => !ownedAvatarKeys.has(avatarKey(item)));

    if (!availableAvatars.length) return null;

    return { type: "avatar", item: chooseFrom(availableAvatars, random) };
  }

  function selectDailyPetReward(options) {
    const rules = root.GrowthNoteRules;
    const ownedPets = options.ownedPets || [];
    const random = options.random || Math.random;

    const ownedPetKeys = new Set(ownedPets.map(petKey));
    const availablePets = rules.PET_POOL.filter((item) => !ownedPetKeys.has(petKey(item)));

    if (!availablePets.length) return null;

    return { type: "pet", item: chooseFrom(availablePets, random) };
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
