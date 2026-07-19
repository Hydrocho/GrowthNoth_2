(function () {
  "use strict";

  const studentId = sessionStorage.getItem("growth-note-student-id");
  const status = document.getElementById("student-status");
  let dashboardModel = null;
  let dailyDrawInProgress = false;
  let avatarDrawInProgress = false;
  let realtimeChannel = null;

  function setStatus(message, isError) {
    status.textContent = message || "";
    status.classList.toggle("error", Boolean(isError));
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function setImage(id, src) {
    const element = document.getElementById(id);
    if (element) element.src = src;
  }

  function displayStudentName(student) {
    return student.school_id || "";
  }

  function todayKoreaDateString(now) {
    const date = now || new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const values = {};
    parts.forEach((part) => {
      if (part.type !== "literal") values[part.type] = part.value;
    });
    return `${values.year}-${values.month}-${values.day}`;
  }

  function isDuplicateDailyDrawError(error) {
    return error && (
      error.code === "23505" ||
      String(error.message || "").includes("daily_pet_draws_student_id_draw_date_key")
    );
  }

  function getItemTierInfo(idStr) {
    const id = parseInt(idStr, 10);
    if (id >= 1 && id <= 30) {
      return { name: "Common", color: "#64748b", bg: "#f1f5f9", probability: "기본 범위" };
    } else if (id >= 31 && id <= 50) {
      return { name: "Rare", color: "#3b82f6", bg: "#dbeafe", probability: "돌파 8.0%" };
    } else if (id >= 51 && id <= 70) {
      return { name: "Epic", color: "#a855f7", bg: "#f3e8ff", probability: "돌파 3.0%" };
    } else if (id >= 71 && id <= 90) {
      return { name: "Legendary", color: "#eab308", bg: "#fef9c3", probability: "돌파 0.4%" };
    } else { // 91 ~ 100
      return { name: "Mythic", color: "#ef4444", bg: "#fee2e2", probability: "돌파 0.1%" };
    }
  }

  function setStarterAvatarModalOpen(isOpen) {
    const modal = document.getElementById("starter-avatar-modal");
    if (!modal) return;
    modal.classList.toggle("active", Boolean(isOpen));
  }

  function setStarterAvatarButtonsDisabled(isDisabled) {
    document.querySelectorAll("[data-starter-avatar]").forEach((button) => {
      button.disabled = Boolean(isDisabled);
    });
  }

  function currentAvatarPath(student, avatars) {
    if (student.display_avatar_type === "library" && student.current_avatar_num) {
      const parts = student.current_avatar_num.split("_");
      return window.GrowthNoteRules.avatarImagePath({
        gender: parts[0] || "1",
        avatar_id: parts[1] || "001"
      });
    }

    if (avatars.length) {
      return window.GrowthNoteRules.avatarImagePath(avatars[0]);
    }

    return window.GrowthNoteRules.levelAvatarImagePath(student);
  }

  let repConfirmCallback = null;

  function showRepConfirmModal(message, imageSrc, idStr, callback) {
    const modal = document.getElementById("rep-confirm-modal");
    const msgEl = document.getElementById("rep-confirm-message");
    const imgEl = document.getElementById("rep-confirm-image");
    const badgeEl = document.getElementById("rep-confirm-tier-badge");
    if (!modal || !msgEl || !imgEl || !badgeEl) return;

    msgEl.textContent = message;
    imgEl.src = imageSrc;

    // 등급 정보 바인딩 (획득 확률 노출 제거)
    const tier = getItemTierInfo(idStr);
    badgeEl.textContent = tier.name;
    badgeEl.style.color = tier.color;
    badgeEl.style.backgroundColor = tier.bg;
    badgeEl.style.border = `1px solid ${tier.color}`;

    repConfirmCallback = callback;
    modal.classList.add("active");
  }

  function closeRepConfirmModal() {
    const modal = document.getElementById("rep-confirm-modal");
    if (modal) modal.classList.remove("active");
    repConfirmCallback = null;
  }

  // 대표 아바타 설정
  function setDefaultAvatar(gender, avatarId) {
    const imageSrc = `assets/img/avatarLibrary_IMG/avatarLibrary_${gender}_${avatarId}.png`;
    showRepConfirmModal("선택한 아바타를 대표 프로필 아바타로 설정하시겠습니까?", imageSrc, avatarId, async () => {
      try {
        setStatus("대표 아바타를 변경하고 있습니다...");
        const client = window.GrowthNoteSupabase.getClient();
        const { error } = await client
          .from("students")
          .update({
            current_avatar_num: `${gender}_${avatarId}`,
            display_avatar_type: "library"
          })
          .eq("id", studentId);

        if (error) throw error;
        loadDashboard();
      } catch (e) {
        alert("아바타 설정 실패: " + e.message);
        setStatus("아바타 설정 오류: " + e.message, true);
      }
    });
  }

  // 대표 마이펫 설정
  function setDefaultPet(petId) {
    const imageSrc = `assets/img/myPet_IMG/myPet_${petId}.png`;
    showRepConfirmModal("선택한 마이펫을 함께하는 대표 마이펫으로 설정하시겠습니까?", imageSrc, petId, async () => {
      try {
        setStatus("대표 마이펫을 변경하고 있습니다...");
        const client = window.GrowthNoteSupabase.getClient();
        const { error } = await client
          .from("students")
          .update({
            current_pet_num: petId
          })
          .eq("id", studentId);

        if (error) throw error;
        loadDashboard();
      } catch (e) {
        alert("마이펫 설정 실패: " + e.message);
        setStatus("마이펫 설정 오류: " + e.message, true);
      }
    });
  }

  function renderCollection(containerId, unlockedItems, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    if (type === "avatar") {
      const activeGenderBtn = document.querySelector("[data-gender-target].active");
      const currentGender = activeGenderBtn ? activeGenderBtn.dataset.genderTarget : "1";

      for (let idNum = 1; idNum <= 100; idNum++) {
        const avatarId = String(idNum).padStart(3, "0");
        const isUnlocked = unlockedItems.some(
          (item) => item.avatar_id === avatarId && String(item.gender) === String(currentGender)
        );

        const cell = document.createElement("div");
        cell.className = `collection-item${isUnlocked ? " unlocked" : " locked"}`;

        // 등급 정보 맵핑하여 클래스 부여
        const tier = getItemTierInfo(avatarId);
        cell.classList.add(`tier-${tier.name.toLowerCase()}`);
        
        const img = document.createElement("img");
        if (isUnlocked) {
          img.src = `assets/img/avatarLibrary_IMG/avatarLibrary_${currentGender}_${avatarId}.png`;
          img.alt = `아바타 ${avatarId}`;
          cell.style.cursor = "pointer";
          cell.title = `대표 아바타로 설정 (${tier.name})`;
          cell.addEventListener("click", () => setDefaultAvatar(currentGender, avatarId));
        } else {
          img.src = `assets/img/avatarLibrary_IMG/avatarLibraryShadow_${currentGender}_${avatarId}.png`;
          img.alt = "미획득 아바타";
          cell.style.opacity = "0.25"; // 미획득은 흐릿하고 어둡게 처리
        }

        cell.appendChild(img);
        container.appendChild(cell);
      }
    } else if (type === "pet") {
      for (let idNum = 1; idNum <= 100; idNum++) {
        const petId = String(idNum).padStart(3, "0");
        const isUnlocked = unlockedItems.some((item) => item.pet_id === petId);

        const cell = document.createElement("div");
        cell.className = `collection-item${isUnlocked ? " unlocked" : " locked"}`;

        // 등급 정보 맵핑하여 클래스 부여
        const tier = getItemTierInfo(petId);
        cell.classList.add(`tier-${tier.name.toLowerCase()}`);

        const img = document.createElement("img");
        if (isUnlocked) {
          img.src = `assets/img/myPet_IMG/myPet_${petId}.png`;
          img.alt = `마이펫 ${petId}`;
          cell.style.cursor = "pointer";
          cell.title = `대표 마이펫으로 설정 (${tier.name})`;
          cell.addEventListener("click", () => setDefaultPet(petId));
        } else {
          img.src = `assets/img/myPet_IMG/myPetShadow_${petId}.png`;
          img.alt = "미획득 마이펫";
          cell.style.opacity = "0.25";
        }

        cell.appendChild(img);
        container.appendChild(cell);
      }
    }
  }

  function renderLogs(logs) {
    const container = document.getElementById("log-list");
    container.innerHTML = "";

    if (!logs.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "아직 칭찬 기록이 없습니다.";
      container.appendChild(empty);
      return;
    }

    for (const log of logs) {
      const item = document.createElement("article");
      item.className = "timeline-item";
      const reward = log.reward_type ? `${log.reward_type} ${log.reward_id}` : "보상 없음";
      const date = log.created_at ? new Date(log.created_at).toLocaleString("ko-KR") : "";
      item.innerHTML = `
        <div class="timeline-icon"><span class="material-symbols-outlined">stars</span></div>
        <div>
          <strong>${log.description || log.category}</strong>
          <p>+${log.xp_change} XP · ${reward}</p>
          <time>${date}</time>
        </div>
      `;
      container.appendChild(item);
    }
  }

  function renderDailyPetDraw(draws, pets, extraTickets) {
    const card = document.getElementById("daily-pet-draw-card");
    const button = document.getElementById("daily-pet-draw-button");
    const statusText = document.getElementById("daily-pet-draw-status");
    if (!card || !button || !statusText) return;

    const buttonText = button.querySelector("span:last-child");
    const hasDrawnToday = Boolean(draws && draws.length);
    const hasEveryPet = (pets || []).length >= window.GrowthNoteRules.PET_POOL.length;

    const canDraw = (!hasDrawnToday || (extraTickets || 0) > 0) && !hasEveryPet;
    button.disabled = !canDraw || dailyDrawInProgress;

    if (hasEveryPet) {
      card.dataset.dailyDrawState = "complete";
      statusText.textContent = "모든 마이펫을 모았어요.";
      if (buttonText) buttonText.textContent = "완료";
      return;
    }

    if (hasDrawnToday) {
      if ((extraTickets || 0) > 0) {
        card.dataset.dailyDrawState = "ready";
        statusText.innerHTML = `오늘의 뽑기를 완료했지만, <strong>추가 뽑기권이 ${extraTickets}개</strong> 있어요!`;
        if (buttonText) buttonText.textContent = dailyDrawInProgress ? "진행 중" : "추가 뽑기";
      } else {
        card.dataset.dailyDrawState = "done";
        statusText.innerHTML = "오늘의 마이펫 뽑기를 완료했어요.<br>내일 다시 만나요.";
        if (buttonText) buttonText.textContent = "완료";
      }
      return;
    }

    card.dataset.dailyDrawState = "ready";
    statusText.innerHTML = (extraTickets || 0) > 0
      ? `오늘의 마이펫을 뽑아보세요! (추가 뽑기권 ${extraTickets}개 보유)`
      : "하루에 한 번 새로운 마이펫을 직접 뽑을 수 있어요.";
    if (buttonText) buttonText.textContent = dailyDrawInProgress ? "진행 중" : "뽑기";
  }

  function renderAvatarDraw(student, avatars) {
    const card = document.getElementById("avatar-draw-card");
    const button = document.getElementById("avatar-draw-button");
    const statusText = document.getElementById("avatar-draw-status");
    if (!card || !button || !statusText) return;

    const buttonText = button.querySelector("span:last-child");
    const allowedCount = Math.floor((student.total_xp || 0) / 10);
    const ownedCount = (avatars || []).length;
    const availableDraws = Math.max(0, allowedCount - ownedCount);

    const hasEveryAvatar = (avatars || []).length >= window.GrowthNoteRules.AVATAR_POOL.length;

    button.disabled = availableDraws <= 0 || hasEveryAvatar || avatarDrawInProgress;

    if (hasEveryAvatar) {
      statusText.textContent = "모든 아바타를 모았어요.";
      if (buttonText) buttonText.textContent = "완료";
      return;
    }

    if (availableDraws > 0) {
      statusText.innerHTML = `아바타 상자를 <strong>${availableDraws}개</strong> 더 열 수 있어요!`;
      if (buttonText) buttonText.textContent = avatarDrawInProgress ? "진행 중" : "상자 열기";
    } else {
      statusText.textContent = "칭찬 점수 10점마다 아바타를 뽑을 수 있어요.";
      if (buttonText) buttonText.textContent = "잠김";
    }
  }

  function renderDashboard(model) {
    dashboardModel = model;
    const student = model.student;
    const avatars = model.avatars;
    const pets = model.pets;
    const logs = model.logs;
    const progress = window.GrowthNoteRules.getLevelProgress(student.total_xp);
    const avatarPath = currentAvatarPath(student, avatars);
    const effectivePet = (student.current_pet_num && student.current_pet_num !== "000")
      ? student.current_pet_num
      : ((pets && pets.length) ? pets[0].pet_id : "000");
    const petPath = window.GrowthNoteRules.petImagePath({ pet_id: effectivePet });
    const displayName = displayStudentName(student);

    setText("student-name", displayName);
    setText("student-id-inline", student.school_id || "");
    setText("level-value", progress.currentLevel);
    setText("xp-value", Number(student.total_xp || 0).toLocaleString("ko-KR"));
    setText("next-level-value", progress.nextXp ? `다음 레벨까지 ${progress.nextXp} XP` : "최고 레벨입니다.");
    setText("avatar-count", avatars.length);
    setText("pet-count", pets.length);
    setText("settings-student-id", student.school_id || "-");
    setText("settings-student-xp", `${Number(student.total_xp || 0).toLocaleString("ko-KR")} XP (Lv. ${progress.currentLevel})`);
    setText("settings-student-avatar-count", `${avatars.length} / 200`);
    setText("settings-student-pet-count", `${pets.length} / 100`);

    document.getElementById("level-progress").style.width = `${progress.percent}%`;
    const circle = document.getElementById("xp-progress-circle");
    if (circle) {
      const circumference = 282.74;
      const offset = circumference * (1 - (progress.percent || 0) / 100);
      circle.style.strokeDashoffset = offset;
    }
    setImage("current-avatar", avatarPath);
    setImage("current-pet", petPath);

    // getAvatarPetLayout 함수를 불러와서 아바타와 펫의 크기/위치 정밀 대입
    const layoutSettings = {
      avatarY: 10,
      avatarX: -40,     // 50% 기준으로 아바타를 왼쪽에 배치
      avatarSize: 140,  // 아바타 크기
      petY: 10,
      petX: 40,         // 50% 기준으로 마이펫을 오른쪽에 배치
      receiptPetX: 0,
      receiptPetY: 0
    };
    const layout = window.GrowthNoteRules.getAvatarPetLayout(layoutSettings);

    const avatarEl = document.getElementById("current-avatar");
    const petEl = document.getElementById("current-pet");

    if (avatarEl) {
      Object.assign(avatarEl.style, layout.avatarImage);
    }
    if (petEl) {
      if (effectivePet && effectivePet !== "000") {
        petEl.style.display = "block";
        Object.assign(petEl.style, layout.petImage);
      } else {
        petEl.style.display = "none";
      }
    }

    renderCollection("avatar-grid", avatars, "avatar");
    renderCollection("pet-grid", pets, "pet");
    renderLogs(logs);
    renderDailyPetDraw(model.dailyDraws || [], pets, model.extraTickets || 0);
    renderAvatarDraw(student, avatars);
  }

  async function loadDashboard() {
    if (!studentId) {
      window.location.href = "student-login.html";
      return;
    }

    try {
      setStatus("데이터를 불러오는 중입니다.");
      const client = window.GrowthNoteSupabase.getClient();
      const today = todayKoreaDateString();
      const [
        { data: student, error: studentError },
        avatarsResult,
        petsResult,
        logsResult,
        dailyDrawsResult,
        grantedResult,
        usedResult
      ] = await Promise.all([
        client.from("students").select("*").eq("id", studentId).single(),
        client.from("unlocked_avatars").select("avatar_id, gender, unlocked_at").eq("student_id", studentId).order("unlocked_at", { ascending: false }),
        client.from("unlocked_pets").select("pet_id, unlocked_at").eq("student_id", studentId).order("unlocked_at", { ascending: false }),
        client.from("student_logs").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(10),
        client.from("daily_pet_draws").select("pet_id, draw_date, created_at").eq("student_id", studentId).eq("draw_date", today),
        client.from("student_logs").select("id", { count: "exact", head: true }).eq("student_id", studentId).eq("type", "pet_ticket_grant"),
        client.from("student_logs").select("id", { count: "exact", head: true }).eq("student_id", studentId).eq("type", "extra_pet_draw")
      ]);

      if (studentError) throw studentError;
      if (avatarsResult.error) throw avatarsResult.error;
      if (petsResult.error) throw petsResult.error;
      if (logsResult.error) throw logsResult.error;
      if (dailyDrawsResult.error) throw dailyDrawsResult.error;
      if (grantedResult.error) throw grantedResult.error;
      if (usedResult.error) throw usedResult.error;

      renderDashboard({
        student,
        avatars: avatarsResult.data || [],
        pets: petsResult.data || [],
        logs: logsResult.data || [],
        dailyDraws: dailyDrawsResult.data || [],
        extraTickets: Math.max(0, (grantedResult.count || 0) - (usedResult.count || 0))
      });
      setStarterAvatarModalOpen(
        window.GrowthNoteRules.needsStarterAvatarGift(avatarsResult.data || [])
      );
      setStatus("");
    } catch (error) {
      setStatus(window.GrowthNoteSupabase.formatError(error), true);
    }
  }

  function setupRealtimeSubscription() {
    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }

    try {
      const client = window.GrowthNoteSupabase.getClient();
      realtimeChannel = client
        .channel("student-realtime-changes")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "students"
          },
          (payload) => {
            if (payload.new && payload.new.id === studentId) {
              // 아바타/마이펫 뽑기 모달이 열려 있을 때는 실시간 갱신을 무시하여
              // 홈 화면의 이미지와 정보가 미리 바뀌는 버그를 방지합니다.
              const drawModal = document.getElementById("reward-draw-modal");
              if (drawModal && drawModal.classList.contains("active")) {
                return;
              }
              loadDashboard();
            }
          }
        )
        .subscribe();
    } catch (e) {
      console.error("Realtime subscription failed:", e);
    }
  }

  async function grantStarterAvatar(gender) {
    const selectedGender = String(gender) === "2" ? "2" : "1";
    const avatarId = "001";

    try {
      setStarterAvatarButtonsDisabled(true);
      setStatus("첫 아바타를 선물로 지급하고 있습니다...");

      const client = window.GrowthNoteSupabase.getClient();
      const { data: ownedAvatars, error: ownedError } = await client
        .from("unlocked_avatars")
        .select("avatar_id, gender")
        .eq("student_id", studentId);

      if (ownedError) throw ownedError;

      if (!window.GrowthNoteRules.needsStarterAvatarGift(ownedAvatars || [])) {
        setStarterAvatarModalOpen(false);
        loadDashboard();
        return;
      }

      const { error: insertError } = await client
        .from("unlocked_avatars")
        .insert({
          student_id: studentId,
          avatar_id: avatarId,
          gender: selectedGender
        });

      if (insertError) throw insertError;

      const { error: updateError } = await client
        .from("students")
        .update({
          current_avatar_num: `${selectedGender}_${avatarId}`,
          display_avatar_type: "library",
          total_xp: 10,
          level: 1
        })
        .eq("id", studentId);

      if (updateError) throw updateError;

      const { error: logError } = await client.from("student_logs").insert({
        student_id: studentId,
        type: "starter_avatar",
        category: "starter_avatar",
        description: "첫 아바타 선택",
        xp_change: 10,
        reward_type: "avatar",
        reward_id: `${selectedGender}_${avatarId}`
      });
      if (logError) throw logError;

      setStarterAvatarModalOpen(false);
      loadDashboard();
    } catch (error) {
      setStatus("첫 아바타 지급 오류: " + error.message, true);
      setStarterAvatarButtonsDisabled(false);
    }
  }

  function openRewardDrawModal(options) {
    const modal = document.getElementById("reward-draw-modal");
    const content = modal ? modal.querySelector(".reward-draw-content") : null;
    const title = document.getElementById("reward-draw-title");
    const copy = document.getElementById("reward-draw-copy");
    const closeButton = document.getElementById("reward-draw-close");
    const box = document.getElementById("reward-draw-box");
    const count = document.getElementById("reward-draw-count");
    const result = document.getElementById("reward-draw-result");
    const resultImage = document.getElementById("reward-draw-result-image");
    const resultTitle = document.getElementById("reward-draw-result-title");
    const resultCopy = document.getElementById("reward-draw-result-copy");
    if (!modal || !box || !count || !result || !resultImage || !resultTitle || !resultCopy) return;

    const resultHalo = document.getElementById("reward-draw-result-halo");
    const resultBadge = document.getElementById("reward-draw-result-tier-badge");
    if (resultHalo) resultHalo.style.display = "none";
    if (resultBadge) resultBadge.style.display = "none";

    let remaining = 10;
    let timerId = null;
    let isRevealed = false;

    function renderCount() {
      count.textContent = String(Math.max(0, remaining));
      box.classList.remove("tap-pop");
      window.requestAnimationFrame(() => box.classList.add("tap-pop"));
    }

    const confirmText = document.getElementById("reward-draw-confirm-text");
    const setRepBtn = document.getElementById("reward-draw-set-rep");
    const keepBtn = document.getElementById("reward-draw-keep");

    function reveal() {
      if (isRevealed) return;
      isRevealed = true;
      if (timerId) window.clearInterval(timerId);
      count.textContent = "0";
      box.classList.add("opened");
      if (content) {
        content.classList.remove("revealing");
        window.requestAnimationFrame(() => content.classList.add("revealing"));
      }
      if (copy) copy.hidden = true;
      box.disabled = true;
      result.hidden = false;
      resultImage.src = options.imageSrc;
      resultImage.alt = options.resultTitle || "";
      resultTitle.textContent = options.resultTitle || "";
      resultCopy.textContent = options.resultCopy || "";

      // 등급 및 후광 표시 연동
      if (options.rewardId && resultHalo && resultBadge) {
        let targetId = options.rewardId;
        if (targetId && targetId.includes("_")) {
          targetId = targetId.split("_")[1];
        }
        const tier = getItemTierInfo(targetId);
        
        // 등급 배지 설정
        resultBadge.textContent = tier.name;
        resultBadge.style.color = tier.color;
        resultBadge.style.backgroundColor = tier.bg;
        resultBadge.style.border = `1px solid ${tier.color}`;
        resultBadge.style.display = "inline-block";

        // 후광 색상 설정 (연하고 부드럽게)
        resultHalo.style.backgroundColor = tier.color;
        resultHalo.style.boxShadow = `0 0 36px 10px ${tier.color}`;
        resultHalo.style.display = "block";
      } else {
        if (resultBadge) resultBadge.style.display = "none";
        if (resultHalo) resultHalo.style.display = "none";
      }

      // 모달 내부에서 대표 설정 질문 및 버튼 동작 바인딩
      if (options.rewardId && confirmText && setRepBtn && keepBtn) {
        const typeKo = options.type === "avatar" ? "아바타" : "마이펫";
        confirmText.textContent = `방금 뽑은 ${typeKo}를 나의 대표 ${typeKo}로 설정하시겠습니까?`;

        setRepBtn.disabled = false;
        keepBtn.disabled = false;

        setRepBtn.onclick = async () => {
          setRepBtn.disabled = true;
          keepBtn.disabled = true;
          try {
            const client = window.GrowthNoteSupabase.getClient();
            const updateFields = options.type === "avatar"
              ? { current_avatar_num: options.rewardId, display_avatar_type: "library" }
              : { current_pet_num: options.rewardId };
            await client
              .from("students")
              .update(updateFields)
              .eq("id", studentId);
          } catch (err) {
            console.error("대표 설정 실패:", err);
          } finally {
            closeModal();
          }
        };

        keepBtn.onclick = () => {
          closeModal();
        };
      }
    }

    function tick(amount) {
      if (isRevealed) return;
      remaining -= amount;
      renderCount();
      if (remaining <= 0) reveal();
    }

    function closeModal() {
      if (timerId) window.clearInterval(timerId);
      modal.classList.remove("active");
      if (content) content.classList.remove("revealing");
      if (typeof options.onClose === "function") options.onClose();
    }

    if (title) title.textContent = options.title || "선물 상자를 열어 보세요";
    if (copy) {
      copy.textContent = options.copy || "상자를 두드리면 더 빨리 열려요.";
      copy.hidden = false;
    }
    if (closeButton) closeButton.onclick = closeModal;
    if (content) content.classList.remove("revealing");
    box.classList.remove("opened", "tap-pop");
    box.disabled = false;
    result.hidden = true;
    resultImage.removeAttribute("src");
    resultImage.alt = "";
    resultTitle.textContent = "";
    resultCopy.textContent = "";
    renderCount();

    box.onclick = () => tick(2);
    modal.classList.add("active");
    timerId = window.setInterval(() => tick(1), 1000);
  }

  async function drawDailyPet() {
    if (dailyDrawInProgress || !dashboardModel) return;

    const ownedPets = dashboardModel.pets || [];
    const reward = window.GrowthNoteRewards.selectDailyPetReward({ ownedPets });
    if (!reward) {
      renderDailyPetDraw(dashboardModel.dailyDraws || [], ownedPets);
      setStatus("모든 마이펫을 이미 모았어요.");
      return;
    }

    dailyDrawInProgress = true;
    renderDailyPetDraw(dashboardModel.dailyDraws || [], ownedPets);

    try {
      const today = todayKoreaDateString();
      const client = window.GrowthNoteSupabase.getClient();
      const hasDrawnToday = Boolean(dashboardModel.dailyDraws && dashboardModel.dailyDraws.length);
      const isExtraDraw = hasDrawnToday;

      if (!isExtraDraw) {
        const { error: drawError } = await client.from("daily_pet_draws").insert({
          student_id: studentId,
          draw_date: today,
          pet_id: reward.item.pet_id
        });

        if (drawError) {
          if (isDuplicateDailyDrawError(drawError)) {
            setStatus("오늘의 마이펫 뽑기는 이미 완료했어요.");
            loadDashboard();
            return;
          }
          throw drawError;
        }
      }

      const { error: petError } = await client.from("unlocked_pets").insert({
        student_id: studentId,
        pet_id: reward.item.pet_id,
        quantity: 1
      });
      if (petError) throw petError;

      const student = dashboardModel.student;

      const logType = isExtraDraw ? "extra_pet_draw" : "daily_pet_draw";
      const logDesc = isExtraDraw ? "추가 마이펫 뽑기" : "오늘의 마이펫 뽑기";

      const { error: logError } = await client.from("student_logs").insert({
        student_id: studentId,
        type: logType,
        category: isExtraDraw ? "extra_draw" : today,
        description: logDesc,
        xp_change: 0,
        reward_type: "pet",
        reward_id: reward.item.pet_id
      });
      if (logError) throw logError;

      openRewardDrawModal({
        type: "pet",
        rewardId: reward.item.pet_id,
        title: "오늘의 마이펫",
        copy: "상자를 두드리면 더 빨리 열려요.",
        resultTitle: `마이펫 ${reward.item.pet_id}`,
        resultCopy: "새로운 마이펫이 함께하게 되었어요.",
        imageSrc: window.GrowthNoteRules.petImagePath(reward.item),
        onClose: loadDashboard
      });
    } catch (error) {
      setStatus("마이펫 뽑기 오류: " + error.message, true);
    } finally {
      dailyDrawInProgress = false;
      renderDailyPetDraw(dashboardModel.dailyDraws || [], dashboardModel.pets || []);
    }
  }

  async function drawAvatar() {
    if (avatarDrawInProgress || !dashboardModel) return;

    const student = dashboardModel.student;
    const avatars = dashboardModel.avatars || [];

    const allowedCount = Math.floor((student.total_xp || 0) / 10);
    const ownedCount = avatars.length;
    const availableDraws = Math.max(0, allowedCount - ownedCount);

    if (availableDraws <= 0) return;

    const reward = window.GrowthNoteRewards.selectNextReward({ ownedAvatars: avatars });
    if (!reward) {
      setStatus("모든 아바타를 이미 모았어요.");
      return;
    }

    avatarDrawInProgress = true;
    renderAvatarDraw(student, avatars);

    try {
      const client = window.GrowthNoteSupabase.getClient();

      const { error: avatarError } = await client.from("unlocked_avatars").insert({
        student_id: studentId,
        avatar_id: reward.item.avatar_id,
        gender: reward.item.gender,
        quantity: 1
      });
      if (avatarError) throw avatarError;



      const { error: logError } = await client.from("student_logs").insert({
        student_id: studentId,
        type: "avatar_draw",
        category: "avatar_draw",
        description: "아바타 상자 열기 보상",
        xp_change: 0,
        reward_type: "avatar",
        reward_id: `${reward.item.gender}_${reward.item.avatar_id}`
      });
      if (logError) throw logError;

      openRewardDrawModal({
        type: "avatar",
        rewardId: `${reward.item.gender}_${reward.item.avatar_id}`,
        title: "새로운 아바타",
        copy: "상자를 두드리면 더 빨리 열려요.",
        resultTitle: `아바타 해금!`,
        resultCopy: "새로운 아바타가 보관함에 추가되었습니다.",
        imageSrc: window.GrowthNoteRules.avatarImagePath(reward.item),
        onClose: loadDashboard
      });
    } catch (error) {
      setStatus("아바타 뽑기 오류: " + error.message, true);
    } finally {
      avatarDrawInProgress = false;
      renderAvatarDraw(dashboardModel.student, dashboardModel.avatars || []);
    }
  }

  function activateTab(tabName) {
    document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.tabPanel === tabName);
    });
    document.querySelectorAll("[data-tab-target]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tabTarget === tabName);
    });
  }

  function activateCollection(type) {
    document.querySelectorAll("[data-collection-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.collectionPanel === type);
    });
    document.querySelectorAll("[data-collection-target]").forEach((button) => {
      button.classList.toggle("active", button.dataset.collectionTarget === type);
    });

    const genderToggle = document.getElementById("avatar-gender-toggle-container");
    if (genderToggle) {
      genderToggle.style.display = type === "avatar" ? "flex" : "none";
    }
  }

  document.querySelectorAll("[data-tab-target]").forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tabTarget);
      loadDashboard();
    });
  });

  document.querySelectorAll("[data-collection-target]").forEach((button) => {
    button.addEventListener("click", () => activateCollection(button.dataset.collectionTarget));
  });

  const refreshBtn = document.getElementById("refresh-button");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadDashboard);
  }

  const dailyPetDrawButton = document.getElementById("daily-pet-draw-button");
  if (dailyPetDrawButton) {
    dailyPetDrawButton.addEventListener("click", drawDailyPet);
  }

  const avatarDrawButton = document.getElementById("avatar-draw-button");
  if (avatarDrawButton) {
    avatarDrawButton.addEventListener("click", drawAvatar);
  }

  // Handle student data reset
  async function handleResetData() {
    const ok = window.confirm("데이터를 초기화하시겠습니까?\n\n보유한 모든 보상(아바타, 펫) 및 칭찬 기록이 영구히 유실됩니다.");
    if (!ok) return;

    const pin = window.prompt("본인 확인을 위해 4자리 비밀번호(PIN)를 입력해 주세요:");
    if (!pin) return;

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      alert("비밀번호는 4자리 숫자여야 합니다.");
      return;
    }

    try {
      setStatus("데이터를 검증하고 있습니다...");
      const client = window.GrowthNoteSupabase.getClient();

      // 1. 현재 학생의 정보(PIN 포함) 조회
      const { data: student, error: fetchError } = await client
        .from("students")
        .select("pin")
        .eq("id", studentId)
        .single();

      if (fetchError) throw fetchError;

      // 2. 입력된 PIN 해싱 후 비교
      const hashed = await window.GrowthNoteRules.hashPin(pin);
      if (student.pin !== hashed) {
        alert("비밀번호가 일치하지 않습니다.");
        setStatus("비밀번호가 일치하지 않습니다.", true);
        return;
      }

      setStatus("데이터를 초기화하고 있습니다...");

      // 3. 자식 테이블 데이터 삭제
      const { error: logsErr } = await client
        .from("student_logs")
        .delete()
        .eq("student_id", studentId);
      if (logsErr) throw logsErr;

      const { error: avatarsErr } = await client
        .from("unlocked_avatars")
        .delete()
        .eq("student_id", studentId);
      if (avatarsErr) throw avatarsErr;

      const { error: petsErr } = await client
        .from("unlocked_pets")
        .delete()
        .eq("student_id", studentId);
      if (petsErr) throw petsErr;

      const today = todayKoreaDateString();
      const { error: drawsErr } = await client
        .from("daily_pet_draws")
        .delete()
        .eq("student_id", studentId)
        .neq("draw_date", today);
      if (drawsErr) throw drawsErr;

      // 4. students 테이블 레코드 기본값으로 초기화
      const { error: updateErr } = await client
        .from("students")
        .update({
          total_xp: 0,
          level: 1,
          current_avatar_num: "1_001",
          current_pet_num: "000",
          display_avatar_type: "level"
        })
        .eq("id", studentId);

      if (updateErr) throw updateErr;

      alert("데이터 초기화가 성공적으로 완료되었습니다.");
      loadDashboard();
    } catch (err) {
      alert("초기화 실패: " + err.message);
      setStatus("초기화 오류: " + err.message, true);
    }
  }

  const resetDataBtn = document.getElementById("reset-data-button");
  if (resetDataBtn) {
    resetDataBtn.addEventListener("click", handleResetData);
  }

  document.querySelectorAll("[data-starter-avatar]").forEach((button) => {
    button.addEventListener("click", () => {
      grantStarterAvatar(button.dataset.starterAvatar);
    });
  });

  // 아바타 성별 토글 버튼 바인딩
  document.querySelectorAll("[data-gender-target]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-gender-target]").forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      loadDashboard(); // 성별 변경 후 도감 재렌더링
    });
  });

  document.getElementById("logout-button").addEventListener("click", function () {
    sessionStorage.removeItem("growth-note-student-id");
    sessionStorage.removeItem("growth-note-demo-student");
    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }
    window.location.href = "student-login.html";
  });

  const btnRepConfirmCancel = document.getElementById("btn-rep-confirm-cancel");
  const btnRepConfirmOk = document.getElementById("btn-rep-confirm-ok");

  if (btnRepConfirmCancel) {
    btnRepConfirmCancel.addEventListener("click", closeRepConfirmModal);
  }
  if (btnRepConfirmOk) {
    btnRepConfirmOk.addEventListener("click", () => {
      if (typeof repConfirmCallback === "function") {
        repConfirmCallback();
      }
      closeRepConfirmModal();
    });
  }

  loadDashboard();
  setupRealtimeSubscription();
})();
