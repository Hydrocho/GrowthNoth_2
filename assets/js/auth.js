(function () {
  "use strict";

  const studentIdInput = document.getElementById("student-id");
  const pinInput = document.getElementById("student-pin");
  const form = document.getElementById("student-login-form");
  const status = document.getElementById("login-status");
  const loginButton = document.getElementById("login-button");

  const registerForm = document.getElementById("student-register-form");
  const registerStudentIdInput = document.getElementById("register-student-id");
  const registerPinInput = document.getElementById("register-student-pin");
  const registerPinConfirmInput = document.getElementById("register-student-pin-confirm");
  const registerButton = document.getElementById("register-button");
  const registerStatus = document.getElementById("register-status");

  const btnToggleRegister = document.getElementById("btn-toggle-register");
  const btnToggleLogin = document.getElementById("btn-toggle-login");

  function setStatus(message, isError) {
    status.textContent = message || "";
    status.classList.toggle("error", Boolean(isError));
  }

  function setRegisterStatus(message, isError) {
    registerStatus.textContent = message || "";
    registerStatus.classList.toggle("error", Boolean(isError));
  }

  // Toggle Forms
  btnToggleRegister.addEventListener("click", function () {
    form.style.display = "none";
    registerForm.style.display = "block";
    btnToggleRegister.style.display = "none";
    btnToggleLogin.style.display = "block";
    setStatus("", false);
    setRegisterStatus("학번과 희망 비밀번호 PIN을 입력하세요.");
  });

  btnToggleLogin.addEventListener("click", function () {
    registerForm.style.display = "none";
    form.style.display = "block";
    btnToggleLogin.style.display = "none";
    btnToggleRegister.style.display = "block";
    setRegisterStatus("", false);
    setStatus("학번 아이디와 PIN을 입력하세요. 테스트: 000000 / 0176");
  });

  async function findStudentBySchoolId(schoolId) {
    const client = window.GrowthNoteSupabase.getClient();
    const { data, error } = await client
      .from("students")
      .select("id, school_id, name, nickname, pin")
      .eq("school_id", schoolId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  // Login Submit
  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const schoolId = window.GrowthNoteRules.normalizeStudentId(studentIdInput.value);
    const pin = pinInput.value.trim();

    if (!schoolId) {
      setStatus("학번 아이디를 입력하세요. 예: 30110", true);
      studentIdInput.focus();
      return;
    }

    if (!pin) {
      setStatus("PIN을 입력하세요.", true);
      pinInput.focus();
      return;
    }

    loginButton.disabled = true;
    setStatus("학생 정보를 확인하는 중입니다.");

    try {
      const student = await findStudentBySchoolId(schoolId);

      if (!student) {
        setStatus("해당 학번 아이디의 학생을 찾을 수 없습니다.", true);
        studentIdInput.select();
        return;
      }

      const hashedPin = await window.GrowthNoteRules.hashPin(pin);

      if (hashedPin !== String(student.pin)) {
        setStatus("PIN이 맞지 않습니다.", true);
        pinInput.select();
        return;
      }

      sessionStorage.removeItem("growth-note-demo-student");
      sessionStorage.setItem("growth-note-student-id", student.id);
      window.location.href = "index.html";
    } catch (error) {
      setStatus(window.GrowthNoteSupabase.formatError(error), true);
    } finally {
      loginButton.disabled = false;
    }
  });

  // Policy Modal Controls
  const policyModal = document.getElementById("policy-modal");
  const linkTerms = document.getElementById("link-terms");
  const linkPrivacy = document.getElementById("link-privacy");
  const btnClosePolicy = document.getElementById("btn-close-policy");
  const tabTerms = document.getElementById("tab-terms");
  const tabPrivacy = document.getElementById("tab-privacy");
  const contentTerms = document.getElementById("content-terms");
  const contentPrivacy = document.getElementById("content-privacy");

  function openPolicyModal(initialTab) {
    if (!policyModal) return;
    policyModal.classList.add("active");
    switchPolicyTab(initialTab);
  }

  function closePolicyModal() {
    if (!policyModal) return;
    policyModal.classList.remove("active");
  }

  function switchPolicyTab(targetTab) {
    if (!tabTerms || !tabPrivacy || !contentTerms || !contentPrivacy) return;
    if (targetTab === "terms") {
      tabTerms.classList.add("active");
      tabPrivacy.classList.remove("active");
      contentTerms.style.display = "block";
      contentPrivacy.style.display = "none";
    } else {
      tabPrivacy.classList.add("active");
      tabTerms.classList.remove("active");
      contentPrivacy.style.display = "block";
      contentTerms.style.display = "none";
    }
  }

  if (linkTerms) linkTerms.addEventListener("click", (e) => { e.stopPropagation(); openPolicyModal("terms"); });
  if (linkPrivacy) linkPrivacy.addEventListener("click", (e) => { e.stopPropagation(); openPolicyModal("privacy"); });
  if (btnClosePolicy) btnClosePolicy.addEventListener("click", closePolicyModal);
  
  if (policyModal) {
    policyModal.addEventListener("click", function (e) {
      if (e.target === policyModal) {
        closePolicyModal();
      }
    });
  }

  if (tabTerms) tabTerms.addEventListener("click", () => switchPolicyTab("terms"));
  if (tabPrivacy) tabPrivacy.addEventListener("click", () => switchPolicyTab("privacy"));

  // Register Submit
  registerForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const schoolId = window.GrowthNoteRules.normalizeStudentId(registerStudentIdInput.value);
    const pin = registerPinInput.value.trim();
    const pinConfirm = registerPinConfirmInput.value.trim();
    const agreeCheckbox = document.getElementById("register-policy-agree");

    if (!schoolId) {
      setRegisterStatus("학번 아이디를 입력하세요. 예: 30110", true);
      registerStudentIdInput.focus();
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      setRegisterStatus("PIN은 4자리 숫자로 입력해야 합니다.", true);
      registerPinInput.focus();
      return;
    }

    if (pin !== pinConfirm) {
      setRegisterStatus("입력하신 PIN 비밀번호가 서로 일치하지 않습니다.", true);
      registerPinConfirmInput.focus();
      return;
    }

    if (!agreeCheckbox || !agreeCheckbox.checked) {
      setRegisterStatus("이용약관 및 개인정보 처리방침 동의는 필수입니다.", true);
      return;
    }

    registerButton.disabled = true;
    setRegisterStatus("회원가입을 진행하고 있습니다...");

    try {
      // Check duplicate schoolId
      const existing = await findStudentBySchoolId(schoolId);
      if (existing) {
        setRegisterStatus("이미 가입 완료된 학번입니다. 로그인해 주세요.", true);
        registerStudentIdInput.select();
        return;
      }

      const hashedPin = await window.GrowthNoteRules.hashPin(pin);
      const client = window.GrowthNoteSupabase.getClient();

      // INSERT to database
      const { data, error } = await client
        .from("students")
        .insert({
          school_id: schoolId,
          pin: hashedPin
        })
        .select("id")
        .single();

      if (error) throw error;

      setRegisterStatus("가입이 완료되었습니다! 잠시 후 대시보드로 이동합니다.");
      
      // Auto Login
      sessionStorage.removeItem("growth-note-demo-student");
      sessionStorage.setItem("growth-note-student-id", data.id);

      setTimeout(() => {
        window.location.href = "index.html";
      }, 1200);
    } catch (err) {
      setRegisterStatus(window.GrowthNoteSupabase.formatError(err), true);
    } finally {
      registerButton.disabled = false;
    }
  });

  setStatus("");
})();
