console.log("🔥 APP.JS STARTED");
const supabaseUrl = "https://bvvgfsogkzaikpraluof.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dmdmc29na3phaWtwcmFsdW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjYwMDAsImV4cCI6MjA5MjYwMjAwMH0.Rv4gjwqFA_ZVyice9JBV7sf81alsZb3PmB3lVtS4Xjo";
const client = window.supabase.createClient(supabaseUrl, supabaseKey);
const $ = (id) => document.getElementById(id);

const safeText = (value) => {
  return value === null || value === undefined ? "" : String(value);
};
let currentExamId = null;
let currentExamTitle = "";
let currentPreviewExam = null;
let solvingQuestions = [];
let currentQuestionIndex = 0;
let studentAnswers = {};
let reviewLater = {};
let timerInterval = null;
let remainingSeconds = 0;
let currentUserRole = "student";


function showPage(id) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
    page.style.display = "none";
  });

  const target = document.getElementById(id);

  if (!target) {
    console.log("Page not found:", id);
    return;
  }

 target.classList.add("active");
target.style.display = "block";

window.scrollTo({
  top: 0,
  behavior: "smooth"
});

if (id === "studentExams" && typeof loadStudentExams === "function") {
  loadStudentExams();
}

if (id === "leaderboard" && typeof loadLeaderboard === "function") {
  loadLeaderboard();
}

if (id === "premium" && typeof renderPaymentInfo === "function") {
  renderPaymentInfo();
}

console.log("Showing page:", id);
}
async function getCurrentUser() {
  const { data } = await client.auth.getUser();
  return data.user || null;
}

function getRoleFromUser(user) {
  return user?.user_metadata?.role || user?.app_metadata?.role || "student";
}

async function goDashboard() {
  try {
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      alert("Not logged in");
      return;
    }

    const { data: profile, error } = await client
      .from("profiles")
      .select("role, full_name")
      .eq("email", user.email)
      .single();

    if (error) {
      console.error("Profile error:", error);
      return;
    }

const role = (profile?.role || "").toLowerCase().trim();
    console.log("User role:", role);

    // 🧠 توجيه حسب الدور
    if (role.includes("super_admin") || role.includes("admin")) {
  showPage("superAdminDashboard");
} else if (role.includes("teacher")) {
  showPage("teacherDashboard");
} else if (role.includes("student")) {
  showPage("studentDashboard");
} else {
  showPage("studentDashboard");
}

  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

async function logout() {
  await client.auth.signOut();
  location.href = "login.html";
}

// =========================
// Demo Question Display
// =========================
let demoQuestions = [];

function addDemoQuestion(questionData) {
  demoQuestions.push(questionData);
  console.log("Question Added:", questionData);
}

function displayQuestion() {
  const box = $("questionBox");
  if (!box) return;

  if (demoQuestions.length === 0) {
    box.innerHTML = "No questions yet";
    return;
  }

  const q = demoQuestions[0];
  box.innerHTML = `
    <h3>${safeText(q.question)}</h3>
    ${q.options.map(opt => `<button type="button">${safeText(opt)}</button>`).join("")}
  `;
}

addDemoQuestion({
  id: "q1",
  question: "She ____ to school every day.",
  type: "mcq",
  options: ["go", "goes", "going", "gone"],
  correct_answer: "goes"
});

// =========================
// Teacher Exams
// =========================
let editingExamId = null;

async function createExam() {
  const title = $("examTitle")?.value.trim();
  const description = $("examDesc")?.value.trim();
  const timeLimit = Number($("examTime")?.value || 10);
  const questionCount = Number($("examQuestionCount")?.value || 0);
  const examType = $("examType")?.value || "multiple_choice";
  const gradeLevel = $("examGrade")?.value.trim();

  const msg = $("examMsg");

  if (!title) {
    if (msg) msg.textContent = "Please enter exam title.";
    return;
  }

  if (!timeLimit || timeLimit <= 0) {
    if (msg) msg.textContent = "Please enter a valid exam duration.";
    return;
  }

  const user = await getCurrentUser();

  if (!user) {
    if (msg) msg.textContent = "Login first.";
    return;
  }

  if (msg) {
    msg.textContent = editingExamId ? "Updating exam..." : "Creating exam...";
  }

  const examData = {
  title,
  description,
  time_limit: timeLimit,
  question_count: questionCount,
  exam_type: examType,
  grade_level: gradeLevel,
  teacher_id: user.id
};

if (!editingExamId) {
  examData.status = "draft";
}

  let data = null;
  let error = null;

  if (editingExamId) {
    const response = await client
      .from("exams")
      .update(examData)
      .eq("id", editingExamId)
      .select()
      .single();

    data = response.data;
    error = response.error;
  } else {
    const response = await client
      .from("exams")
      .insert([examData])
      .select()
      .single();

    data = response.data;
    error = response.error;
  }

  if (error) {
    if (msg) msg.textContent = error.message;
    console.error("Save exam error:", error);
    return;
  }

  if (msg) {
    msg.textContent = editingExamId
      ? "Exam updated successfully ✅"
      : "Exam created ✅ Now add questions.";
  }

  const wasEditing = !!editingExamId;
  editingExamId = null;

  const btn = document.getElementById("createExamBtn");
  if (btn) btn.textContent = "Create Exam";

  if ($("examTitle")) $("examTitle").value = "";
  if ($("examDesc")) $("examDesc").value = "";
  if ($("examTime")) $("examTime").value = 10;
  if ($("examQuestionCount")) $("examQuestionCount").value = "";
  if ($("examType")) $("examType").value = "multiple_choice";
  if ($("examGrade")) $("examGrade").value = "";

  await loadTeacherExams();

  // Only open question manager after creating a NEW exam, not after editing
  if (!wasEditing && data?.id) {
    openQuestionManager(data.id, data.title);
  }
}
async function loadTeacherExams() {
  const list = document.getElementById("teacherExamList");
  const status = document.getElementById("teacherExamFilterStatus");
  const filterInput = document.getElementById("teacherExamGradeFilter");

  if (!list) return;

  list.innerHTML = "Loading...";
  if (status) status.textContent = "";

  const user = await getCurrentUser();
  if (!user) return;

  // 1) Load teacher exams
  const r = await client
    .from("exams")
    .select("*")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  if (r.error) {
    list.innerHTML = "Error";
    console.error("Load teacher exams error:", r.error);
    return;
  }

  let rows = r.data || [];

  // 2) Load real question counts from questions table
  const examIds = rows.map(exam => exam.id).filter(Boolean);

  let questionCountMap = {};

  if (examIds.length > 0) {
    const { data: questions, error: questionsError } = await client
      .from("questions")
      .select("id, exam_id")
      .in("exam_id", examIds);

    if (questionsError) {
      console.warn("Load question counts error:", questionsError);
    }

    (questions || []).forEach(q => {
      questionCountMap[q.exam_id] = (questionCountMap[q.exam_id] || 0) + 1;
    });
  }

  // 3) Filter by grade/class if needed
  const filterValue = filterInput?.value.trim().toLowerCase() || "";

  if (filterValue) {
    rows = rows.filter(exam => {
      const grade = String(exam.grade_level || "").toLowerCase();
      return grade.includes(filterValue);
    });
  }

  if (status) {
    status.textContent = filterValue
      ? `Showing exams for: ${filterInput.value.trim()}`
      : "Showing all exams";
  }

  list.innerHTML = rows.length ? "" : "No exams found";

  // 4) Render exam cards
  rows.forEach(exam => {
    const d = document.createElement("div");
    d.className = "box";

    const examCode = exam.id;
    const examLink = `${window.location.origin}${window.location.pathname}?exam=${exam.id}`;

    const realQuestionCount = questionCountMap[exam.id] || 0;

    d.innerHTML = `
      <h3>${safeText(exam.title)}</h3>
      <p>${safeText(exam.description || "")}</p>

      <p><strong>Type:</strong> ${safeText(exam.exam_type || "multiple_choice")}</p>

      <p>
        <strong>Status:</strong>
        ${
          exam.status === "published"
            ? '<span class="badge published">🟢 Published</span>'
            : '<span class="badge draft">🟡 Draft</span>'
        }
      </p>

      <p><strong>Grade / Class:</strong> ${safeText(exam.grade_level || "Not specified")}</p>

      <p>
        <strong>Questions:</strong>
        ${
          realQuestionCount > 0
            ? safeText(realQuestionCount)
            : '<span class="badge draft">⚠️ No questions added yet</span>'
        }
      </p>

      <p><strong>Duration:</strong> ⏱ ${safeText(exam.time_limit || 10)} min</p>

      <p><strong>Exam Code:</strong> ${safeText(examCode)}</p>
      <p><strong>Share Link:</strong> <span>${safeText(examLink)}</span></p>
    `;

    const manageBtn = document.createElement("button");
    manageBtn.textContent = "Manage Questions";
    manageBtn.onclick = () => openQuestionManager(exam.id, exam.title);
    d.appendChild(manageBtn);

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit Exam";
    editBtn.onclick = () => editExam(exam);
    d.appendChild(editBtn);

    const publishBtn = document.createElement("button");
    publishBtn.textContent = exam.status === "published" ? "Unpublish Exam" : "Publish Exam";
    publishBtn.onclick = () => toggleExamStatus(exam.id, exam.status || "draft");
    d.appendChild(publishBtn);

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy Share Link";
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(examLink);
        alert("Exam link copied ✅");
      } catch (err) {
        console.error("Copy link error:", err);
        alert("Could not copy link. You can copy it manually.");
      }
    };
    d.appendChild(copyBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete Exam";
    deleteBtn.className = "danger";
    deleteBtn.onclick = () => deleteExam(exam.id, exam.title);
    d.appendChild(deleteBtn);

    list.appendChild(d);
  });
}
// =========================
// Question Manager
// =========================
function handleQuestionTypeChange() {
  if (!$('questionType')) return;
  mcqOptions.style.display = questionType.value === "mcq" ? "block" : "none";
  trueFalseOptions.style.display = questionType.value === "true_false" ? "block" : "none";
}

function openQuestionManager(id, title) {
  currentExamId = id;
  currentExamTitle = title || "";
  questionExamTitle.textContent = "Manage Questions: " + currentExamTitle;
  showPage("questionManager");
  loadQuestions();
}
let isSavingQuestion = false;
let editingQuestionId = null;

async function addQuestion() {
  if (isSavingQuestion) {
    return;
  }

  isSavingQuestion = true;

  try {
    if (!currentExamId) {
      questionMsg.textContent = "Choose exam first";
      return;
    }

    const type = questionType.value;
    const text = questionText.value.trim();
    const explanation = questionExplanation.value.trim();

    if (!text) {
      questionMsg.textContent = "Enter question";
      return;
    }

    questionMsg.textContent = editingQuestionId
      ? "Updating question..."
      : "Saving question...";

    // Prevent duplicate question text inside the same exam
    let duplicateQuery = client
      .from("questions")
      .select("id")
      .eq("exam_id", currentExamId)
      .eq("question_text", text)
      .limit(1);

    if (editingQuestionId) {
      duplicateQuery = duplicateQuery.neq("id", editingQuestionId);
    }

    const duplicateCheck = await duplicateQuery;

    if (duplicateCheck.error) {
      console.error("Duplicate check error:", duplicateCheck.error);
      questionMsg.textContent = "Could not check duplicate question.";
      return;
    }

    if (duplicateCheck.data && duplicateCheck.data.length > 0) {
      questionMsg.textContent = "This question already exists in this exam.";
      return;
    }

    let row = {
      exam_id: currentExamId,
      question_text: text,
      question_type: type,
      explanation
    };

    if (type === "mcq") {
      if (
        !optionA.value.trim() ||
        !optionB.value.trim() ||
        !optionC.value.trim() ||
        !optionD.value.trim()
      ) {
        questionMsg.textContent = "Fill all options";
        return;
      }

      Object.assign(row, {
        option_a: optionA.value.trim(),
        option_b: optionB.value.trim(),
        option_c: optionC.value.trim(),
        option_d: optionD.value.trim(),
        correct_answer: mcqCorrectAnswer.value
      });
    } else {
      Object.assign(row, {
        option_a: "True",
        option_b: "False",
        option_c: null,
        option_d: null,
        correct_answer: tfCorrectAnswer.value
      });
    }

    let saveResult;

    if (editingQuestionId) {
      saveResult = await client
        .from("questions")
        .update(row)
        .eq("id", editingQuestionId);
    } else {
      saveResult = await client
        .from("questions")
        .insert([row]);
    }

    if (saveResult.error) {
      questionMsg.textContent = saveResult.error.message;
      console.error("Save question error:", saveResult.error);
      return;
    }

    questionMsg.textContent = editingQuestionId
      ? "Question updated successfully ✅"
      : "Question saved successfully ✅";

    editingQuestionId = null;

    const saveQuestionBtn = document.getElementById("saveQuestionBtn");
    if (saveQuestionBtn) saveQuestionBtn.textContent = "Save Question";
    questionText.value = "";
    optionA.value = "";
    optionB.value = "";
    optionC.value = "";
    optionD.value = "";
    questionExplanation.value = "";

    await loadQuestions();

  } finally {
    isSavingQuestion = false;
  }
}
async function loadQuestions() {
  const list = document.getElementById("questionList");
  if (!list) return;

  list.innerHTML = "Loading questions...";

  if (!currentExamId) {
    list.innerHTML = "<p>No exam selected.</p>";
    return;
  }

  const { data: qs, error } = await client
    .from("questions")
    .select("*")
    .eq("exam_id", currentExamId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Load questions error:", error);
    list.innerHTML = "<p>Could not load questions.</p>";
    return;
  }

  if (!qs || qs.length === 0) {
    list.innerHTML = "<p>No questions yet. Add your first question above.</p>";
    return;
  }

  list.innerHTML = "";

  qs.forEach((q, i) => {
    const typeLabel = q.question_type === "mcq" ? "Multiple Choice" : "True / False";

    const optionsHtml = q.question_type === "mcq"
      ? `
        <div class="box">
          <p><strong>A.</strong> ${safeText(q.option_a)}</p>
          <p><strong>B.</strong> ${safeText(q.option_b)}</p>
          <p><strong>C.</strong> ${safeText(q.option_c)}</p>
          <p><strong>D.</strong> ${safeText(q.option_d)}</p>
        </div>
      `
      : `
        <div class="box">
          <p><strong>A.</strong> True</p>
          <p><strong>B.</strong> False</p>
        </div>
      `;

    const box = document.createElement("div");
    box.className = "box question-card";

    box.innerHTML = `
      <div>
        <span class="badge">Question ${i + 1}</span>
        <span class="badge">${safeText(typeLabel)}</span>
      </div>

      <h3>${safeText(q.question_text)}</h3>

      ${optionsHtml}

      <p><strong>Correct Answer:</strong> ${safeText(q.correct_answer)}</p>

      ${
        q.explanation
          ? `<p><strong>Explanation:</strong> ${safeText(q.explanation)}</p>`
          : `<p><strong>Explanation:</strong> Not added</p>`
      }

      <button onclick="editQuestion('${q.id}')" style="background:#2563eb;color:white;margin-top:10px;">
  Edit Question
</button>

<button onclick="deleteQuestion('${q.id}')" style="background:#b91c1c;color:white;margin-top:10px;">
  Delete Question
</button>
`;

    list.appendChild(box);
  });
}
async function deleteQuestion(questionId) {
  const confirmDelete = confirm("Are you sure you want to delete this question?");

  if (!confirmDelete) {
    return;
  }

  const { error } = await client
    .from("questions")
    .delete()
    .eq("id", questionId);

  if (error) {
    console.error("Delete question error:", error);
    alert("Could not delete question.");
    return;
  }

  alert("Question deleted ✅");
  await loadQuestions();
}
// =========================
// Student Exams + Interactive Solver
// =========================
async function loadStudentExams() {
  const list = document.getElementById("studentExamList");
  const status = document.getElementById("studentExamFilterStatus");
  const filterInput = document.getElementById("studentExamGradeFilter");

  if (!list) return;

  list.innerHTML = "Loading exams...";
  if (status) status.textContent = "";
 
  renderSelectedTeacherInfo(); 

  // 1) Load only published exams
  const r = await client
    .from("exams")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (r.error) {
    list.innerHTML = "Error loading exams";
    console.error("Load student exams error:", r.error);
    if (status) status.textContent = "Error loading exams.";
    return;
  }

  let exams = r.data || [];

  // 2) Load real question counts from questions table
  const examIds = exams.map(exam => exam.id).filter(Boolean);

  let questionCountMap = {};

  if (examIds.length > 0) {
    const { data: questions, error: questionsError } = await client
      .from("questions")
      .select("id, exam_id")
      .in("exam_id", examIds);

    if (questionsError) {
      console.warn("Load student question counts error:", questionsError);
    }

    (questions || []).forEach(q => {
      questionCountMap[q.exam_id] = (questionCountMap[q.exam_id] || 0) + 1;
    });
  }

  // 3) Hide published exams with zero real questions
  exams = exams.filter(exam => {
    const realQuestionCount = questionCountMap[exam.id] || 0;
    return realQuestionCount > 0;
  });

  // 4) Filter by grade/class
  const filterValue = filterInput?.value.trim().toLowerCase() || "";

  if (filterValue) {
    exams = exams.filter(exam => {
      const grade = String(exam.grade_level || "").toLowerCase();
      return grade.includes(filterValue);
    });
  }

  if (status) {
    status.textContent = filterValue
      ? `Showing ready exams for: ${filterInput.value.trim()}`
      : "Showing ready published exams only";
  }

  list.innerHTML = exams.length ? "" : "No ready exams found";

  // 5) Render student exam cards
  exams.forEach(exam => {
    const box = document.createElement("div");
    box.className = "box";

    const realQuestionCount = questionCountMap[exam.id] || 0;

    box.innerHTML = `
      <h3>${safeText(exam.title)}</h3>
      <p>${safeText(exam.description || "")}</p>

      <p><strong>Type:</strong> ${safeText(exam.exam_type || "multiple_choice")}</p>

      <p>
        <strong>Status:</strong>
        <span class="badge published">🟢 Published</span>
      </p>

      <p><strong>Grade / Class:</strong> ${safeText(exam.grade_level || "Not specified")}</p>

      <p><strong>Questions:</strong> ${safeText(realQuestionCount)}</p>

      <p><strong>Time:</strong> ⏱ ${safeText(exam.time_limit || 10)} min</p>
    `;

    const btn = document.createElement("button");
    btn.textContent = "Start Exam 🚀";
    btn.onclick = () =>
      previewExam(exam.id, exam.title, exam.description, exam.time_limit);

    box.appendChild(btn);
    list.appendChild(box);
  });
} 
function clearStudentExamFilter() {
  const input = document.getElementById("studentExamGradeFilter");
  const status = document.getElementById("studentExamFilterStatus");

  if (input) input.value = "";
  if (status) status.textContent = "Filter cleared.";

  loadStudentExams();
}
async function editQuestion(questionId) {
  const { data: question, error } = await client
    .from("questions")
    .select("*")
    .eq("id", questionId)
    .single();

  if (error) {
    console.error("Edit question loading error:", error);
    alert("Could not load question for editing.");
    return;
  }

  editingQuestionId = question.id;

  questionType.value = question.question_type || "mcq";
  questionText.value = question.question_text || "";
  questionExplanation.value = question.explanation || "";

  optionA.value = question.option_a || "";
  optionB.value = question.option_b || "";
  optionC.value = question.option_c || "";
  optionD.value = question.option_d || "";

  if (question.question_type === "mcq") {
    mcqCorrectAnswer.value = question.correct_answer || "A";
  } else {
    tfCorrectAnswer.value = question.correct_answer || "True";
  }

  if (typeof handleQuestionTypeChange === "function") {
  handleQuestionTypeChange();
}

  questionMsg.textContent = "Editing question. Make changes, then click Add Question / Save.";
const saveBtn = document.getElementById("saveQuestionBtn");
if (saveBtn) saveBtn.textContent = "Update Question";
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function previewExam(id, title, description, timeLimit) {
  currentPreviewExam = { id, title, description, timeLimit: Number(timeLimit || 10) };
  takeExamTitle.textContent = title || "Exam";
  takeExamDesc.textContent = description || "";
  takeExamTime.textContent = "Time limit: " + (timeLimit || 10) + " minutes";
  showPage("takeExam");
}

async function startSolvingExam() {
  if (!currentPreviewExam) {
    alert("No exam selected.");
    return;
  }

  // 1) Check exam status first
  const examCheck = await client
    .from("exams")
    .select("id, title, status, time_limit")
    .eq("id", currentPreviewExam.id)
    .single();

  if (examCheck.error || !examCheck.data) {
    console.error("Exam check error:", examCheck.error);
    alert("This exam could not be found.");
    return;
  }

  const exam = examCheck.data;

  if (exam.status !== "published") {
    alert("This exam is not available yet. Please contact your teacher.");
    return;
  }

  // 2) Load real questions
  const r = await client
    .from("questions")
    .select("*")
    .eq("exam_id", currentPreviewExam.id)
    .order("created_at", { ascending: true });

  if (r.error) {
    console.error("Load questions error:", r.error);
    alert("Error loading questions.");
    return;
  }

  solvingQuestions = r.data || [];

  // 3) Stop empty exams even if opened by old link/code
  if (!solvingQuestions.length) {
    alert("This exam is not ready yet. Please contact your teacher.");
    return;
  }

  currentQuestionIndex = 0;
  studentAnswers = {};
  reviewLater = {};
  remainingSeconds = Number(exam.time_limit || currentPreviewExam.timeLimit || 10) * 60;
  solverExamTitle.textContent = exam.title || currentPreviewExam.title || "Exam";

  showPage("examSolver");
  startTimer();
  renderSolver();
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  updateTimerText();

  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateTimerText();

    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      alert("Time is over. Your exam will be submitted automatically.");
      submitExam(true);
    }
  }, 1000);
}

function updateTimerText() {
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  examTimer.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function getOptionsForQuestion(q) {
  if (q.question_type === "true_false") return [{ key: "True", text: "True" }, { key: "False", text: "False" }];
  return [
    { key: "A", text: q.option_a },
    { key: "B", text: q.option_b },
    { key: "C", text: q.option_c },
    { key: "D", text: q.option_d }
  ];
}

function getOptionText(q, key) {
  const opt = getOptionsForQuestion(q).find(o => o.key === key);
  return opt ? opt.text : key || "No answer";
}

function renderSolver() {
  const q = solvingQuestions[currentQuestionIndex];
  if (!q) return;

  renderQuestionNav();

  const progressEl = $("examProgressText");
  if (progressEl) {
    progressEl.textContent =
      "Question " + (currentQuestionIndex + 1) + " of " + solvingQuestions.length;
  }

  const statusEl = $("examAutoSaveStatus");
  if (statusEl && statusEl.dataset.saved !== "true") {
    statusEl.textContent = "Answers are saved automatically on this device.";
  }

  solverQuestionText.textContent =
    (currentQuestionIndex + 1) + ". " + q.question_text;

  solverOptions.innerHTML = "";

  getOptionsForQuestion(q).forEach(o => {
    const selected = studentAnswers[q.id] === o.key;

    const lab = document.createElement("label");
    lab.className = selected ? "option-card selected" : "option-card";

    lab.innerHTML = `
      <input type="radio" name="answer" ${selected ? "checked" : ""}>
      <b>${o.key}.</b> ${safeText(o.text)}
    `;

    lab.onclick = () => {
      studentAnswers[q.id] = o.key;

      if (typeof saveExamProgress === "function") {
        saveExamProgress();
      }

      const status = $("examAutoSaveStatus");
      if (status) {
        status.dataset.saved = "true";
        status.textContent = "Saved ✅ " + new Date().toLocaleTimeString();
      }

      renderSolver();
    };

    solverOptions.appendChild(lab);
  });
}
function getExamProgressKey() {
  const examId = currentPreviewExam?.id || "unknown_exam";
  return "jakExamProgress_" + examId;
}

function saveExamProgress() {
  if (!currentPreviewExam) return;

  const data = {
    examId: currentPreviewExam.id,
    currentQuestionIndex,
    studentAnswers,
    reviewLater,
    remainingSeconds,
    savedAt: new Date().toISOString()
  };

  localStorage.setItem(getExamProgressKey(), JSON.stringify(data));
}
function renderQuestionNav() {
  questionNav.innerHTML = "";

  solvingQuestions.forEach((q, i) => {
    const p = document.createElement("div");

    const isCurrent = i === currentQuestionIndex;
    const isAnswered =
      studentAnswers[q.id] !== undefined &&
      studentAnswers[q.id] !== null &&
      studentAnswers[q.id] !== "";

    const isReview = !!reviewLater[q.id];

    p.className = "question-pill";

    if (isCurrent) p.classList.add("active");
    if (isAnswered) p.classList.add("answered");
    if (!isAnswered) p.classList.add("unanswered");
    if (isReview) p.classList.add("review");

    p.innerHTML = `
      <span class="question-pill-number">${i + 1}</span>
      ${isReview ? '<span class="question-pill-icon">⭐</span>' : ""}
      ${isAnswered && !isReview ? '<span class="question-pill-icon">✓</span>' : ""}
    `;

    let statusText = "Unanswered";
    if (isAnswered) statusText = "Answered";
    if (isReview) statusText += " / Marked for review";
    if (isCurrent) statusText += " / Current question";

    p.title = "Question " + (i + 1) + " - " + statusText;

    p.onclick = () => {
      currentQuestionIndex = i;
      renderSolver();

      if (typeof saveExamProgress === "function") {
        saveExamProgress();
      }

      if (typeof updateExamAnswerStats === "function") {
        updateExamAnswerStats();
      }
    };

    questionNav.appendChild(p);
  });
}

function nextQuestion() {
  if (currentQuestionIndex < solvingQuestions.length - 1) {
    currentQuestionIndex++;
    renderSolver();
  }
}

function previousQuestion() {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    renderSolver();
  }
}

function toggleReviewLater() {
  const q = solvingQuestions[currentQuestionIndex];

  if (!q) {
    console.warn("No current question to mark for review.");
    return;
  }

  reviewLater[q.id] = !reviewLater[q.id];

  if (typeof saveExamProgress === "function") {
    saveExamProgress();
  }

  if (typeof renderQuestionNav === "function") {
    renderQuestionNav();
  }

  const status = document.getElementById("examAutoSaveStatus");

  if (status) {
    status.dataset.saved = "true";

    if (reviewLater[q.id]) {
      status.textContent = "Marked for review ⭐";
    } else {
      status.textContent = "Removed from review list ✅";
    }
  }

  console.log("Review Later:", q.id, reviewLater[q.id]);
}

function getUnansweredNumbers() {
  const nums = [];
  solvingQuestions.forEach((q, i) => {
    if (!studentAnswers[q.id]) nums.push(i + 1);
  });
  return nums;
}

async function submitExam(autoSubmit) {
  if (!autoSubmit) {
    const unanswered = getUnansweredNumbers();

    if (unanswered.length > 0) {
      const confirmSubmit = confirm(
        "You still have unanswered questions: " +
        unanswered.join(", ") +
        ".\n\nAre you sure you want to submit anyway?"
      );

      if (!confirmSubmit) return;
    } else {
      if (!confirm("Submit exam now?")) return;
    }
  }

  if (timerInterval) clearInterval(timerInterval);

  let correct = 0;
  const answers = [];

  solvingQuestions.forEach(q => {
    const ans = studentAnswers[q.id] || null;
    const ok = ans === q.correct_answer;

    if (ok) correct++;

    answers.push({
      question_id: q.id,
      question_text: q.question_text,
      student_answer: ans,
      student_answer_text: getOptionText(q, ans),
      correct_answer: q.correct_answer,
      correct_answer_text: getOptionText(q, q.correct_answer),
      is_correct: ok,
      explanation: q.explanation || ""
    });
  });

  const total = solvingQuestions.length;
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

  await saveExamResult(correct, total, percentage, answers);

  resultTitle.textContent = currentPreviewExam.title || "Result";
  scoreText.textContent = `Your score: ${correct} / ${total} (${percentage}%)`;
studyAdviceAfterResult.innerHTML = getStudyAdvice(percentage, answers);  resultDetails.innerHTML = "";

  answers.forEach((a, i) => {
    const div = document.createElement("div");
    div.className = "box " + (a.is_correct ? "correct" : "wrong");

    div.innerHTML = `
      <h3>${i + 1}. ${safeText(a.question_text)}</h3>
      <p><b>Status:</b> ${a.is_correct ? "✅ Correct" : "❌ Wrong"}</p>
      <p><b>Your answer:</b> ${a.student_answer || "No answer"} - ${safeText(a.student_answer_text || "No answer")}</p>
      <p><b>Correct answer:</b> ${safeText(a.correct_answer)} - ${safeText(a.correct_answer_text)}</p>
      <p><b>Explanation:</b> ${safeText(a.explanation) || "-"}</p>
    `;

    resultDetails.appendChild(div);
  });

  showPage("examResult");
}

function getStudyAdvice(p, answers = []) {
  const noAnswerCount = answers.filter(a => !a.student_answer).length;
  const wrongCount = answers.filter(a => !a.is_correct && a.student_answer).length;

  if (noAnswerCount > 0) {
    return `
      <h2>Study Advice</h2>
      <p>You left ${noAnswerCount} question(s) unanswered. Focus on time management and answering every question before submitting.</p>

      <div class="planner-recommendation-card">
        <h3>Recommended Planner Task 📅</h3>
        <p><strong>Task:</strong> Practise timed answering. Solve a short exam and make sure you answer every question before time ends.</p>
        <p><strong>Study Type:</strong> Timed Answering Practice</p>
        <p><strong>Suggested Time:</strong> 25–30 minutes</p>
        <button class="violet" onclick="addRecommendedTaskToPlanner('no_answer')">
          Add this task to my Planner
        </button>
      </div>

      <div class="next-action-card">
        <h3>Next Step 🎯</h3>
        <p>Repeat a short quiz and focus on answering all questions, even if you are not 100% sure.</p>
      </div>
    `;
  }

  if (p < 50 || wrongCount > 0) {
    return `
      <h2>Study Advice</h2>
      <p>You need to review your wrong answers carefully and practise similar questions.</p>

      <div class="planner-recommendation-card">
        <h3>Recommended Planner Task 📅</h3>
        <p><strong>Task:</strong> Review your wrong questions, write the mistakes in a mistake notebook, and solve 10 similar questions.</p>
        <p><strong>Study Type:</strong> Mistake Correction</p>
        <p><strong>Suggested Time:</strong> 30–45 minutes</p>
        <button class="violet" onclick="addRecommendedTaskToPlanner('wrong_answers')">
          Add this task to my Planner
        </button>
      </div>

      <div class="next-action-card">
        <h3>Next Step 🎯</h3>
        <p>Focus on the exact questions you missed, then repeat the rule with easier examples.</p>
      </div>
    `;
  }

  if (p < 80) {
    return `
      <h2>Study Advice</h2>
      <p>Good work. Focus on speed and practise timed questions.</p>

      <div class="planner-recommendation-card">
        <h3>Recommended Planner Task 📅</h3>
        <p><strong>Task:</strong> Solve a short timed practice exam and review your answers.</p>
        <p><strong>Study Type:</strong> Timed Practice</p>
        <p><strong>Suggested Time:</strong> 30 minutes</p>
        <button class="violet" onclick="addRecommendedTaskToPlanner('practice')">
          Add this task to my Planner
        </button>
      </div>

      <div class="next-action-card">
        <h3>Next Step 🎯</h3>
        <p>Try to improve your speed and avoid careless mistakes.</p>
      </div>
    `;
  }

  return `
    <h2>Study Advice</h2>
    <p>Excellent. Move to advanced questions and teach the idea to someone else.</p>

    <div class="planner-recommendation-card">
      <h3>Recommended Planner Task 📅</h3>
      <p><strong>Task:</strong> Solve advanced questions and challenge yourself with harder examples.</p>
      <p><strong>Study Type:</strong> Advanced Practice</p>
      <p><strong>Suggested Time:</strong> 20–30 minutes</p>
      <button class="violet" onclick="addRecommendedTaskToPlanner('advanced')">
        Add this task to my Planner
      </button>
    </div>

    <div class="next-action-card">
      <h3>Next Step 🎯</h3>
      <p>Create your own exam-style question or explain the rule to another student.</p>
    </div>
  `;
}
async function saveExamResult(score, total, percentage, answers) {
  const user = await getCurrentUser();
  if (!user || !currentPreviewExam) return;

  const r = await client.from("exam_results").insert([{ student_id: user.id, exam_id: currentPreviewExam.id, score, total, percentage, answers }]);
  if (r.error) console.warn(r.error.message);
}

async function loadMyResults() {
  if (!$('myResultsList')) return;
  myResultsList.innerHTML = "Loading...";

  const user = await getCurrentUser();
  if (!user) return;

  const r = await client
  .from("exam_results")
  .select("*, exams(title)")
  .eq("student_id", user.id)
  .order("submitted_at", { ascending: false });

  if (r.error) {
    myResultsList.innerHTML = "Error";
    return;
  }

  const rows = r.data || [];
  myResultsList.innerHTML = rows.length ? "" : "No results yet";
  rows.forEach(x => {
    const d = document.createElement("div");
    d.className = "box";
    d.innerHTML = `<h3>${safeText(x.exams?.title || "Exam")}</h3><p>Score: ${x.score}/${x.total} (${x.percentage}%)</p><p>${new Date(x.submitted_at).toLocaleString()}</p>`;
    myResultsList.appendChild(d);
  });
}

async function loadTeacherResults(filter = "all") {
  const list = document.getElementById("teacherResultsList");
  const summary = document.getElementById("teacherResultsSummary");
  const status = document.getElementById("teacherResultsStatus");

  if (!list) return;

  list.innerHTML = "Loading results...";
  if (summary) summary.innerHTML = "";
  if (status) status.textContent = "Loading results...";

  const { data: resultsRaw, error } = await client
    .from("exam_results")
    .select("*, exams(title)")
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("Teacher results error:", error);
    list.innerHTML = "<p>Could not load results.</p>";
    if (status) status.textContent = "Could not load results.";
    return;
  }

  if (!resultsRaw || resultsRaw.length === 0) {
    list.innerHTML = "<p>No results yet.</p>";
    if (summary) summary.innerHTML = "";
    if (status) status.textContent = "No results yet.";
    return;
  }

  let results = [...resultsRaw];

  if (filter === "passed") {
    results = results.filter(result => Number(result.percentage || 0) >= 50);
  }

  if (filter === "failed") {
    results = results.filter(result => Number(result.percentage || 0) < 50);
  }

  if (filter === "best") {
    const bestByStudent = {};

    results.forEach(result => {
      if (!result.student_id) return;

      const currentBest = bestByStudent[result.student_id];

      if (!currentBest) {
        bestByStudent[result.student_id] = result;
        return;
      }

      const resultPercentage = Number(result.percentage || 0);
      const bestPercentage = Number(currentBest.percentage || 0);

      const resultScore = Number(result.score || 0);
      const bestScore = Number(currentBest.score || 0);

      const resultDate = result.submitted_at ? new Date(result.submitted_at).getTime() : 0;
      const bestDate = currentBest.submitted_at ? new Date(currentBest.submitted_at).getTime() : 0;

      if (
        resultPercentage > bestPercentage ||
        (resultPercentage === bestPercentage && resultScore > bestScore) ||
        (resultPercentage === bestPercentage && resultScore === bestScore && resultDate > bestDate)
      ) {
        bestByStudent[result.student_id] = result;
      }
    });

    results = Object.values(bestByStudent);
  }

  if (!results.length) {
    list.innerHTML = "<p>No results match this filter.</p>";
    if (summary) summary.innerHTML = "";
    if (status) status.textContent = "No results match this filter.";
    return;
  }

  results.sort((a, b) => {
    const percentageDiff = Number(b.percentage || 0) - Number(a.percentage || 0);
    if (percentageDiff !== 0) return percentageDiff;

    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;

    const dateA = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
    const dateB = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
    return dateB - dateA;
  });

  const studentIds = [
    ...new Set(
      results
        .map(result => result.student_id)
        .filter(Boolean)
    )
  ];

  let profilesMap = {};

  if (studentIds.length > 0) {
    const { data: profiles, error: profilesError } = await client
      .from("profiles")
      .select("id, full_name, email, role")
      .in("id", studentIds);

    if (profilesError) {
      console.warn("Profiles loading error:", profilesError);
    }

    (profiles || []).forEach(profile => {
      profilesMap[profile.id] = profile;
    });
  }

  const totalSubmissions = results.length;
  const percentages = results.map(result => Number(result.percentage || 0));

  const averageScore = Math.round(
    percentages.reduce((sum, value) => sum + value, 0) / totalSubmissions
  );

  const highestScore = Math.max(...percentages);
  const lowestScore = Math.min(...percentages);

  const passedCount = results.filter(result => Number(result.percentage || 0) >= 50).length;
  const failedCount = results.filter(result => Number(result.percentage || 0) < 50).length;

  const passRate = Math.round((passedCount / totalSubmissions) * 100);

  const uniqueStudentsCount = new Set(
    results
      .map(result => result.student_id)
      .filter(Boolean)
  ).size;

  const uniqueExamsCount = new Set(
    results
      .map(result => result.exam_id)
      .filter(Boolean)
  ).size;

  const topResult = results.reduce((best, current) => {
    const bestPercentage = Number(best.percentage || 0);
    const currentPercentage = Number(current.percentage || 0);

    if (currentPercentage > bestPercentage) return current;

    if (currentPercentage === bestPercentage) {
      const bestScore = Number(best.score || 0);
      const currentScore = Number(current.score || 0);
      if (currentScore > bestScore) return current;
    }

    return best;
  }, results[0]);

  const weakestResult = results.reduce((weakest, current) => {
    const weakestPercentage = Number(weakest.percentage || 0);
    const currentPercentage = Number(current.percentage || 0);

    if (currentPercentage < weakestPercentage) return current;

    if (currentPercentage === weakestPercentage) {
      const weakestScore = Number(weakest.score || 0);
      const currentScore = Number(current.score || 0);
      if (currentScore < weakestScore) return current;
    }

    return weakest;
  }, results[0]);

  const topProfile = profilesMap[topResult.student_id];
  const weakestProfile = profilesMap[weakestResult.student_id];

  const topStudentName =
    topProfile?.full_name ||
    topProfile?.email ||
    topResult.student_id ||
    "Unknown Student";

  const weakestStudentName =
    weakestProfile?.full_name ||
    weakestProfile?.email ||
    weakestResult.student_id ||
    "Unknown Student";

  const examStats = {};

  results.forEach(result => {
    const examTitle = result.exams?.title || "Exam";
    const percentage = Number(result.percentage || 0);

    if (!examStats[examTitle]) {
      examStats[examTitle] = {
        attempts: 0,
        totalPercentage: 0,
        best: percentage,
        lowest: percentage
      };
    }

    examStats[examTitle].attempts += 1;
    examStats[examTitle].totalPercentage += percentage;
    examStats[examTitle].best = Math.max(examStats[examTitle].best, percentage);
    examStats[examTitle].lowest = Math.min(examStats[examTitle].lowest, percentage);
  });

  const examInsights = Object.entries(examStats).map(([examTitle, stats]) => {
    const avg = Math.round(stats.totalPercentage / stats.attempts);

    return {
      examTitle,
      average: avg,
      attempts: stats.attempts,
      best: stats.best,
      lowest: stats.lowest
    };
  });

  const weakestExam = examInsights.length
    ? examInsights.reduce((weakest, current) =>
        current.average < weakest.average ? current : weakest
      )
    : null;

  const strongestExam = examInsights.length
    ? examInsights.reduce((strongest, current) =>
        current.average > strongest.average ? current : strongest
      )
    : null;

  const studentsNeedSupport = results.filter(result =>
    Number(result.percentage || 0) < 50
  ).length;

  const recommendedAction =
    studentsNeedSupport >= 5
      ? "Create a revision exam and assign targeted practice for weak students."
      : studentsNeedSupport > 0
        ? "Review the weakest exam and give short remedial tasks."
        : "Great performance. You can assign a more challenging follow-up exam.";

  const studentStats = {};

  results.forEach(result => {
    if (!result.student_id) return;

    const percentage = Number(result.percentage || 0);
    const examTitle = result.exams?.title || "Exam";

    if (!studentStats[result.student_id]) {
      const profile = profilesMap[result.student_id];

      studentStats[result.student_id] = {
        studentId: result.student_id,
        studentName:
          profile?.full_name ||
          profile?.email ||
          result.student_id ||
          "Unknown Student",
        attempts: 0,
        totalPercentage: 0,
        best: percentage,
        lowest: percentage,
        below50: 0,
        weakExams: [],
        latestDate: result.submitted_at || null
      };
    }

    const stats = studentStats[result.student_id];

    stats.attempts += 1;
    stats.totalPercentage += percentage;
    stats.best = Math.max(stats.best, percentage);
    stats.lowest = Math.min(stats.lowest, percentage);

    if (percentage < 50) {
      stats.below50 += 1;
      stats.weakExams.push(examTitle);
    }

    const oldTime = stats.latestDate ? new Date(stats.latestDate).getTime() : 0;
    const newTime = result.submitted_at ? new Date(result.submitted_at).getTime() : 0;

    if (newTime > oldTime) {
      stats.latestDate = result.submitted_at;
    }
  });

  const studentAnalysis = Object.values(studentStats)
    .map(student => {
      const average = Math.round(student.totalPercentage / student.attempts);

      const riskLevel =
        average < 50 || student.below50 >= 2
          ? "High Support 🔴"
          : average < 70
            ? "Needs Practice 🟡"
            : "Strong 🟢";

      const advice =
        average < 50 || student.below50 >= 2
          ? "Assign a remedial task and follow up closely."
          : average < 70
            ? "Give short targeted practice on weak exams."
            : "Give enrichment tasks or a more challenging exam.";

      return {
        ...student,
        average,
        riskLevel,
        advice
      };
    })
    .sort((a, b) => {
      if (b.below50 !== a.below50) return b.below50 - a.below50;
      return a.average - b.average;
    });

  const studentAnalysisHtml = studentAnalysis
  .slice(0, 6)
  .map(student => {
    const weakExamsText = student.weakExams.length
      ? [...new Set(student.weakExams)].slice(0, 3).join(", ")
      : "No major weak exam";

    return `
      <div class="box">
        <h3>${safeText(student.studentName)}</h3>
        <p><strong>Attempts:</strong> ${safeText(student.attempts)}</p>
        <p><strong>Average:</strong> ${safeText(student.average)}%</p>
        <p><strong>Best:</strong> ${safeText(student.best)}%</p>
        <p><strong>Lowest:</strong> ${safeText(student.lowest)}%</p>
        <p><strong>Below 50%:</strong> ${safeText(student.below50)} time(s)</p>
        <p><strong>Risk Level:</strong> ${safeText(student.riskLevel)}</p>
        <p><strong>Weak Exams:</strong> ${safeText(weakExamsText)}</p>
        <p><strong>Teacher Advice:</strong> ${safeText(student.advice)}</p>

        <div class="actions" style="margin-top: 12px;">
          <button 
            type="button" 
            class="gold"
            onclick="createStudentSupportPlan('${student.studentId}', '${safeText(student.studentName)}', ${student.average}, ${student.below50}, '${safeText(student.riskLevel)}', '${safeText(weakExamsText)}')"
          >
            Create Support Plan 📘
          </button>
        </div>
      </div>
    `;
  })
  .join("");

  const examStatsHtml = Object.entries(examStats)
    .map(([examTitle, stats]) => {
      const avg = Math.round(stats.totalPercentage / stats.attempts);

      return `
        <div class="box">
          <h3>${safeText(examTitle)}</h3>
          <p><strong>Attempts:</strong> ${safeText(stats.attempts)}</p>
          <p><strong>Average:</strong> ${safeText(avg)}%</p>
          <p><strong>Best:</strong> ${safeText(stats.best)}%</p>
          <p><strong>Lowest:</strong> ${safeText(stats.lowest)}%</p>
        </div>
      `;
    })
    .join("");

  const filterTitle =
    filter === "passed" ? "Passed Students" :
    filter === "failed" ? "Failed Students" :
    filter === "best" ? "Best Result Per Student" :
    "All Results";

  if (summary) {
    summary.innerHTML = `
      <div class="panel-title">
        <span class="panel-number">A</span>
        <div>
          <h2>Teacher Results Analytics 📊</h2>
          <p>Current Filter: <strong>${safeText(filterTitle)}</strong></p>
        </div>
      </div>

      <div class="actions" style="margin: 12px 0;">
        <button onclick="loadTeacherResults('all')">All Results</button>
        <button class="success" onclick="loadTeacherResults('passed')">Passed</button>
        <button class="danger" onclick="loadTeacherResults('failed')">Below 50%</button>
        <button class="gold" onclick="loadTeacherResults('best')">Best Per Student</button>
      </div>

      <div class="grid three">
        <div class="box analytics-card-box">
          <h2>Total Attempts</h2>
          <p>${safeText(totalSubmissions)}</p>
          <span>Shown submissions</span>
        </div>

        <div class="box analytics-card-box">
          <h2>Class Average</h2>
          <p>${safeText(averageScore)}%</p>
          <span>Average performance</span>
        </div>

        <div class="box analytics-card-box">
          <h2>Pass Rate</h2>
          <p>${safeText(passRate)}%</p>
          <span>${safeText(passedCount)} passed / ${safeText(failedCount)} below 50%</span>
        </div>

        <div class="box analytics-card-box">
          <h2>Students</h2>
          <p>${safeText(uniqueStudentsCount)}</p>
          <span>Unique students</span>
        </div>

        <div class="box analytics-card-box">
          <h2>Exams</h2>
          <p>${safeText(uniqueExamsCount)}</p>
          <span>Different exams</span>
        </div>

        <div class="box analytics-card-box">
          <h2>Best Score</h2>
          <p>${safeText(highestScore)}%</p>
          <span>${safeText(topStudentName)}</span>
        </div>

        <div class="box analytics-card-box">
          <h2>Lowest Score</h2>
          <p>${safeText(lowestScore)}%</p>
          <span>${safeText(weakestStudentName)}</span>
        </div>
      </div>

      <div class="box" style="margin-top: 14px;">
        <h2>Smart Insights 🧠</h2>
        <p>Automatic teaching recommendations based on student performance.</p>

        <div class="grid three">
          <div class="box analytics-card-box">
            <h2>Weakest Exam</h2>
            <p>${safeText(weakestExam ? weakestExam.average + "%" : "N/A")}</p>
            <span>${safeText(weakestExam ? weakestExam.examTitle : "No exam data")}</span>
          </div>

          <div class="box analytics-card-box">
            <h2>Strongest Exam</h2>
            <p>${safeText(strongestExam ? strongestExam.average + "%" : "N/A")}</p>
            <span>${safeText(strongestExam ? strongestExam.examTitle : "No exam data")}</span>
          </div>

          <div class="box analytics-card-box">
            <h2>Need Support</h2>
            <p>${safeText(studentsNeedSupport)}</p>
            <span>Students below 50%</span>
          </div>
        </div>

        <div class="box" style="margin-top: 12px;">
          <h3>Recommended Teacher Action</h3>
          <p>${safeText(recommendedAction)}</p>
        </div>
      </div>

      <div class="box" style="margin-top: 14px;">
        <h2>Student Weakness Analysis 🧩</h2>
        <p>Students are sorted by support priority: repeated low scores and lower averages appear first.</p>

        <div class="grid three">
          ${studentAnalysisHtml || "<p>No student analysis available.</p>"}
        </div>
      </div>

      <div class="box" style="margin-top: 14px;">
        <h2>Exam Breakdown</h2>
        <p>Attempts, average, best score, and lowest score for each exam.</p>
        <div class="grid three">
          ${examStatsHtml}
        </div>
      </div>
    `;
  }

  if (status) {
    status.textContent = "Results loaded: " + results.length + " | Filter: " + filterTitle;
  }

  list.innerHTML = "";

  results.forEach(result => {
    const profile = profilesMap[result.student_id];

    const studentName =
      profile?.full_name ||
      profile?.email ||
      result.student_id ||
      "Unknown Student";

    const examTitle =
      result.exams?.title ||
      "Exam";

    const score = result.score ?? 0;
    const total = result.total ?? 0;
    const percentage = result.percentage ?? 0;

    const submittedDate = result.submitted_at
      ? new Date(result.submitted_at).toLocaleString()
      : "Date not available";

    const statusLabel =
      Number(percentage) >= 80 ? "🟢 Excellent" :
      Number(percentage) >= 50 ? "🟡 Needs Practice" :
      "🔴 Needs Support";

    const d = document.createElement("div");
    d.className = "box";

    d.innerHTML = `
      <h3>${safeText(studentName)}</h3>
      <p><strong>Exam:</strong> ${safeText(examTitle)}</p>
      <p><strong>Score:</strong> ${safeText(score)}/${safeText(total)} (${safeText(percentage)}%)</p>
      <p><strong>Status:</strong> ${safeText(statusLabel)}</p>
      <p><strong>Submitted:</strong> ${safeText(submittedDate)}</p>
    `;

    list.appendChild(d);
  });
}
function createStudentSupportPlan(studentId, studentName, average, below50, riskLevel, weakExamsText) {
  const planBox = document.getElementById("studentSupportPlanBox");
  const planContent = document.getElementById("studentSupportPlanContent");

  if (!planBox || !planContent) {
    alert("Support plan box is missing in the page.");
    return;
  }

  const planLevel =
    average < 50 || below50 >= 2
      ? "High Support Plan 🔴"
      : average < 70
        ? "Practice Support Plan 🟡"
        : "Enrichment Plan 🟢";

  const mainFocus =
    average < 50 || below50 >= 2
      ? "Review weak lessons, correct mistakes, and solve remedial exercises."
      : average < 70
        ? "Practice selected weak points and complete short revision tasks."
        : "Challenge the student with advanced exercises and enrichment tasks.";

  const weeklyTasks =
    average < 50 || below50 >= 2
      ? [
          "Review the weakest exam and write down all mistakes.",
          "Restudy the related lesson with examples.",
          "Solve 10 easy remedial questions.",
          "Solve 10 mixed practice questions.",
          "Take a short follow-up quiz."
        ]
      : average < 70
        ? [
            "Review mistakes from the latest exam.",
            "Practice 10 questions on weak areas.",
            "Correct wrong answers and write the rule/example.",
            "Solve a short mixed quiz.",
            "Review progress with the teacher."
          ]
        : [
            "Solve advanced challenge questions.",
            "Explain one difficult idea in writing.",
            "Complete a timed mini-quiz.",
            "Try a higher-level task.",
            "Set a new goal based on performance."
          ];
  const copyText = `
Student Support Plan

Student: ${studentName}
Student ID: ${studentId}
Average: ${average}%
Below 50% Attempts: ${below50}
Risk Level: ${riskLevel}
Weak Exams: ${weakExamsText || "No major weak exam"}

Plan Type: ${planLevel}

Main Focus:
${mainFocus}

Weekly Tasks:
${weeklyTasks.map((task, index) => `${index + 1}. ${task}`).join("\n")}
  `.trim();

planBox.dataset.copyText = copyText;

const planPayload = {
  student_id: studentId,
  student_name: studentName,
  plan_type: planLevel,
  risk_level: riskLevel,
  average: Number(average),
  below_50_count: Number(below50),
  weak_exams: weakExamsText || "No major weak exam",
  main_focus: mainFocus,
  weekly_tasks: weeklyTasks,
  status: "active",
  source: "teacher_results_analytics"
};

planBox.dataset.planPayload = JSON.stringify(planPayload);

planContent.innerHTML = `
    <div class="support-plan-grid">
      <div class="support-plan-card">
        <h3>${safeText(studentName)}</h3>
        <p><strong>Student ID:</strong> ${safeText(studentId)}</p>
        <p><strong>Average:</strong> ${safeText(average)}%</p>
        <p><strong>Below 50% Attempts:</strong> ${safeText(below50)}</p>
        <p><strong>Risk Level:</strong> ${safeText(riskLevel)}</p>
        <p><strong>Weak Exams:</strong> ${safeText(weakExamsText || "No major weak exam")}</p>
      </div>

      <div class="support-plan-card">
        <h3>${safeText(planLevel)}</h3>
        <p><strong>Main Focus:</strong></p>
        <p>${safeText(mainFocus)}</p>
      </div>
    </div>

    <div class="support-plan-tasks">
      <h3>Weekly Tasks</h3>
      <ol>
        ${weeklyTasks.map(task => `<li>${safeText(task)}</li>`).join("")}
      </ol>
    </div>
  `;

  planBox.style.display = "block";
  planBox.scrollIntoView({ behavior: "smooth", block: "center" });
}
function closeStudentSupportPlan() {
  const planBox = document.getElementById("studentSupportPlanBox");
  const planContent = document.getElementById("studentSupportPlanContent");

  if (planContent) planContent.innerHTML = "";
  if (planBox) planBox.style.display = "none";
}
async function copyStudentSupportPlan() {
  const planBox = document.getElementById("studentSupportPlanBox");
  const text = planBox?.dataset?.copyText;

  if (!text) {
    alert("No support plan to copy.");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    alert("Support plan copied ✅");
  } catch (error) {
    console.error("Copy support plan error:", error);

    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();

    alert("Support plan copied ✅");
  }
}
function printStudentSupportPlan() {
  const planBox = document.getElementById("studentSupportPlanBox");
  const planContent = document.getElementById("studentSupportPlanContent");
  const text = planBox?.dataset?.copyText;

  if (!planBox || !planContent || !text) {
    alert("No support plan to print.");
    return;
  }

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    alert("Please allow pop-ups to print the support plan.");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Student Support Plan</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 30px;
            line-height: 1.6;
            color: #111827;
          }

          .header {
            border-bottom: 3px solid #1e3a8a;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }

          .brand {
            font-size: 14px;
            font-weight: bold;
            color: #1e3a8a;
            letter-spacing: 1px;
            text-transform: uppercase;
          }

          h1 {
            margin: 6px 0;
            color: #111827;
          }

          pre {
            white-space: pre-wrap;
            font-family: Arial, sans-serif;
            background: #f8fafc;
            border: 1px solid #e5e7eb;
            border-radius: 14px;
            padding: 18px;
          }

          .footer {
            margin-top: 25px;
            font-size: 12px;
            color: #6b7280;
          }

          @media print {
            button {
              display: none;
            }
          }
        </style>
      </head>

      <body>
        <div class="header">
          <div class="brand">JAK Academy</div>
          <h1>Student Support Plan</h1>
          <p>Generated from Teacher Results Analytics</p>
        </div>

        <pre>${safeText(text)}</pre>

        <div class="footer">
          Generated by JAK Academy — Teacher Analytics System
        </div>

        <script>
          window.onload = function () {
            window.print();
          };
        <\/script>
      </body>
    </html>
  `);

  printWindow.document.close();
}
async function saveStudentSupportPlan() {
  const planBox = document.getElementById("studentSupportPlanBox");
  const rawPayload = planBox?.dataset?.planPayload;

  if (!rawPayload) {
    alert("No support plan to save.");
    return;
  }

  const { data: userData, error: userError } = await client.auth.getUser();
  const currentUser = userData?.user;

  if (userError || !currentUser) {
    alert("Please log in first.");
    return;
  }

  let payload;

  try {
    payload = JSON.parse(rawPayload);
  } catch (error) {
    console.error("Support plan payload parse error:", error);
    alert("Could not read support plan data.");
    return;
  }

  const { error } = await client
    .from("support_plans")
    .insert({
      teacher_id: currentUser.id,
      student_id: payload.student_id,
      student_name: payload.student_name,
      plan_type: payload.plan_type,
      risk_level: payload.risk_level,
      average: payload.average,
      below_50_count: payload.below_50_count,
      weak_exams: payload.weak_exams,
      main_focus: payload.main_focus,
      weekly_tasks: payload.weekly_tasks,
      status: payload.status || "active",
      source: payload.source || "teacher_results_analytics"
    });

  if (error) {
    console.error("Save support plan error:", error);
    alert("Could not save support plan.");
    return;
  }

  alert("Support plan saved to planner ✅");
}
async function loadSavedSupportPlans() {
  const list = document.getElementById("savedSupportPlansList");
  const msg = document.getElementById("savedSupportPlansMsg");

  if (!list) return;

  list.innerHTML = "Loading saved support plans...";
  if (msg) msg.textContent = "Loading saved support plans...";

  const { data, error } = await client
    .from("support_plans")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load saved support plans error:", error);
    list.innerHTML = "<p>Could not load saved support plans.</p>";
    if (msg) msg.textContent = "Could not load saved support plans.";
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = "<p>No saved support plans yet.</p>";
    if (msg) msg.textContent = "No saved support plans yet.";
    return;
  }

  list.innerHTML = "";

  data.forEach(plan => {
    const tasks = Array.isArray(plan.weekly_tasks)
      ? plan.weekly_tasks
      : [];

    const createdDate = plan.created_at
      ? new Date(plan.created_at).toLocaleString()
      : "Date not available";

    const d = document.createElement("div");
    d.className = "box saved-support-plan-card";

    d.innerHTML = `
      <span class="badge">${safeText(plan.status || "active")}</span>
      <span class="badge">${safeText(plan.source || "support_plan")}</span>

      <h3>${safeText(plan.student_name || "Unknown Student")}</h3>

      <p><strong>Plan Type:</strong> ${safeText(plan.plan_type || "Support Plan")}</p>
      <p><strong>Risk Level:</strong> ${safeText(plan.risk_level || "Not specified")}</p>
      <p><strong>Average:</strong> ${safeText(plan.average ?? "N/A")}%</p>
      <p><strong>Below 50%:</strong> ${safeText(plan.below_50_count ?? 0)} time(s)</p>
      <p><strong>Weak Exams:</strong> ${safeText(plan.weak_exams || "No weak exams listed")}</p>
      <p><strong>Main Focus:</strong> ${safeText(plan.main_focus || "No focus listed")}</p>
      <p><strong>Created:</strong> ${safeText(createdDate)}</p>

            <div class="support-plan-tasks">
        <h3>Weekly Tasks</h3>
        ${
          tasks.length
            ? `<ol>${tasks.map(task => `<li>${safeText(task)}</li>`).join("")}</ol>`
            : "<p>No tasks saved.</p>"
        }
      </div>

      <div class="actions" style="margin-top: 12px;">
        <button 
          type="button" 
          class="gold"
          onclick="addSupportPlanTasksToPlanner('${plan.id}')"
        >
          Add Tasks to Planner ✅
        </button>
      </div>
    
    `;

    list.appendChild(d);
  });

  if (msg) msg.textContent = "Saved support plans loaded: " + data.length;
}
async function addSupportPlanTasksToPlanner(planId) {
  const { data: plan, error } = await client
    .from("support_plans")
    .select("*")
    .eq("id", planId)
    .single();

  if (error || !plan) {
    console.error("Load support plan for planner error:", error);
    alert("Could not load this support plan.");
    return;
  }

  const tasks = Array.isArray(plan.weekly_tasks) ? plan.weekly_tasks : [];

  if (!tasks.length) {
    alert("This support plan has no weekly tasks.");
    return;
  }

  const existingPlans = getPlannerData();

  const alreadyAdded = existingPlans.some(task =>
    task.source === "support_plan" &&
    task.support_plan_id === plan.id
  );

  if (alreadyAdded) {
    alert("This support plan is already added to Planner ✅");
    return;
  }

  const today = new Date();

  const newPlannerTasks = tasks.map((task, index) => {
    const taskDate = new Date(today);
    taskDate.setDate(today.getDate() + index);

    const dateString = taskDate.toISOString().split("T")[0];

    return {
      id: "support-" + plan.id + "-" + Date.now() + "-" + index,
      subject: "Support Plan",
      date: dateString,
      start: "16:00",
      end: "16:30",
      type: "Support Plan",
      task: task,
      color: "#3b82f6",

      // Planner-compatible status
      status: "not_started",

      // Future Planner metadata
      source: "support_plan",
      system: "support_plan",
      support_plan_id: plan.id
    };
  });

  const updatedPlans = [...existingPlans, ...newPlannerTasks];

  savePlannerData(updatedPlans);

  alert("Support plan tasks added to Planner ✅");

  if (typeof renderPlanner === "function") {
    renderPlanner();
  }

  if (typeof renderCalendar === "function") {
    renderCalendar();
  }

  if (typeof renderTodayTasks === "function") {
    renderTodayTasks();
  }

  if (typeof updatePlannerStats === "function") {
    updatePlannerStats();
  }

  if (typeof renderStudyAnalytics === "function") {
    renderStudyAnalytics();
  }
}
async function loadMySupportPlans() {
  const list = document.getElementById("mySupportPlansList");
  const msg = document.getElementById("mySupportPlansMsg");

  if (!list) return;

  list.innerHTML = "Loading your support plans...";
  if (msg) msg.textContent = "Loading your support plans...";

  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userData?.user;

  if (userError || !user) {
    list.innerHTML = "<p>Please log in to view your support plans.</p>";
    if (msg) msg.textContent = "Please log in first.";
    return;
  }

  const { data, error } = await client
    .from("support_plans")
    .select("*")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load my support plans error:", error);
    list.innerHTML = "<p>Could not load your support plans.</p>";
    if (msg) msg.textContent = "Could not load your support plans.";
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = "<p>No support plans assigned yet.</p>";
    if (msg) msg.textContent = "No support plans assigned yet.";
    return;
  }

  list.innerHTML = "";

  data.forEach(plan => {
    const tasks = Array.isArray(plan.weekly_tasks)
      ? plan.weekly_tasks
      : [];

    const createdDate = plan.created_at
      ? new Date(plan.created_at).toLocaleString()
      : "Date not available";

    const d = document.createElement("div");
    d.className = "box saved-support-plan-card student-support-plan-card";

    d.innerHTML = `
      <span class="badge">${safeText(plan.status || "active")}</span>
      <span class="badge">${safeText(plan.plan_type || "Support Plan")}</span>

      <h3>${safeText(plan.plan_type || "Support Plan")}</h3>

      <p><strong>Risk Level:</strong> ${safeText(plan.risk_level || "Not specified")}</p>
      <p><strong>Average:</strong> ${safeText(plan.average ?? "N/A")}%</p>
      <p><strong>Below 50%:</strong> ${safeText(plan.below_50_count ?? 0)} time(s)</p>
      <p><strong>Weak Exams:</strong> ${safeText(plan.weak_exams || "No weak exams listed")}</p>
      <p><strong>Main Focus:</strong> ${safeText(plan.main_focus || "No focus listed")}</p>
      <p><strong>Created:</strong> ${safeText(createdDate)}</p>

      <div class="support-plan-tasks">
        <h3>Weekly Tasks</h3>
        ${
          tasks.length
            ? `<ol>${tasks.map(task => `<li>${safeText(task)}</li>`).join("")}</ol>`
            : "<p>No tasks saved.</p>"
        }
      </div>
    `;

    list.appendChild(d);
  });

  if (msg) msg.textContent = "Support plans loaded: " + data.length;
}
function editExam(exam) {
  editingExamId = exam.id;

  if ($("examTitle")) $("examTitle").value = exam.title || "";
  if ($("examDesc")) $("examDesc").value = exam.description || "";
  if ($("examTime")) $("examTime").value = exam.time_limit || 10;
  if ($("examQuestionCount")) $("examQuestionCount").value = exam.question_count || "";
  if ($("examType")) $("examType").value = exam.exam_type || "multiple_choice";
  if ($("examGrade")) $("examGrade").value = exam.grade_level || "";

  const btn = document.getElementById("createExamBtn");
  if (btn) btn.textContent = "Update Exam";

  const msg = $("examMsg");
  if (msg) msg.textContent = "Editing exam. Update the details, then click Update Exam.";

  showPage("teacherDashboard");
}

async function toggleExamStatus(examId, currentStatus) {
  const newStatus = currentStatus === "published" ? "draft" : "published";

  // إذا المعلم يريد نشر الامتحان، لازم نتأكد أن فيه أسئلة أولًا
  if (newStatus === "published") {
    const { data: questions, error: questionsError } = await client
      .from("questions")
      .select("id")
      .eq("exam_id", examId)
      .limit(1);

    if (questionsError) {
      console.error("Check exam questions error:", questionsError);
      alert("Could not check exam questions.");
      return;
    }

    if (!questions || questions.length === 0) {
      alert("You must add questions before publishing this exam.");
      return;
    }
  }

  const { error } = await client
    .from("exams")
    .update({ status: newStatus })
    .eq("id", examId);

  if (error) {
    console.error("Toggle exam status error:", error);
    alert("Could not update exam status.");
    return;
  }

  alert(newStatus === "published" ? "Exam published ✅" : "Exam unpublished ✅");

  await loadTeacherExams();
}
async function loadLeaderboard(type = "weekly") {
  const list = document.getElementById("leaderboardList");
  if (!list) return;

  list.innerHTML = "Loading...";

  const { data: resultsRaw, error: resultsError } = await client
    .from("exam_results")
    .select("*, exams(title)")
    .order("percentage", { ascending: false })
    .order("score", { ascending: false });

  if (resultsError) {
    console.error("Leaderboard error:", resultsError);
    list.innerHTML = "<p>Could not load leaderboard.</p>";
    return;
  }

  let results = resultsRaw || [];

  // Daily / Weekly filter using submitted_at
  const start = new Date();

  if (type === "daily") {
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - 7);
  }

  results = results.filter(result => {
    if (!result.submitted_at) return true;
    return new Date(result.submitted_at) >= start;
  });

  if (!results.length) {
    list.innerHTML = `
      <h2>${type === "daily" ? "Daily" : "Weekly"} Leaderboard 🏆</h2>
      <p>No results yet.</p>
    `;
    return;
  }

  // Keep only the BEST result for each student
  const bestByStudent = {};

  results.forEach(result => {
    if (!result.student_id) return;

    const currentBest = bestByStudent[result.student_id];

    if (!currentBest) {
      bestByStudent[result.student_id] = result;
      return;
    }

    const resultPercentage = Number(result.percentage || 0);
    const bestPercentage = Number(currentBest.percentage || 0);

    const resultScore = Number(result.score || 0);
    const bestScore = Number(currentBest.score || 0);

    const resultDate = result.submitted_at ? new Date(result.submitted_at).getTime() : 0;
    const bestDate = currentBest.submitted_at ? new Date(currentBest.submitted_at).getTime() : 0;

    // Ranking rule:
    // 1. Higher percentage
    // 2. Higher score
    // 3. Newer submission
    if (
      resultPercentage > bestPercentage ||
      (resultPercentage === bestPercentage && resultScore > bestScore) ||
      (resultPercentage === bestPercentage && resultScore === bestScore && resultDate > bestDate)
    ) {
      bestByStudent[result.student_id] = result;
    }
  });

  results = Object.values(bestByStudent);

  // Sort final leaderboard
  results.sort((a, b) => {
    const percentageDiff = Number(b.percentage || 0) - Number(a.percentage || 0);
    if (percentageDiff !== 0) return percentageDiff;

    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;

    const dateA = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
    const dateB = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
    return dateB - dateA;
  });

  const studentIds = [
    ...new Set(
      results
        .map(result => result.student_id)
        .filter(Boolean)
    )
  ];

  let profilesMap = {};

  if (studentIds.length > 0) {
    const { data: profiles, error: profilesError } = await client
      .from("profiles")
      .select("id, full_name, email, role")
      .in("id", studentIds);

    if (profilesError) {
      console.warn("Profiles loading error:", profilesError);
    }

    (profiles || []).forEach(profile => {
      profilesMap[profile.id] = profile;
    });
  }

  list.innerHTML = `
    <h2>${type === "daily" ? "Daily" : "Weekly"} Leaderboard 🏆</h2>
    <p>Showing the best result for each student.</p>
  `;

  results.forEach((result, index) => {
    const medal =
      index === 0 ? "🥇" :
      index === 1 ? "🥈" :
      index === 2 ? "🥉" :
      "#" + (index + 1);

    const profile = profilesMap[result.student_id];

    const studentName =
      profile?.full_name ||
      profile?.email ||
      "Unknown Student";

    const examTitle =
      result.exams?.title ||
      "Exam";

    const score = result.score ?? 0;
    const total = result.total ?? 0;
    const percentage = result.percentage ?? 0;

    const submittedDate = result.submitted_at
      ? new Date(result.submitted_at).toLocaleString()
      : "Date not available";

    const d = document.createElement("div");
    d.className = "box";

    d.innerHTML = `
      <h3>${medal} ${safeText(studentName)}</h3>
      <p><strong>Best Exam:</strong> ${safeText(examTitle)}</p>
      <p><strong>Best Score:</strong> ${safeText(score)}/${safeText(total)} (${safeText(percentage)}%)</p>
      <p><strong>Submitted:</strong> ${safeText(submittedDate)}</p>
    `;

    list.appendChild(d);
  });
}

const studyAdviceBank = [
  "Study the hardest topic first while your energy is high.",
  "Use active recall: close the book and test yourself.",
  "Do not only read; solve questions under time.",
  "Keep a mistakes notebook and review it before exams.",
  "Revise vocabulary after 24 hours, then after one week.",
  "For grammar, always write your own examples.",
  "Before sleeping, review only the mistakes you made today.",
  "Use Pomodoro: 25 minutes focus + 5 minutes break."
];

function getRandomStudyAdvice() {
  return studyAdviceBank[Math.floor(Math.random() * studyAdviceBank.length)];
}

function renderRotatingAdvice() {
  const advice = getRandomStudyAdvice();
  if ($('rotatingAdviceBox')) {
    rotatingAdviceBox.innerHTML = `<div class="box"><h3>Advice for You</h3><p>${safeText(advice)}</p></div>`;
  }
  if ($('studentAdviceBox')) {
    studentAdviceBox.innerHTML = `<h2>Daily Study Advice</h2><p>${safeText(advice)}</p><button onclick="renderRotatingAdvice()">Change Advice</button>`;
  }
}

const dictionaryEntries = [
  { category: "grammar", word: "passive voice", meaning: "المبني للمجهول", example: "The room was cleaned yesterday." },
  { category: "grammar", word: "reported speech", meaning: "الكلام المنقول", example: "He said that he was tired." },
  { category: "grammar", word: "conditional", meaning: "الجملة الشرطية", example: "If you study, you will pass." },
  { category: "grammar", word: "relative clause", meaning: "جملة الوصل", example: "The boy who won is my friend." },
  { category: "grammar", word: "article", meaning: "أداة التعريف أو التنكير", example: "I saw a bird. The bird was blue." },
  { category: "vocabulary", word: "achieve", meaning: "يحقق", example: "Students can achieve their goals with practice." },
  { category: "vocabulary", word: "improve", meaning: "يحسّن", example: "You can improve your writing by reading." },
  { category: "vocabulary", word: "challenge", meaning: "تحدٍ", example: "Learning new words is a useful challenge." },
  { category: "vocabulary", word: "revise", meaning: "يراجع", example: "Revise your notes before the exam." },
  { category: "study", word: "active recall", meaning: "الاسترجاع النشط", example: "Test yourself without looking at the book." },
  { category: "study", word: "pomodoro", meaning: "نظام 25 دقيقة دراسة و5 راحة", example: "Use Pomodoro when you feel distracted." },
  { category: "study", word: "mistakes notebook", meaning: "دفتر الأخطاء", example: "Write grammar mistakes in your mistakes notebook." },
  { category: "irregular", word: "go / went / gone", meaning: "يذهب", example: "He has gone home." },
  { category: "irregular", word: "write / wrote / written", meaning: "يكتب", example: "She has written an essay." },
  { category: "irregular", word: "break / broke / broken", meaning: "يكسر", example: "The window was broken." },
  { category: "irregular", word: "speak / spoke / spoken", meaning: "يتحدث", example: "English is spoken here." }
];

function dictionaryCard(entry) {
  return `
    <div class="box dictionary-card">
      <span class="badge">${safeText(entry.category)}</span>
      <h3>${safeText(entry.word)}</h3>
      <p><b>Arabic:</b> ${safeText(entry.meaning)}</p>
      <p><b>Example:</b> ${safeText(entry.example)}</p>
    </div>
  `;
}

function renderDictionaryHome() {
  renderDictionaryCategory('grammar');
  if ($('dictionarySearch')) dictionarySearch.value = "";
  if ($('dictionaryResults')) dictionaryResults.innerHTML = "";
}

function renderDictionaryCategory(category) {
  if (!$('dictionaryCategory')) return;
  const items = dictionaryEntries.filter(e => e.category === category);
  dictionaryCategory.innerHTML = items.map(dictionaryCard).join("");
}

function searchDictionary() {
  if (!$('dictionarySearch') || !$('dictionaryResults')) return;
  const q = dictionarySearch.value.trim().toLowerCase();
  if (!q) {
    dictionaryResults.innerHTML = "";
    return;
  }
  const items = dictionaryEntries.filter(e =>
    e.word.toLowerCase().includes(q) ||
    e.meaning.toLowerCase().includes(q) ||
    e.category.toLowerCase().includes(q)
  );
  dictionaryResults.innerHTML = items.length ? items.map(dictionaryCard).join("") : "No results found.";
}

function mockAIQuestions() {
  const topic = aiTopic.value || "English";
  const count = Number(aiCount.value || 5);
  aiPreview.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    aiPreview.innerHTML += `<div class="box"><b>${i}.</b> Sample ${aiType.value} question about ${safeText(topic)}.</div>`;
  }
}

function insertMath(t) {
  mathEditor.value += (mathEditor.value ? " " : "") + t;
}

const syms = ["√", "π", "∞", "≤", "≥", "≠", "≈", "±", "×", "÷", "∑", "∆", "θ", "α", "β", "x²", "x³", "∫"];

window.addEventListener("DOMContentLoaded", async () => {
  displayQuestion();
  bootStableApp();
  loadUserName();

  if (typeof protectResourcesUploadPanel === "function") {
    protectResourcesUploadPanel();
  }

  // 🔥 dashboard
  if (window.location.hash === "#dashboard") {
    goDashboard();
  }
});

  // ✅ math tools
  const container = $("mathSymbols");

  if (container) {
    syms.forEach(s => {
      const b = document.createElement("button");
      b.textContent = s;
      b.onclick = () => insertMath(s);
      container.appendChild(b);
    });
  }

// =========================
// Advanced Study Planner + Colored Calendar
// =========================
function openPlanner() {
  showPage("planner");
  loadPlans();
  renderCalendar();
  updatePlannerStats();
  renderTodayTasks();

  if (typeof renderPlannerSystemContext === "function") {
    renderPlannerSystemContext();
  }

  if (typeof renderStudyMethodExplanation === "function") {
    renderStudyMethodExplanation();
  }

  if (typeof loadWeeklyStudyGoalInput === "function") {
    loadWeeklyStudyGoalInput();
  }

  if (typeof renderStudyAnalytics === "function") {
    renderStudyAnalytics();
  }
}

function getPlans() {
  return JSON.parse(localStorage.getItem("jakPlansV5")) || [];
}
function savePlans(plans) {
  localStorage.setItem("jakPlansV5", JSON.stringify(plans));
}

function getSubjectColor(subject, fallback) {
  const colors = {
    english: "#2563eb",
    grammar: "#7c3aed",
    vocabulary: "#16a34a",
    reading: "#f97316",
    writing: "#dc2626",
    math: "#22d3ee",
    arabic: "#fbbf24"
  };
  const key = safeText(subject).toLowerCase();
  return fallback || colors[key] || "#2563eb";
}

function addPlan() {
  const p = {
    id: Date.now().toString(),
    subject: subject.value.trim(),
    date: studyDate.value,
    start: startTime.value,
    end: endTime.value,
    type: planType.value,
    task: task.value.trim(),
    color: subjectColor?.value || getSubjectColor(subject.value),
    status: planStatus?.value || "not_started"
  };

  if (!p.subject || !p.date || !p.start || !p.end) {
    alert("Fill all fields");
    return;
  }

  const plans = getPlans();

  if (p.type === "daily") {
    for (let i = 0; i < 7; i++) {
      const d = new Date(p.date);
      d.setDate(d.getDate() + i);
      plans.push({ ...p, id: Date.now().toString() + "-" + i, date: d.toISOString().split("T")[0] });
    }
  } else {
    plans.push(p);
  }

  savePlans(plans);

  subject.value = "";
  studyDate.value = "";
  startTime.value = "";
  endTime.value = "";
  task.value = "";
  if ($("planStatus")) planStatus.value = "not_started";

  loadPlans();
  renderCalendar();
  updatePlannerStats();
  renderTodayTasks();
}

function statusLabel(status) {
  if (status === "done") return "Completed ✅";
  if (status === "in_progress") return "In Progress 🔄";
  return "Not Started ⏳";
}
function updatePlannerTaskStatus(taskId, newStatus) {
  const plans = getPlannerData();

  const updatedPlans = plans.map(plan => {
    if (plan.id !== taskId) return plan;

    return {
      ...plan,
      status: newStatus
    };
  });

  savePlannerData(updatedPlans);

  if (typeof renderCalendar === "function") {
    renderCalendar();
  }

  if (typeof renderTodayTasks === "function") {
    renderTodayTasks();
  }

  if (typeof updatePlannerStats === "function") {
    updatePlannerStats();
  }

  if (typeof renderStudyAnalytics === "function") {
    renderStudyAnalytics();
  }

  if (typeof renderStudySystemDashboard === "function") {
    renderStudySystemDashboard();
  }

  if (typeof renderStudySystemTimeline === "function") {
    renderStudySystemTimeline();
  }

  console.log("Planner task status updated:", taskId, newStatus);
}

function loadPlans() {
  if (!$("plansList")) return;

  const plans = getPlans().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  plansList.innerHTML = plans.length ? "" : "No plans yet";

  plans.forEach((p) => {
    const d = document.createElement("div");
    d.className = "box plan-card";
    d.style.borderLeft = `8px solid ${p.color || getSubjectColor(p.subject)}`;

    d.innerHTML = `
      <span class="badge">${safeText(p.type)}</span>
      <h3>${safeText(p.subject)}</h3>

      <p>📅 ${safeText(p.date)}</p>
      <p>⏰ ${safeText(p.start)} → ${safeText(p.end)}</p>
      <p>${safeText(p.task)}</p>

      <p>
        <b>Status:</b>
        ${
          p.status === "done"
            ? '<span class="badge published">✅ Completed</span>'
            : p.status === "in_progress"
              ? '<span class="badge draft">🔄 In Progress</span>'
              : '<span class="badge">🕒 Not Started</span>'
        }
      </p>

      <div class="actions">
        <button class="success" onclick="updatePlanStatusById('${p.id}', 'done')">✅ Mark Done</button>
        <button class="gold" onclick="updatePlanStatusById('${p.id}', 'in_progress')">🔄 In Progress</button>
        <button class="secondary" onclick="updatePlanStatusById('${p.id}', 'not_started')">🕒 Not Started</button>
        <button class="danger" onclick="deletePlanById('${p.id}')">Delete</button>
      </div>
    `;

    plansList.appendChild(d);
  });
}
function updatePlanStatusById(planId, newStatus) {
  const plans =
    typeof getPlannerData === "function"
      ? getPlannerData()
      : getPlans();

  const updatedPlans = plans.map(plan => {
    if (plan.id === planId) {
      return {
        ...plan,
        status: newStatus
      };
    }

    return plan;
  });

  if (typeof savePlannerData === "function") {
    savePlannerData(updatedPlans);
  } else {
    localStorage.setItem("jakPlansV5", JSON.stringify(updatedPlans));
  }

  if (typeof loadPlans === "function") loadPlans();
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof updatePlannerStats === "function") updatePlannerStats();
  if (typeof renderTodayTasks === "function") renderTodayTasks();

  if (typeof renderStudyAnalytics === "function") {
    renderStudyAnalytics();
  }

  if (typeof renderStudySystemDashboard === "function") {
    renderStudySystemDashboard();
  }

  if (typeof renderStudySystemTimeline === "function") {
    renderStudySystemTimeline();
  }

  console.log("Planner task status updated:", planId, newStatus);
}

function deletePlanById(planId) {
  if (!confirm("Delete this study plan?")) return;

  const plans = getPlans();
  const updatedPlans = plans.filter(plan => plan.id !== planId);

  localStorage.setItem("jakPlansV5", JSON.stringify(updatedPlans));

  loadPlans();
  renderCalendar();
  updatePlannerStats();
  renderTodayTasks();

  if (typeof renderStudyAnalytics === "function") {
    renderStudyAnalytics();
  }
}
function updatePlanStatus(index, status) {
  const plans = getPlans();

  if (!plans[index]) {
    alert("Plan not found.");
    return;
  }

  plans[index].status = status;

  savePlans(plans);

  loadPlans();
  renderCalendar();
  updatePlannerStats();
  renderTodayTasks();

  if (typeof renderStudyAnalytics === "function") {
    renderStudyAnalytics();
  }
}
function deletePlan(i) {
  const plans = getPlans();
  plans.splice(i, 1);
  savePlans(plans);
  loadPlans();
  renderCalendar();
  updatePlannerStats();
  renderTodayTasks();
}

function clearAllPlans() {
  if (confirm("Delete all plans?")) {
    localStorage.removeItem("jakPlansV5");
    loadPlans();
    renderCalendar();
    updatePlannerStats();
    renderTodayTasks();
  }
}

function updatePlannerStats() {
  const statsBox = $('plannerStats');
  if (!statsBox) return;

  const plans =
    typeof getPlannerTasksByCurrentSystem === "function"
      ? getPlannerTasksByCurrentSystem()
      : (typeof getPlannerData === "function" ? getPlannerData() : getPlans());

  const total = plans.length;

  const done = plans.filter(p => p.status === "done").length;
  const inProgress = plans.filter(p => p.status === "in_progress").length;
  const notStarted = plans.filter(p => p.status === "not_started").length;

  const progress = total ? Math.round((done / total) * 100) : 0;

  const currentSystem =
    typeof getCurrentStudySystem === "function"
      ? getCurrentStudySystem()
      : "all";

  const systemLabelMap = {
    all: "All Tasks",
    support_plan: "Support Plan",
    pomodoro: "Pomodoro",
    active_recall: "Active Recall",
    spaced_repetition: "Spaced Repetition",
    weekly: "Weekly Plan",
    weekly_plan: "Weekly Plan",
    before_exam: "Before Exam Plan",
    custom: "Custom Plan",
    manual: "Manual Plan",
    deep_work: "Deep Work",
    feynman: "Feynman Technique",
    cornell_notes: "Cornell Notes",
    sq3r: "SQ3R Reading Method",
    pq4r: "PQ4R Reading Method",
    leitner: "Leitner Flashcards",
mistake_notebook: "Mistake Notebook",
mind_map: "Mind Map",
interleaving: "Interleaving Practice"
};

  const systemLabel = systemLabelMap[currentSystem] || currentSystem;

  statsBox.innerHTML = `
    <div class="box">
      <h3>Current Study System</h3>
      <p>${systemLabel}</p>
    </div>

    <div class="box">
      <h3>Total Tasks</h3>
      <p>${total}</p>
    </div>

    <div class="box">
      <h3>Completed</h3>
      <p>${done}</p>
    </div>

    <div class="box">
      <h3>In Progress</h3>
      <p>${inProgress}</p>
    </div>

    <div class="box">
      <h3>Not Started</h3>
      <p>${notStarted}</p>
    </div>

    <div class="box">
      <h3>Progress</h3>
      <p>${progress}%</p>
      <div class="progress">
        <span style="width:${progress}%"></span>
      </div>
    </div>
  `;
}


function renderCalendar() {
  if (!$("calendarView")) return;

  const plans =
    typeof getPlannerTasksByCurrentSystem === "function"
      ? getPlannerTasksByCurrentSystem()
      : getPlannerData();

  const filter = $("subjectFilter")?.value.trim().toLowerCase() || "";

  const filtered = filter
    ? plans.filter(p => String(p.subject || "").toLowerCase().includes(filter))
    : plans;

  calendarView.innerHTML = filtered.length ? '<div class="calendar-grid"></div>' : "No plans yet";

  const grid = calendarView.querySelector(".calendar-grid");
  if (!grid) return;

  const grouped = {};

  filtered.forEach(p => {
    const date = p.date || "No date";
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(p);
  });

  Object.keys(grouped).sort().forEach(date => {
    const day = document.createElement("div");
    day.className = "calendar-day";
    day.innerHTML = "<b>📅 " + safeText(date) + "</b>";

    grouped[date]
      .sort((a, b) => {
        const aTime = a.startTime || a.start || "";
        const bTime = b.startTime || b.start || "";
        return String(aTime).localeCompare(String(bTime));
      })
      .forEach(p => {
        const start = p.startTime || p.start || "";
        const end = p.endTime || p.end || "";

        day.innerHTML += `
          <div class="mini-plan ${safeText(p.type || "manual")}" style="background:${p.color || getSubjectColor(p.subject)}">
            <b>${safeText(p.subject)}</b>
            <span class="badge">${safeText(p.system || p.source || "manual")}</span>
            <br>
            ${safeText(start || "No start time")} → ${safeText(end || "No end time")}<br>
            ${safeText(p.task)}<br>
            <small>${statusLabel(p.status)}</small>
          </div>
        `;
      });

    grid.appendChild(day);
  });
}

function renderTodayTasks() {
  const target = $("todayTasks") || $("studentTodayTasks");
  if (!target) return;

  const today = new Date().toISOString().split("T")[0];

  const plans =
    typeof getPlannerTasksByCurrentSystem === "function"
      ? getPlannerTasksByCurrentSystem()
      : getPlannerData();

  const tasks = plans
    .filter(p => p.date === today)
    .sort((a, b) => {
      const aTime = a.startTime || a.start || "";
      const bTime = b.startTime || b.start || "";
      return String(aTime).localeCompare(String(bTime));
    });

  target.innerHTML = tasks.length ? "" : "No tasks for today";

  tasks.forEach(p => {
    const div = document.createElement("div");
    div.className = "mini-plan";
    div.style.background = p.color || getSubjectColor(p.subject);

    const start = p.startTime || p.start || "";
    const end = p.endTime || p.end || "";

    div.innerHTML = `
      <b>${safeText(p.subject)}</b> 
      <span class="badge">${safeText(p.system || p.source || "manual")}</span>
      | ${safeText(start || "No start time")} → ${safeText(end || "No end time")}
      <br>
      ${safeText(p.task)}
      <br>
      <small>${statusLabel(p.status)}</small>

      <div class="planner-status-actions">
        <button type="button" onclick="updatePlannerTaskStatus('${p.id}', 'not_started')">Not Started ⏳</button>
        <button type="button" onclick="updatePlannerTaskStatus('${p.id}', 'in_progress')">In Progress 🟡</button>
        <button type="button" onclick="updatePlannerTaskStatus('${p.id}', 'done')">Done ✅</button>
      </div>
    `;

    target.appendChild(div);
  });
}


function printPlans() {
  openPlanner();
  window.print();
}

async function loadStudentDashboard() {
  // Keep old planner features working
  if (typeof renderTodayTasks === "function") renderTodayTasks();
  if (typeof updatePlannerStats === "function") updatePlannerStats();
  if (typeof renderRotatingAdvice === "function") renderRotatingAdvice();

  // Planner progress
  if ($("studentProgressBox")) {
    const plans = typeof getPlans === "function" ? getPlans() : [];
    const total = plans.length;
    const done = plans.filter(p => p.status === "done").length;
    const progress = total ? Math.round((done / total) * 100) : 0;

    studentProgressBox.innerHTML = `
      <h2>Study Progress</h2>
      <p>${progress}% completed</p>
      <div class="progress"><span style="width:${progress}%"></span></div>
    `;
  }

  // Real exam analytics from Supabase
  const statsBox =
    document.getElementById("studentExamStatsBox") ||
    document.getElementById("studentAnalyticsBox") ||
    document.getElementById("studentStatsBox");

  if (!statsBox) return;

  statsBox.innerHTML = "Loading exam statistics...";

  const { data: authData, error: authError } = await client.auth.getUser();

  if (authError || !authData?.user) {
    statsBox.innerHTML = "<p>Please log in to see your exam statistics.</p>";
    return;
  }

  const userEmail = authData.user.email;

 const { data: results, error } = await client
  .from("exam_results")
  .select("*, exams(title)")
  .eq("student_id", authData.user.id)
  .order("submitted_at", { ascending: false });
  if (error) {
    console.error("Student dashboard results error:", error);
    statsBox.innerHTML = "<p>Could not load exam statistics.</p>";
    return;
  }

  if (!results || results.length === 0) {
    statsBox.innerHTML = `
      <h2>Exam Analytics 📊</h2>
      <p>No exam results yet.</p>
    `;
    return;
  }

  const totalExams = results.length;

  const percentages = results.map(r => Number(r.percentage || 0));
  const average = Math.round(
    percentages.reduce((sum, value) => sum + value, 0) / totalExams
  );

  const bestResult = results.reduce((best, current) => {
    return Number(current.percentage || 0) > Number(best.percentage || 0)
      ? current
      : best;
  }, results[0]);

  const latestResult = results[0];

  let advice = "Keep practicing regularly and review your mistakes.";
  if (average >= 90) {
    advice = "Excellent work! Keep challenging yourself with harder exams.";
  } else if (average >= 75) {
    advice = "Very good progress. Focus on the questions you lost marks in.";
  } else if (average >= 50) {
    advice = "Good start. Review weak areas and repeat similar exercises.";
  } else {
    advice = "You need a focused revision plan. Start with easier exams and build step by step.";
  }

  statsBox.innerHTML = `
    <h2>Exam Analytics 📊</h2>

    <div class="box">
      <h3>Total Exams</h3>
      <p>${safeText(totalExams)}</p>
    </div>

    <div class="box">
      <h3>Average Score</h3>
      <p>${safeText(average)}%</p>
    </div>

    <div class="box">
      <h3>Best Result</h3>
      <p>${safeText(bestResult.exams?.title || bestResult.exam_title || "Exam")}</p>
      <p>${safeText(bestResult.score ?? 0)}/${safeText(bestResult.total ?? bestResult.total_questions ?? 0)} (${safeText(bestResult.percentage ?? 0)}%)</p>
    </div>

    <div class="box">
      <h3>Study Advice</h3>
      <p>${safeText(advice)}</p>
    </div>
  `;
}
// =========================
// Payment + Super Admin Settings
// =========================
function getPaymentSettings() {
  return JSON.parse(localStorage.getItem("jakPaymentSettings")) || {
    cliqName: "Jalal Abu Khadra",
    cliqPhone: "",
    studentMonthly: 5,
    studentYearly: 30,
    teacherMonthly: 10,
    teacherYearly: 70,
    instructions: "Send payment through CliQ, then submit your request.",
    active: true
  };
}

function savePaymentSettings(settings) {
  localStorage.setItem("jakPaymentSettings", JSON.stringify(settings));
}

function loadPaymentSettings() {
  const s = getPaymentSettings();
  if ($("cliqName")) cliqName.value = s.cliqName || "";
  if ($("cliqPhone")) cliqPhone.value = s.cliqPhone || "";
  if ($("studentMonthly")) studentMonthly.value = s.studentMonthly || 5;
  if ($("studentYearly")) studentYearly.value = s.studentYearly || 30;
  if ($("teacherMonthly")) teacherMonthly.value = s.teacherMonthly || 10;
  if ($("teacherYearly")) teacherYearly.value = s.teacherYearly || 70;
  if ($("paymentInstructions")) paymentInstructions.value = s.instructions || "";
  if ($("paymentActive")) paymentActive.checked = !!s.active;
  renderPaymentInfo();
}

function updatePaymentSettings() {
  const settings = {
    cliqName: cliqName.value.trim(),
    cliqPhone: cliqPhone.value.trim(),
    studentMonthly: Number(studentMonthly.value || 5),
    studentYearly: Number(studentYearly.value || 30),
    teacherMonthly: Number(teacherMonthly.value || 10),
    teacherYearly: Number(teacherYearly.value || 70),
    instructions: paymentInstructions.value.trim(),
    active: paymentActive.checked
  };
  savePaymentSettings(settings);
  if ($("paymentAdminMsg")) paymentAdminMsg.textContent = "Payment settings saved ✅";
  renderPaymentInfo();
}

function renderPaymentInfo() {
  const target = $("paymentInfo") || $("premiumPaymentInfo");
  if (!target) return;
  const s = getPaymentSettings();
  if (!s.active) {
    target.innerHTML = "<p>Payment is currently inactive.</p>";
    return;
  }
  target.innerHTML = `
    <div class="box payment-card">
      <h2>CliQ Payment</h2>
      <p><b>Name:</b> ${safeText(s.cliqName)}</p>
      <p><b>Phone/Alias:</b> ${safeText(s.cliqPhone) || "Not set yet"}</p>
      <p><b>Student:</b> ${s.studentMonthly} JOD monthly / ${s.studentYearly} JOD yearly</p>
      <p><b>Teacher:</b> ${s.teacherMonthly} JOD monthly / ${s.teacherYearly} JOD yearly</p>
      <p>${safeText(s.instructions)}</p>
    </div>
  `;
}

function getPremiumRequests() {
  return JSON.parse(localStorage.getItem("jakPremiumRequests")) || [];
}

function savePremiumRequests(reqs) {
  localStorage.setItem("jakPremiumRequests", JSON.stringify(reqs));
}

async function submitPremiumRequest() {
  const user = await getCurrentUser();
  const role = getRoleFromUser(user);
  const plan = $("premiumPlan")?.value || "student_monthly";
  const note = $("premiumNote")?.value.trim() || "";
  const reqs = getPremiumRequests();
  reqs.unshift({
    id: Date.now().toString(),
    email: user?.email || "guest",
    role,
    plan,
    note,
    status: "pending",
    created_at: new Date().toISOString()
  });
  savePremiumRequests(reqs);
  if ($("premiumMsg")) premiumMsg.textContent = "Premium request sent ✅";
  renderPremiumRequests();
}

function renderPremiumRequests() {
  if (!$('premiumRequestsList')) return;
  const reqs = getPremiumRequests();
  premiumRequestsList.innerHTML = reqs.length ? "" : "No premium requests yet";
  reqs.forEach((r, i) => {
    const div = document.createElement("div");
    div.className = "box";
    div.innerHTML = `
      <h3>${safeText(r.email)}</h3>
      <p><b>Role:</b> ${safeText(r.role)}</p>
      <p><b>Plan:</b> ${safeText(r.plan)}</p>
      <p><b>Status:</b> ${safeText(r.status)}</p>
      <p>${new Date(r.created_at).toLocaleString()}</p>
      <p>${safeText(r.note)}</p>
      <div class="actions">
        <button class="success" onclick="updatePremiumRequest(${i}, 'approved')">Approve</button>
        <button class="danger" onclick="updatePremiumRequest(${i}, 'rejected')">Reject</button>
      </div>
    `;
    premiumRequestsList.appendChild(div);
  });
}

function updatePremiumRequest(index, status) {
  const reqs = getPremiumRequests();
  if (!reqs[index]) return;
  reqs[index].status = status;
  savePremiumRequests(reqs);
  renderPremiumRequests();
}

function loadAdminOverview() {
  loadPaymentSettings();
  renderPremiumRequests();
  if ($("adminOverview")) {
    const requests = getPremiumRequests();
    adminOverview.innerHTML = `
      <div class="box"><h3>Premium Requests</h3><p>${requests.length}</p></div>
      <div class="box"><h3>Pending</h3><p>${requests.filter(r => r.status === "pending").length}</p></div>
      <div class="box"><h3>Approved</h3><p>${requests.filter(r => r.status === "approved").length}</p></div>
    `;
  }
}


// =========================
// JAK Academy Stable v5 Fix Pack
// =========================
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function bootStableApp() {
  try {
    renderPaymentInfo();
    renderTodayTasks();
    renderRotatingAdvice();
    renderDictionaryHome();
    renderGamesHome();

    const user = await getCurrentUser();

    if (user && window.location.hash === "#dashboard") {
      await goDashboard();
      return;
    }

    if (!user) {
      showPage("home");
      return;
    }

    showPage("home");

  } catch (err) {
    console.error("Boot error:", err);
    showPage("home");
  }
}

function renderGamesHome() {
  if (!$('gameArea')) return;
  gameArea.innerHTML = `<div class="box"><h3>Choose a game above.</h3><p>اختر لعبة من الأعلى للتدريب.</p></div>`;
}

const irregularGameBank = [
  { base: 'go', past: 'went', pp: 'gone', ar: 'يذهب' },
  { base: 'write', past: 'wrote', pp: 'written', ar: 'يكتب' },
  { base: 'speak', past: 'spoke', pp: 'spoken', ar: 'يتحدث' },
  { base: 'break', past: 'broke', pp: 'broken', ar: 'يكسر' },
  { base: 'see', past: 'saw', pp: 'seen', ar: 'يرى' },
  { base: 'take', past: 'took', pp: 'taken', ar: 'يأخذ' },
  { base: 'give', past: 'gave', pp: 'given', ar: 'يعطي' },
  { base: 'come', past: 'came', pp: 'come', ar: 'يأتي' },
  { base: 'eat', past: 'ate', pp: 'eaten', ar: 'يأكل' },
  { base: 'make', past: 'made', pp: 'made', ar: 'يصنع' }
];
let irregularState = { index: 0, score: 0, target: 'past' };

function startIrregularGame() {
  irregularState = { index: 0, score: 0, target: Math.random() > .5 ? 'past' : 'pp' };
  renderIrregularQuestion();
}

function renderIrregularQuestion() {
  if (!$('gameArea')) return;
  const q = irregularGameBank[irregularState.index % irregularGameBank.length];
  const targetLabel = irregularState.target === 'past' ? 'past simple' : 'past participle';
  const correct = q[irregularState.target];
  const all = [...new Set(irregularGameBank.flatMap(v => [v.past, v.pp]))].filter(x => x !== correct);
  const options = [correct, ...all.sort(() => Math.random() - .5).slice(0, 3)].sort(() => Math.random() - .5);
  gameArea.innerHTML = `
    <div class="box">
      <span class="badge">Irregular Verbs</span>
      <h2>What is the ${targetLabel} of: ${q.base}?</h2>
      <p>Arabic meaning: ${q.ar}</p>
      <p><b>Score:</b> ${irregularState.score}</p>
      <div class="actions">${options.map(o => `<button onclick="answerIrregular('${o.replace(/'/g, "\\'")}','${correct.replace(/'/g, "\\'")}')">${o}</button>`).join('')}</div>
    </div>`;
}

function answerIrregular(choice, correct) {
  if (choice === correct) irregularState.score++;
  else alert(`Wrong. Correct answer: ${correct}`);
  irregularState.index++;
  irregularState.target = Math.random() > .5 ? 'past' : 'pp';
  renderIrregularQuestion();
}

const hangmanWords = ['grammar','vocabulary','passive','reported','conditionals','article','revision','achievement'];
let hangmanState = { word: '', letters: [], wrong: 0 };
function startHangmanGame() {
  hangmanState = { word: hangmanWords[Math.floor(Math.random() * hangmanWords.length)], letters: [], wrong: 0 };
  renderHangman();
}
function renderHangman() {
  if (!$('gameArea')) return;
  const display = hangmanState.word.split('').map(ch => hangmanState.letters.includes(ch) ? ch : '_').join(' ');
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
  gameArea.innerHTML = `
    <div class="box">
      <span class="badge">Hangman</span>
      <h2>${display}</h2>
      <p>Wrong tries: ${hangmanState.wrong} / 6</p>
      <div class="actions">${alphabet.map(l => `<button class="secondary" onclick="guessHangman('${l}')" ${hangmanState.letters.includes(l) ? 'disabled' : ''}>${l}</button>`).join('')}</div>
    </div>`;
  if (!display.includes('_')) setTimeout(() => alert('Excellent! You guessed the word ✅'), 100);
  if (hangmanState.wrong >= 6) setTimeout(() => alert('Game over. Word: ' + hangmanState.word), 100);
}
function guessHangman(letter) {
  if (!hangmanState.letters.includes(letter)) hangmanState.letters.push(letter);
  if (!hangmanState.word.includes(letter)) hangmanState.wrong++;
  renderHangman();
}

function generateSmartPlan() {
  const subjects = (smartSubjects?.value || 'English, Grammar, Vocabulary').split(',').map(s => s.trim()).filter(Boolean);
  const days = Math.max(1, Math.min(30, Number(smartDays?.value || 7)));
  const start = smartStart?.value || '17:00';
  const minutes = Math.max(15, Number(smartMinutes?.value || 45));
  const plans = getPlans();
  const [h, m] = start.split(':').map(Number);
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const subjectName = subjects[i % subjects.length];
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const endDate = new Date(d);
    endDate.setHours(h, m + minutes, 0, 0);
    plans.push({
      id: 'smart-' + Date.now() + '-' + i,
      subject: subjectName,
      date: d.toISOString().split('T')[0],
      start,
      end: `${String(endDate.getHours()).padStart(2,'0')}:${String(endDate.getMinutes()).padStart(2,'0')}`,
      type: 'weekly',
      task: `Smart study session: revise ${subjectName}, solve questions, and write mistakes.`,
      color: getSubjectColor(subjectName),
      status: 'not_started'
    });
  }
  savePlans(plans);
  loadPlans(); renderCalendar(); updatePlannerStats(); renderTodayTasks();
  alert('Smart study plan generated ✅');
}


// ================= USER NAME =================
async function loadUserName() {
  const { data: { user } } = await client.auth.getUser();

  if (!user) return;

  const { data, error } = await client
    .from("profiles")
    .select("full_name")
    .eq("email", user.email)
    .single();

  if (error) {
    console.log("Error loading name:", error.message);
    return;
  }

  const el = document.getElementById("userName");
  if (el) {
    el.textContent = data?.full_name || "Student";
  }
}

// ================= START APP =================
function clearResultsViewOnly() {
  const status = document.getElementById("teacherResultsStatus");
  const list = document.getElementById("teacherResultsList");

  if (list) {
    list.innerHTML = "";
  }

  if (status) {
    status.textContent = "Results view cleared only. Database was not changed.";
  }
}
window.addEventListener("DOMContentLoaded", () => {
  displayQuestion();
  bootStableApp();
  loadUserName();
});
async function deleteExam(examId, examTitle) {
  const confirmText = prompt(
    `This will delete the exam:\n\n${examTitle}\n\nType DELETE to confirm:`
  );

  if (confirmText !== "DELETE") {
    alert("Delete cancelled.");
    return;
  }

  // Delete related questions first
  const questionsDelete = await client
    .from("questions")
    .delete()
    .eq("exam_id", examId);

  if (questionsDelete.error) {
    console.error("Delete questions error:", questionsDelete.error);
    alert("Could not delete exam questions.");
    return;
  }

  // Delete the exam itself
  const examDelete = await client
    .from("exams")
    .delete()
    .eq("id", examId);

  if (examDelete.error) {
    console.error("Delete exam error:", examDelete.error);
    alert("Could not delete exam.");
    return;
  }

  alert("Exam deleted successfully ✅");
  loadTeacherExams();
}

function clearTeacherExamFilter() {
  const input = document.getElementById("teacherExamGradeFilter");
  const status = document.getElementById("teacherExamFilterStatus");

  if (input) input.value = "";
  if (status) status.textContent = "Filter cleared.";

  loadTeacherExams();
}
function chooseTeacher(teacherName, subject) {
  localStorage.setItem("selectedTeacherName", teacherName);
  localStorage.setItem("selectedTeacherSubject", subject);

  alert("Selected teacher: " + teacherName + " / " + subject);

  showPage("studentExams");
  loadStudentExams();
}
function chooseTeacherById(teacherId, teacherName, subject) {
  localStorage.setItem("selectedTeacherId", teacherId);
  localStorage.setItem("selectedTeacherName", teacherName);
  localStorage.setItem("selectedTeacherSubject", subject);

  alert("Selected teacher: " + teacherName + " / " + subject);

  showPage("studentExams");
  loadStudentExams();
}
function clearSelectedTeacher() {
  localStorage.removeItem("selectedTeacherId");
  localStorage.removeItem("selectedTeacherName");
  localStorage.removeItem("selectedTeacherSubject");

  alert("Teacher filter cleared.");

  showPage("studentExams");
  loadStudentExams();
}
function renderSelectedTeacherInfo() {
  const box = document.getElementById("selectedTeacherInfo");
  if (!box) return;

  const teacherName = localStorage.getItem("selectedTeacherName");
  const subject = localStorage.getItem("selectedTeacherSubject");

  if (!teacherName) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }

  box.style.display = "block";
  box.innerHTML = `
    <div class="selected-teacher-row">
      <div>
        <strong>Showing exams for:</strong>
        <span class="badge published">${safeText(teacherName)} / ${safeText(subject || "Subject")}</span>
      </div>
      <button class="secondary" onclick="clearSelectedTeacher()">Show All Teachers</button>
    </div>
  `;
}

const studyMethods = {
  pomodoro: {
    title: "Pomodoro Technique",
    arTitle: "تقنية بومودورو",
    bestFor: "Students who lose focus quickly or feel overwhelmed by long study sessions.",
    arBestFor: "مناسبة للطلاب الذين يفقدون التركيز بسرعة أو يشعرون أن الدراسة الطويلة متعبة.",
    explanation:
      "Pomodoro is a study method based on short focused sessions followed by short breaks. The common structure is 25 minutes of study and 5 minutes of rest.",
    arExplanation:
      "البومودورو هي طريقة دراسة تعتمد على جلسات تركيز قصيرة تتبعها استراحات قصيرة. الشكل المشهور هو 25 دقيقة دراسة و5 دقائق راحة.",
    steps: [
      "Choose one clear task.",
      "Study for 25 minutes without distractions.",
      "Take a 5-minute break.",
      "Repeat 4 times.",
      "Take a longer break after 4 sessions."
    ],
    mistakes: [
      "Studying without a clear task.",
      "Using the phone during the session.",
      "Skipping breaks.",
      "Making sessions too long at the beginning."
    ],
    analytics: "Track Pomodoro sessions per day, total focus minutes, and completion rate."
  },

  spaced: {
    title: "Spaced Repetition",
    arTitle: "المراجعة المتباعدة",
    bestFor: "Vocabulary, grammar rules, formulas, definitions, and long-term memory.",
    arBestFor: "مناسبة للمفردات والقواعد والقوانين والتعاريف والحفظ طويل المدى.",
    explanation:
      "Spaced repetition means reviewing information several times with increasing time gaps. Instead of studying once, you review after 1 day, 3 days, 7 days, and so on.",
    arExplanation:
      "المراجعة المتباعدة تعني مراجعة المعلومة أكثر من مرة بفواصل زمنية متزايدة: بعد يوم، بعد 3 أيام، بعد أسبوع، وهكذا.",
    steps: [
      "Study the lesson today.",
      "Review it tomorrow.",
      "Review it again after 3 days.",
      "Review it after 7 days.",
      "Review it before the exam."
    ],
    mistakes: [
      "Reviewing only the night before the exam.",
      "Repeating easy topics and ignoring weak ones.",
      "Not writing mistakes down."
    ],
    analytics: "Track review dates, repeated topics, and memory improvement."
  },

  activeRecall: {
    title: "Active Recall",
    arTitle: "الاسترجاع النشط",
    bestFor: "Students who read a lot but forget quickly.",
    arBestFor: "مناسب للطلاب الذين يقرأون كثيرًا لكن ينسون بسرعة.",
    explanation:
      "Active recall means closing the book and trying to remember the answer by yourself. It is stronger than passive reading.",
    arExplanation:
      "الاسترجاع النشط يعني أن تغلق الكتاب وتحاول تذكر الإجابة بنفسك. هذه الطريقة أقوى من القراءة فقط.",
    steps: [
      "Study a small part.",
      "Close the book.",
      "Ask yourself questions.",
      "Write or say the answer.",
      "Check and correct."
    ],
    mistakes: [
      "Reading only without testing yourself.",
      "Checking the answer too quickly.",
      "Avoiding hard questions."
    ],
    analytics: "Track correct recall attempts, wrong answers, and weak topics."
  },

  timeBlocking: {
    title: "Time Blocking",
    arTitle: "تقسيم الوقت إلى بلوكات",
    bestFor: "Busy students who need clear organization.",
    arBestFor: "مناسب للطلاب المشغولين الذين يحتاجون تنظيمًا واضحًا.",
    explanation:
      "Time blocking means dividing your day into clear blocks. Each block has one subject or task.",
    arExplanation:
      "تقسيم الوقت يعني تقسيم اليوم إلى فترات واضحة، وكل فترة لها مادة أو مهمة محددة.",
    steps: [
      "Write your available hours.",
      "Choose the most important subjects.",
      "Assign each subject a time block.",
      "Add breaks.",
      "Review the schedule at night."
    ],
    mistakes: [
      "Filling the whole day without breaks.",
      "Ignoring prayer, meals, family, and rest.",
      "Making an unrealistic schedule."
    ],
    analytics: "Track planned time vs actual study time."
  },

  deepWork: {
    title: "Deep Work",
    arTitle: "الدراسة العميقة",
    bestFor: "Difficult topics, writing, problem solving, and exam preparation.",
    arBestFor: "مناسبة للمواد الصعبة والكتابة وحل المسائل والتحضير الجاد للامتحان.",
    explanation:
      "Deep Work is a long focus session without distractions. It is usually 60–90 minutes.",
    arExplanation:
      "الدراسة العميقة هي جلسة تركيز طويلة بدون مشتتات، غالبًا من 60 إلى 90 دقيقة.",
    steps: [
      "Choose one difficult task.",
      "Remove distractions.",
      "Study for 60–90 minutes.",
      "Take a real break.",
      "Write what you achieved."
    ],
    mistakes: [
      "Using the phone.",
      "Trying to study many subjects in one deep session.",
      "Starting with 90 minutes if you are not used to it."
    ],
    analytics: "Track deep work minutes and difficult tasks completed."
  },

  weeklyPlan: {
    title: "Weekly Study Plan",
    arTitle: "الخطة الأسبوعية",
    bestFor: "Students who want balanced study across subjects.",
    arBestFor: "مناسبة للطلاب الذين يريدون توزيع الدراسة على المواد بشكل متوازن.",
    explanation:
      "A weekly plan distributes subjects across the week so the student does not study randomly.",
    arExplanation:
      "الخطة الأسبوعية توزع المواد على أيام الأسبوع حتى لا يدرس الطالب بعشوائية.",
    steps: [
      "List your subjects.",
      "Choose weak subjects first.",
      "Distribute sessions across the week.",
      "Add one review day.",
      "Add one light day."
    ],
    mistakes: [
      "Putting all hard subjects on one day.",
      "Not reviewing at the end of the week.",
      "Making the plan too full."
    ],
    analytics: "Track weekly completion percentage and subject balance."
  },

  examCountdown: {
    title: "Before Exam Plan",
    arTitle: "خطة ما قبل الامتحان",
    bestFor: "Students who have an exam soon.",
    arBestFor: "مناسبة للطلاب الذين لديهم امتحان قريب.",
    explanation:
      "An exam countdown plan organizes revision based on the number of days left before the exam.",
    arExplanation:
      "خطة ما قبل الامتحان تنظم المراجعة حسب عدد الأيام المتبقية قبل الامتحان.",
    steps: [
      "Write the exam date.",
      "List all topics.",
      "Start with weak topics.",
      "Practice under time.",
      "Review mistakes before the exam."
    ],
    mistakes: [
      "Starting too late.",
      "Only reading without solving questions.",
      "Ignoring mistakes."
    ],
    analytics: "Track days left, topics completed, and exam readiness."
  },

  feynman: {
    title: "Feynman Technique",
    arTitle: "طريقة فاينمان",
    bestFor: "Understanding difficult lessons deeply.",
    arBestFor: "مناسبة لفهم الدروس الصعبة بعمق.",
    explanation:
      "The Feynman Technique means explaining the lesson in simple words as if you are teaching a younger student.",
    arExplanation:
      "طريقة فاينمان تعني أن تشرح الدرس بكلمات بسيطة كأنك تعلّمه لطالب أصغر منك.",
    steps: [
      "Choose a topic.",
      "Explain it simply.",
      "Find the parts you cannot explain.",
      "Restudy those parts.",
      "Explain again."
    ],
    mistakes: [
      "Using complicated words.",
      "Copying from the book.",
      "Not checking weak points."
    ],
    analytics: "Track topics explained and weak explanation areas."
  },

  cornell: {
    title: "Cornell Notes",
    arTitle: "ملاحظات كورنيل",
    bestFor: "Organizing lesson notes and summaries.",
    arBestFor: "مناسبة لتنظيم الملاحظات والتلخيص.",
    explanation:
      "Cornell Notes divide the page into notes, keywords/questions, and summary.",
    arExplanation:
      "طريقة كورنيل تقسم الصفحة إلى ملاحظات، كلمات/أسئلة، وملخص.",
    steps: [
      "Write notes during study.",
      "Add questions or keywords on the side.",
      "Write a short summary.",
      "Review using the questions.",
      "Test yourself."
    ],
    mistakes: [
      "Writing everything from the book.",
      "Not making questions.",
      "Skipping the summary."
    ],
    analytics: "Track completed summaries and review sessions."
  },

  leitner: {
    title: "Leitner Flashcards",
    arTitle: "بطاقات لايتنر",
    bestFor: "Vocabulary, formulas, grammar rules, and definitions.",
    arBestFor: "مناسبة للمفردات والقوانين والقواعد والتعاريف.",
    explanation:
      "Leitner is a flashcard system where easy cards move forward and difficult cards are reviewed more often.",
    arExplanation:
      "نظام لايتنر يستخدم بطاقات؛ البطاقة السهلة تنتقل للأمام، والصعبة تُراجع أكثر.",
    steps: [
      "Create flashcards.",
      "Test yourself.",
      "Move correct cards forward.",
      "Keep wrong cards in frequent review.",
      "Repeat regularly."
    ],
    mistakes: [
      "Making too many cards at once.",
      "Only reading cards without testing.",
      "Ignoring wrong cards."
    ],
    analytics: "Track mastered cards, difficult cards, and review frequency."
  },

  mistakeNotebook: {
    title: "Mistake Notebook",
    arTitle: "دفتر الأخطاء",
    bestFor: "Students who repeat the same mistakes.",
    arBestFor: "مناسب للطلاب الذين يكررون نفس الأخطاء.",
    explanation:
      "A mistake notebook is a place where students write repeated mistakes, corrections, and the reason for the mistake.",
    arExplanation:
      "دفتر الأخطاء هو مكان يكتب فيه الطالب أخطاءه المتكررة، التصحيح، وسبب الخطأ.",
    steps: [
      "Write the wrong answer.",
      "Write the correct answer.",
      "Write why the mistake happened.",
      "Review before exams.",
      "Turn mistakes into practice questions."
    ],
    mistakes: [
      "Writing mistakes without corrections.",
      "Not reviewing the notebook.",
      "Blaming luck instead of finding the reason."
    ],
    analytics: "Track repeated mistakes and improvement over time."
  },

  mindMap: {
    title: "Mind Map Study",
    arTitle: "الدراسة بالخرائط الذهنية",
    bestFor: "Visual learners and big units with many ideas.",
    arBestFor: "مناسبة للطلاب البصريين والوحدات الكبيرة كثيرة الأفكار.",
    explanation:
      "Mind maps organize ideas visually using branches, keywords, and connections.",
    arExplanation:
      "الخرائط الذهنية تنظم الأفكار بصريًا باستخدام الفروع والكلمات المفتاحية والروابط.",
    steps: [
      "Write the main topic in the center.",
      "Add main branches.",
      "Add keywords only.",
      "Use colors or symbols.",
      "Review by explaining the map."
    ],
    mistakes: [
      "Writing long paragraphs.",
      "Making the map messy.",
      "Using too many colors without meaning."
    ],
    analytics: "Track maps created and topics reviewed."
  }
};

function renderStudyMethodExplanation() {
  const select = document.getElementById("studyMethodSelect");
  const box = document.getElementById("studyMethodExplanation");

  if (!select || !box) return;

  const method = studyMethods[select.value];

  if (!method) {
    box.innerHTML = "";
    return;
  }

  box.innerHTML = `
    <div class="box study-method-card">
      <span class="badge">${safeText(method.title)}</span>
      <h2>${safeText(method.title)} / ${safeText(method.arTitle)}</h2>

      <h3>What is it? / ما هو؟</h3>
      <p>${safeText(method.explanation)}</p>
      <p>${safeText(method.arExplanation)}</p>

      <h3>Best for / مناسب لـ</h3>
      <p>${safeText(method.bestFor)}</p>
      <p>${safeText(method.arBestFor)}</p>

      <h3>Steps / الخطوات</h3>
      <ul>
        ${method.steps.map(step => `<li>${safeText(step)}</li>`).join("")}
      </ul>

      <h3>Mistakes to avoid / أخطاء يجب تجنبها</h3>
      <ul>
        ${method.mistakes.map(item => `<li>${safeText(item)}</li>`).join("")}
      </ul>

      <h3>Analytics / الإحصائيات</h3>
      <p>${safeText(method.analytics)}</p>
    </div>
  `;
}

function addMinutesToTime(time, minutesToAdd) {
  const [h, m] = String(time || "17:00").split(":").map(Number);
  const date = new Date();
  date.setHours(h || 17, m || 0, 0, 0);
  date.setMinutes(date.getMinutes() + Number(minutesToAdd || 0));

  return date.toTimeString().slice(0, 5);
}
function normalizeStudySystemKey(methodKey) {
  const map = {
    pomodoro: "pomodoro",
    spaced: "spaced_repetition",
    spaced_repetition: "spaced_repetition",
    activeRecall: "active_recall",
    active_recall: "active_recall",
    timeBlocking: "time_blocking",
    deepWork: "deep_work",
    weeklyPlan: "weekly_plan",
    weekly_plan: "weekly_plan",
    examCountdown: "before_exam",
    before_exam: "before_exam",
    feynman: "feynman",
    cornell: "cornell_notes",
    leitner: "leitner",
    mistakeNotebook: "mistake_notebook",
    mistake_notebook: "mistake_notebook",
    mindMap: "mind_map",
    manual: "manual"
  };

  return map[methodKey] || methodKey || "manual";
}
function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}

function addDaysToDateString(dateString, daysToAdd) {
  const date = dateString ? new Date(dateString) : new Date();
  date.setDate(date.getDate() + daysToAdd);
  return date.toISOString().split("T")[0];
}

function getStudyTaskDate(index, methodKey, examDate) {
  const today = getTodayDateString();

  if (methodKey === "spaced") {
    const spacedOffsets = [0, 1, 3, 7, 10];
    return addDaysToDateString(today, spacedOffsets[index] || index);
  }

  if (methodKey === "examCountdown" && examDate) {
    const exam = new Date(examDate);
    const taskDate = new Date(exam);
    const daysBefore = Math.max(1, 4 - index);
    taskDate.setDate(exam.getDate() - daysBefore);
    return taskDate.toISOString().split("T")[0];
  }

  return addDaysToDateString(today, index);
}

function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDateString() {
  return formatLocalDate(new Date());
}

function addDaysToDateString(dateString, daysToAdd) {
  const date = dateString ? new Date(dateString + "T00:00:00") : new Date();
  date.setDate(date.getDate() + daysToAdd);
  return formatLocalDate(date);
}

function getStudyTaskDate(index, methodKey, examDate) {
  const today = getTodayDateString();

  if (methodKey === "spaced") {
    const spacedOffsets = [0, 1, 3, 7, 10];
    return addDaysToDateString(today, spacedOffsets[index] || index);
  }

  if (methodKey === "examCountdown" && examDate) {
    const exam = new Date(examDate);

    if (!isNaN(exam.getTime())) {
      const taskDate = new Date(exam);
      const daysBefore = Math.max(1, 4 - index);
      taskDate.setDate(exam.getDate() - daysBefore);
      return taskDate.toISOString().split("T")[0];
    }
  }

  return addDaysToDateString(today, index);
}

function getStudyTaskStartTime(start, index, sessionMinutes, breakMinutes, methodKey) {
  if (methodKey === "pomodoro") {
    return index === 0
      ? start
      : addMinutesToTime(start, index * (sessionMinutes + breakMinutes));
  }

  return start;
}

function generateStudySystemSchedule() {
  const methodSelect = document.getElementById("studyMethodSelect");
  const subjectInput = document.getElementById("studySystemSubject");
  const daysInput = document.getElementById("studySystemDays");
  const startInput = document.getElementById("studySystemStart");
  const sessionInput = document.getElementById("studySystemSession");
  const breakInput = document.getElementById("studySystemBreak");
  const sessionsInput = document.getElementById("studySystemSessions");
  const examDateInput = document.getElementById("studySystemExamDate");
  const output = document.getElementById("studySystemSchedule");

  if (!methodSelect || !output) return;

  const methodKey = methodSelect.value;
  const selectedSystem =
    typeof normalizeStudySystemKey === "function"
      ? normalizeStudySystemKey(methodKey)
      : methodKey;

  const method = studyMethods[methodKey];

  const subject = subjectInput?.value.trim() || "Study Subject";
  const daysText = daysInput?.value.trim() || "Sunday, Monday, Tuesday";
  const start = startInput?.value || "17:00";
  const sessionMinutes = Number(sessionInput?.value || 25);
  const breakMinutes = Number(breakInput?.value || 5);
  const sessions = Number(sessionsInput?.value || 4);
  const examDate = examDateInput?.value || "";

  const days = daysText
    .split(",")
    .map(day => day.trim())
    .filter(Boolean);

  let scheduleHtml = "";
  let generatedTasks = [];

  if (methodKey === "pomodoro") {
    let currentTime = start;

    for (let i = 1; i <= sessions; i++) {
      const studyEnd = addMinutesToTime(currentTime, sessionMinutes);
      const breakEnd = addMinutesToTime(studyEnd, breakMinutes);
      const taskDate = getStudyTaskDate(i - 1, methodKey, examDate);

      scheduleHtml += `
        <div class="mini-plan">
          <strong>Pomodoro Session ${i}</strong><br>
          Date: ${safeText(taskDate)}<br>
          ${safeText(currentTime)} - ${safeText(studyEnd)}: ${safeText(subject)} Focus Study<br>
          ${safeText(studyEnd)} - ${safeText(breakEnd)}: Short Break
        </div>
      `;

      currentTime = breakEnd;
    }
  }

  else if (methodKey === "spaced") {
    const reviewSteps = [
      "Today: First learning session",
      "After 1 day: Quick review",
      "After 3 days: Practice questions",
      "After 7 days: Full review",
      "Before exam: Final revision"
    ];

    scheduleHtml = reviewSteps.map((step, index) => {
      const taskDate = getStudyTaskDate(index, methodKey, examDate);

      return `
        <div class="mini-plan">
          <strong>Review ${index + 1}</strong><br>
          Date: ${safeText(taskDate)}<br>
          ${safeText(step)}<br>
          Topic: ${safeText(subject)}
        </div>
      `;
    }).join("");
  }

  else if (methodKey === "activeRecall") {
    for (let i = 1; i <= sessions; i++) {
      const taskDate = getStudyTaskDate(i - 1, methodKey, examDate);

      scheduleHtml += `
        <div class="mini-plan">
          <strong>Active Recall Round ${i}</strong><br>
          Date: ${safeText(taskDate)}<br>
          Study ${safeText(subject)} briefly, close the book, then answer questions from memory.<br>
          Suggested time: ${safeText(sessionMinutes)} minutes.
        </div>
      `;
    }
  }

  else if (methodKey === "timeBlocking") {
    let currentTime = start;
    const blocks = days.length ? days : ["Day 1", "Day 2", "Day 3"];

    blocks.forEach((day, index) => {
      const end = addMinutesToTime(currentTime, sessionMinutes);
      const taskDate = getStudyTaskDate(index, methodKey, examDate);

      scheduleHtml += `
        <div class="mini-plan">
          <strong>${safeText(day)} - Block ${index + 1}</strong><br>
          Date: ${safeText(taskDate)}<br>
          ${safeText(currentTime)} - ${safeText(end)}: ${safeText(subject)}<br>
          One clear task only. No multitasking.
        </div>
      `;

      currentTime = addMinutesToTime(end, breakMinutes);
    });
  }

  else if (methodKey === "deepWork") {
    const deepMinutes = Math.max(sessionMinutes, 60);
    const end = addMinutesToTime(start, deepMinutes);
    const taskDate = getStudyTaskDate(0, methodKey, examDate);

    scheduleHtml = `
      <div class="mini-plan">
        <strong>Deep Work Block</strong><br>
        Date: ${safeText(taskDate)}<br>
        ${safeText(start)} - ${safeText(end)}: Deep focus on ${safeText(subject)}<br>
        Rule: phone away, one task, no distractions.
      </div>

      <div class="mini-plan">
        <strong>Reflection</strong><br>
        After the session, write what you finished and what was difficult.
      </div>
    `;
  }

  else if (methodKey === "weeklyPlan") {
    const weeklyDays = days.length
      ? days
      : ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday"];

    scheduleHtml = weeklyDays.map((day, index) => {
      const taskDate = getStudyTaskDate(index, methodKey, examDate);

      return `
        <div class="mini-plan">
          <strong>${safeText(day)}</strong><br>
          Date: ${safeText(taskDate)}<br>
          ${safeText(subject)} - Session ${index + 1}<br>
          Focus: lesson review + practice questions.
        </div>
      `;
    }).join("");
  }

  else if (methodKey === "examCountdown") {
    scheduleHtml = `
      <div class="mini-plan exam">
        <strong>Exam Countdown Plan</strong><br>
        Exam Date: ${safeText(examDate || "Not selected")}<br>
        Step 1: List weak topics.<br>
        Step 2: Study the most important topic first.<br>
        Step 3: Solve timed questions.<br>
        Step 4: Review your mistakes before the exam.
      </div>
    `;
  }

  else if (methodKey === "feynman") {
    scheduleHtml = `
      <div class="mini-plan">
        <strong>Feynman Step 1</strong><br>
        Date: ${safeText(getStudyTaskDate(0, methodKey, examDate))}<br>
        Choose ${safeText(subject)} and explain it in very simple words.
      </div>

      <div class="mini-plan">
        <strong>Feynman Step 2</strong><br>
        Date: ${safeText(getStudyTaskDate(1, methodKey, examDate))}<br>
        Find the part you cannot explain clearly.
      </div>

      <div class="mini-plan">
        <strong>Feynman Step 3</strong><br>
        Date: ${safeText(getStudyTaskDate(2, methodKey, examDate))}<br>
        Restudy that weak part, then explain it again.
      </div>
    `;
  }

  else if (methodKey === "cornell") {
    scheduleHtml = `
      <div class="mini-plan">
        <strong>Cornell Notes Layout</strong><br>
        Date: ${safeText(getStudyTaskDate(0, methodKey, examDate))}<br>
        Notes area: write key ideas from ${safeText(subject)}.<br>
        Side area: write questions and keywords.<br>
        Bottom area: write a short summary.
      </div>
    `;
  }

  else if (methodKey === "leitner") {
    scheduleHtml = `
      <div class="mini-plan">
        <strong>Leitner Flashcards</strong><br>
        Date: ${safeText(getStudyTaskDate(0, methodKey, examDate))}<br>
        Create cards for ${safeText(subject)}.<br>
        Correct cards move forward. Wrong cards stay for daily review.
      </div>

      <div class="mini-plan">
        <strong>Review System</strong><br>
        Date: ${safeText(getStudyTaskDate(1, methodKey, examDate))}<br>
        Box 1: daily review<br>
        Box 2: every 2–3 days<br>
        Box 3: weekly review
      </div>
    `;
  }

  else if (methodKey === "mistakeNotebook") {
    scheduleHtml = `
      <div class="mini-plan">
        <strong>Mistake Notebook</strong><br>
        Date: ${safeText(getStudyTaskDate(0, methodKey, examDate))}<br>
        Write your wrong answer, the correct answer, and why the mistake happened.
      </div>

      <div class="mini-plan">
        <strong>Weekly Review</strong><br>
        Date: ${safeText(getStudyTaskDate(1, methodKey, examDate))}<br>
        Review all repeated mistakes before solving new questions.
      </div>
    `;
  }

  else if (methodKey === "mindMap") {
    scheduleHtml = `
      <div class="mini-plan">
        <strong>Mind Map Plan</strong><br>
        Date: ${safeText(getStudyTaskDate(0, methodKey, examDate))}<br>
        Put ${safeText(subject)} in the center.<br>
        Add branches for rules, examples, keywords, and common mistakes.
      </div>
    `;
  }

  else {
    scheduleHtml = `
      <div class="mini-plan">
        <strong>${safeText(method?.title || "Study Plan")}</strong><br>
        Date: ${safeText(getStudyTaskDate(0, methodKey, examDate))}<br>
        Days: ${safeText(daysText)}<br>
        Start: ${safeText(start)}<br>
        Subject: ${safeText(subject)}<br>
        Suggested: ${safeText(sessions)} focused sessions with realistic breaks.
      </div>
    `;
  }

  output.innerHTML = `
    <div class="box generated-study-plan">
      <span class="badge">Generated Study Schedule</span>
      <h2>${safeText(method?.title || "Study System")}</h2>
      <p><strong>Subject:</strong> ${safeText(subject)}</p>
      <p><strong>Available Days:</strong> ${safeText(daysText)}</p>
      ${scheduleHtml}
      <p class="msg">Tip: Start with a realistic plan. A small plan you follow is better than a perfect plan you ignore.</p>
    </div>
  `;

  const existingPlans =
    typeof getPlannerData === "function"
      ? getPlannerData()
      : JSON.parse(localStorage.getItem("jakPlansV5") || "[]");

  const now = Date.now();

  if (methodKey === "pomodoro") {
    generatedTasks = Array.from({ length: sessions }, (_, index) => {
      const taskStart = getStudyTaskStartTime(start, index, sessionMinutes, breakMinutes, methodKey);
      const taskEnd = addMinutesToTime(taskStart, sessionMinutes);

      return {
        id: `study-${selectedSystem}-${now}-${index}`,
        task: `${subject} - Pomodoro Session ${index + 1}`,
        subject,
        date: getStudyTaskDate(index, methodKey, examDate),
        startTime: taskStart,
        endTime: taskEnd,
        start: taskStart,
        end: taskEnd,
        type: "study_system",
        status: "not_started",
        source: "study_system",
        system: selectedSystem,
        method: methodKey,
        minutes: sessionMinutes,
        breakMinutes,
        createdAt: new Date().toISOString()
      };
    });
  }

  else if (methodKey === "spaced") {
    const reviewSteps = [
      "Today: First learning session",
      "After 1 day: Quick review",
      "After 3 days: Practice questions",
      "After 7 days: Full review",
      "Before exam: Final revision"
    ];

    generatedTasks = reviewSteps.map((step, index) => {
      const taskStart = getStudyTaskStartTime(start, index, sessionMinutes, breakMinutes, methodKey);
      const taskEnd = addMinutesToTime(taskStart, sessionMinutes);

      return {
        id: `study-${selectedSystem}-${now}-${index}`,
        task: `${subject} - ${step}`,
        subject,
        date: getStudyTaskDate(index, methodKey, examDate),
        startTime: taskStart,
        endTime: taskEnd,
        start: taskStart,
        end: taskEnd,
        type: "study_system",
        status: "not_started",
        source: "study_system",
        system: selectedSystem,
        method: methodKey,
        minutes: sessionMinutes,
        breakMinutes,
        createdAt: new Date().toISOString()
      };
    });
  }

  else {
    generatedTasks = Array.from({ length: Math.max(1, sessions) }, (_, index) => {
      const taskStart = getStudyTaskStartTime(start, index, sessionMinutes, breakMinutes, methodKey);
      const taskEnd = addMinutesToTime(taskStart, sessionMinutes);

      return {
        id: `study-${selectedSystem}-${now}-${index}`,
        task: `${subject} - ${method?.title || selectedSystem} Task ${index + 1}`,
        subject,
        date: getStudyTaskDate(index, methodKey, examDate),
        startTime: taskStart,
        endTime: taskEnd,
        start: taskStart,
        end: taskEnd,
        type: "study_system",
        status: "not_started",
        source: "study_system",
        system: selectedSystem,
        method: methodKey,
        minutes: sessionMinutes,
        breakMinutes,
        createdAt: new Date().toISOString()
      };
    });
  }

  const duplicateExists = existingPlans.some(p =>
    p.source === "study_system" &&
    p.system === selectedSystem &&
    p.method === methodKey &&
    String(p.subject || "").toLowerCase() === String(subject || "").toLowerCase()
  );

  let finalPlans = [];

  if (duplicateExists) {
    const replace = confirm(
      "This study system plan already exists. Do you want to replace the old tasks?"
    );

    if (!replace) {
      console.log("Duplicate study system plan skipped.");
      return;
    }

    const cleanedPlans = existingPlans.filter(p =>
      !(
        p.source === "study_system" &&
        p.system === selectedSystem &&
        p.method === methodKey &&
        String(p.subject || "").toLowerCase() === String(subject || "").toLowerCase()
      )
    );

    finalPlans = [...cleanedPlans, ...generatedTasks];
  } else {
    finalPlans = [...existingPlans, ...generatedTasks];
  }

  if (typeof savePlannerData === "function") {
    savePlannerData(finalPlans);
  } else {
    localStorage.setItem("jakPlansV5", JSON.stringify(finalPlans));
  }

  if (typeof setCurrentStudySystem === "function") {
    setCurrentStudySystem(selectedSystem);
  }

  if (typeof loadPlans === "function") loadPlans();
  if (typeof updatePlannerStats === "function") updatePlannerStats();
  if (typeof renderTodayTasks === "function") renderTodayTasks();
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof renderStudyAnalytics === "function") renderStudyAnalytics();
  if (typeof renderStudySystemTimeline === "function") renderStudySystemTimeline();
  console.log("Generated study system tasks:", generatedTasks);
  renderStudyMethodExplanation();
}

function getPlannerData() {
  try {
    return JSON.parse(localStorage.getItem("jakPlansV5")) || [];
  } catch (error) {
    console.error("Planner data parse error:", error);
    return [];
  }
}

function timeToMinutes(time) {
  if (!time || !String(time).includes(":")) return 0;

  const [hours, minutes] = String(time).split(":").map(Number);
  return (hours * 60) + minutes;
}

function calculatePlanMinutes(plan) {
  const start = timeToMinutes(plan.start);
  const end = timeToMinutes(plan.end);

  if (!start || !end || end <= start) return 0;

  return end - start;
}

function renderMiniBar(label, value, maxValue, color) {
  const percent = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;

  return `
    <div class="analytics-bar-row">
      <div class="analytics-bar-label">
        <strong>${safeText(label)}</strong>
        <span>${safeText(value)}</span>
      </div>
      <div class="analytics-bar-track">
        <div class="analytics-bar-fill" style="width:${percent}%; background:${safeText(color || "#22d3ee")}"></div>
      </div>
    </div>
  `;
}



function renderAnalyticsBar(label, value, maxValue, color) {
  const percent = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;

  return `
    <div class="analytics-row">
      <div class="analytics-row-top">
        <strong>${safeText(label)}</strong>
        <span>${safeText(value)}</span>
      </div>
      <div class="analytics-progress">
        <div class="analytics-progress-fill" style="width:${percent}%; background:${safeText(color)}"></div>
      </div>
    </div>
  `;
}

function renderAnalyticsBar(label, value, maxValue, color) {
  const percent = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;

  return `
    <div class="analytics-row">
      <div class="analytics-row-top">
        <strong>${safeText(label)}</strong>
        <span>${safeText(value)}</span>
      </div>
      <div class="analytics-progress">
        <div class="analytics-progress-fill" style="width:${percent}%; background:${safeText(color)}"></div>
      </div>
    </div>
  `;
}
function getPlannerData() {
  let plans = [];

  try {
    plans = JSON.parse(localStorage.getItem("jakPlansV5") || "[]");
  } catch (error) {
    console.error("Planner data parse error:", error);
    plans = [];
  }

  return plans.map((plan, index) => {
    const normalizedStatus =
      plan.status === "not-started" ? "not_started" :
      plan.status === "in-progress" ? "in_progress" :
      plan.status === "completed" ? "done" :
      plan.status || "not_started";

    const normalizedSource =
      plan.source ||
      plan.system ||
      (plan.support_plan_id ? "support_plan" : "manual");

    const normalizedSystem =
      plan.system ||
      normalizedSource ||
      "manual";

    return {
      ...plan,

      // Keep old IDs if they exist; only create one if missing
      id: plan.id || `plan-${Date.now()}-${index}`,

      // Normalize status so analytics works correctly
      status: normalizedStatus,

      // Future Planner metadata
      source: normalizedSource,
      system: normalizedSystem,

      // Safe defaults
      subject: plan.subject || (
        normalizedSource === "support_plan" ? "Support Plan" : "Study"
      ),
      type: plan.type || (
        normalizedSource === "support_plan" ? "Support Plan" : "Manual"
      ),
      task: plan.task || plan.title || "Study task",
      date: plan.date || new Date().toISOString().split("T")[0],
      start: plan.start || "16:00",
      end: plan.end || "16:30",
      color: plan.color || (
        normalizedSource === "support_plan" ? "#3b82f6" :
        normalizedSource === "pomodoro" ? "#f59e0b" :
        normalizedSource === "active_recall" ? "#8b5cf6" :
        "#22c55e"
      )
    };
  });
}
function savePlannerData(plans) {
  localStorage.setItem("jakPlansV5", JSON.stringify(plans || []));
}

function timeToMinutes(time) {
  if (!time || !String(time).includes(":")) return 0;

  const [hours, minutes] = String(time).split(":").map(Number);
  return (hours * 60) + minutes;
}

function calculatePlanMinutes(plan) {
  const start = timeToMinutes(plan.start);
  const end = timeToMinutes(plan.end);

  if (!start || !end || end <= start) return 0;

  return end - start;
}

function renderAnalyticsBar(label, value, maxValue, color) {
  const percent = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;

  return `
    <div class="analytics-row">
      <div class="analytics-row-top">
        <strong>${safeText(label)}</strong>
        <span>${safeText(value)}</span>
      </div>
      <div class="analytics-progress">
        <div class="analytics-progress-fill" style="width:${percent}%; background:${safeText(color)}"></div>
      </div>
    </div>
  `;
}

function renderStudyAnalytics() {
const plans =
  typeof getPlannerTasksByCurrentSystem === "function"
    ? getPlannerTasksByCurrentSystem()
    : getPlannerData();
  const cardsBox = document.getElementById("studyAnalyticsCards");
  const subjectChart = document.getElementById("subjectDistributionChart");
  const dailyChart = document.getElementById("dailyStudyChart");
  const statusChart = document.getElementById("taskStatusChart");
  const recommendationsBox = document.getElementById("studyRecommendations");

  if (!cardsBox || !subjectChart || !dailyChart || !statusChart) {
    console.warn("Study analytics containers not found.");
    return;
  }

  if (!plans.length) {
    cardsBox.innerHTML = `
      <div class="box">
        <h2>No Study Data Yet</h2>
        <p>Add study plans first to see analytics.</p>
      </div>
    `;
    subjectChart.innerHTML = "";
    dailyChart.innerHTML = "";
    statusChart.innerHTML = "";
    if (recommendationsBox) recommendationsBox.innerHTML = "";
    return;
  }

  const totalPlans = plans.length;
  const completedPlans = plans.filter(p => p.status === "done").length;
  const inProgressPlans = plans.filter(p => p.status === "in_progress").length;
  const notStartedPlans = plans.filter(p => p.status === "not_started").length;

  const totalMinutes = plans.reduce((sum, plan) => {
    return sum + calculatePlanMinutes(plan);
  }, 0);

  const completionRate = totalPlans > 0
    ? Math.round((completedPlans / totalPlans) * 100)
    : 0;

  const subjects = {};
  const dailyMinutes = {};

  plans.forEach(plan => {
    const subject = plan.subject || "Unknown";
    const date = plan.date || "No date";
    const minutes = calculatePlanMinutes(plan);

    subjects[subject] = (subjects[subject] || 0) + minutes;
    dailyMinutes[date] = (dailyMinutes[date] || 0) + minutes;
  });

  const uniqueSubjects = Object.keys(subjects).length;
const sortedDaily = Object.entries(dailyMinutes)
  .sort(([a], [b]) => String(a).localeCompare(String(b)));

const bestStudyDayEntry = Object.entries(dailyMinutes)
  .sort((a, b) => b[1] - a[1])[0];

const bestStudyDay = bestStudyDayEntry ? bestStudyDayEntry[0] : "No data";
const bestStudyMinutes = bestStudyDayEntry ? bestStudyDayEntry[1] : 0;

const sortedSubjectsByMinutes = Object.entries(subjects)
  .sort((a, b) => b[1] - a[1]);

const mostProductiveSubject = sortedSubjectsByMinutes[0]?.[0] || "No subject";

const studyDates = [...new Set(
  plans
    .filter(plan => calculatePlanMinutes(plan) > 0)
    .map(plan => plan.date)
)].sort();

let studyStreak = 0;

if (studyDates.length > 0) {
  studyStreak = 1;

  for (let i = studyDates.length - 1; i > 0; i--) {
    const current = new Date(studyDates[i]);
    const previous = new Date(studyDates[i - 1]);
    const diffDays = Math.round((current - previous) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      studyStreak++;
    } else {
      break;
    }
  }
}

const weeklyGoalMinutes = getWeeklyStudyGoal();
const weeklyGoalRate = Math.min(Math.round((totalMinutes / weeklyGoalMinutes) * 100), 100);

const currentSystem =
  typeof getCurrentStudySystem === "function"
    ? getCurrentStudySystem()
    : "all";

const analyticsSystemLabelMap = {
  all: "All Study Systems",
  support_plan: "Support Plan",
  pomodoro: "Pomodoro",
  active_recall: "Active Recall",
  spaced_repetition: "Spaced Repetition",
  time_blocking: "Time Blocking",
  deep_work: "Deep Work",
  weekly_plan: "Weekly Plan",
  before_exam: "Before Exam Plan",
  feynman: "Feynman Technique",
  cornell_notes: "Cornell Notes",
  leitner: "Leitner Flashcards",
  mistake_notebook: "Mistake Notebook",
  mind_map: "Mind Map",
  manual: "Manual Plan"
};

const analyticsSystemLabel =
  analyticsSystemLabelMap[currentSystem] || currentSystem;

cardsBox.innerHTML = `
    <div class="box analytics-card-box">
      <h2>Current Analytics</h2>
      <p>${safeText(analyticsSystemLabel)}</p>
      <span>Data shown for the selected study system</span>
    </div>
    <div class="box analytics-card-box">
      <h2>Total Plans</h2>
      <p>${safeText(totalPlans)}</p>
<span>Tasks in this study system</span>    </div>
    <div class="box analytics-card-box">
      <h2>Study Streak</h2>
      <p>${safeText(studyStreak)} days</p>
      <span>Consecutive planned study days</span>
    </div>

    <div class="box analytics-card-box">
      <h2>Best Study Day</h2>
      <p>${safeText(bestStudyMinutes)} min</p>
      <span>${safeText(bestStudyDay)}</span>
    </div>

    <div class="box analytics-card-box">
      <h2>Top Subject</h2>
      <p>${safeText(mostProductiveSubject)}</p>
      <span>Most studied subject</span>
    </div>

    <div class="box analytics-card-box">
      <h2>Weekly Goal</h2>
      <p>${safeText(weeklyGoalRate)}%</p>
      <span>${safeText(totalMinutes)} / ${safeText(weeklyGoalMinutes)} min</span>
    </div>
    <div class="box analytics-card-box">
      <h2>Completed Tasks</h2>
      <p>${safeText(completedPlans)}</p>
      <span>Finished study tasks</span>
    </div>

    <div class="box analytics-card-box">
      <h2>Completion Rate</h2>
      <p>${safeText(completionRate)}%</p>
      <span>Task completion percentage</span>
    </div>

    <div class="box analytics-card-box">
      <h2>Total Study Time</h2>
      <p>${safeText(totalMinutes)} min</p>
      <span>${safeText(Math.round((totalMinutes / 60) * 10) / 10)} hours</span>
    </div>

    <div class="box analytics-card-box">
      <h2>Subjects</h2>
      <p>${safeText(uniqueSubjects)}</p>
      <span>Different subjects studied</span>
    </div>

    <div class="box analytics-card-box">
      <h2>In Progress</h2>
      <p>${safeText(inProgressPlans)}</p>
      <span>Tasks currently active</span>
    </div>
  `;

  const maxSubjectMinutes = Math.max(...Object.values(subjects), 1);

  subjectChart.innerHTML = Object.entries(subjects)
    .map(([subject, minutes]) => {
      const color = plans.find(p => p.subject === subject)?.color || "#22d3ee";
      return renderAnalyticsBar(`${subject} (${minutes} min)`, minutes, maxSubjectMinutes, color);
    })
    .join("");

  const maxDailyMinutes = Math.max(...Object.values(dailyMinutes), 1);

  dailyChart.innerHTML = Object.entries(dailyMinutes)
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([date, minutes]) => {
      return renderAnalyticsBar(`${date} (${minutes} min)`, minutes, maxDailyMinutes, "#fbbf24");
    })
    .join("");

  const statusCounts = {
    Completed: completedPlans,
    "In Progress": inProgressPlans,
    "Not Started": notStartedPlans
  };

  const maxStatus = Math.max(...Object.values(statusCounts), 1);

  statusChart.innerHTML = `
    ${renderAnalyticsBar("Completed", completedPlans, maxStatus, "#16a34a")}
    ${renderAnalyticsBar("In Progress", inProgressPlans, maxStatus, "#fbbf24")}
    ${renderAnalyticsBar("Not Started", notStartedPlans, maxStatus, "#f97316")}
  `;

  if (recommendationsBox) {
    const sortedSubjects = Object.entries(subjects).sort((a, b) => b[1] - a[1]);
    const mostStudied = sortedSubjects[0]?.[0] || "No subject";
    const leastStudied = sortedSubjects[sortedSubjects.length - 1]?.[0] || "No subject";

    let recommendation = "";

   if (weeklyGoalRate >= 100 && completionRate < 50) {
  recommendation =
    "Great! You reached your weekly study-time goal, but your task completion rate is still low. Focus on finishing tasks, not adding more study time.";
} else if (weeklyGoalRate < 50) {
  recommendation =
    "Your study time is still below the weekly goal. Try adding short focused sessions this week. Even 25 minutes a day can make a big difference.";
} else if (completionRate === 0) {
  recommendation =
    "Your study time is planned, but no tasks are completed yet. Start by completing one easy task today to build momentum.";
} else if (completionRate < 50) {
  recommendation =
    "Your completion rate is still low. Reduce the number of tasks and focus on finishing fewer tasks well.";
} else if (completionRate < 80) {
  recommendation =
    "Good progress. Try to increase consistency by completing one task every day.";
} else {
  recommendation =
    "Excellent progress. You are studying consistently. Move to advanced practice and timed exams.";
}
    recommendationsBox.innerHTML = `
      <div class="recommendation-card">
        <h3>Most Studied Subject</h3>
        <p>${safeText(mostStudied)} is your most studied subject so far.</p>
      </div>

      <div class="recommendation-card">
        <h3>Least Studied Subject</h3>
        <p>${safeText(leastStudied)} needs more attention in your next plan.</p>
      </div>

      <div class="recommendation-card">
        <h3>Smart Advice</h3>
        <p>${safeText(recommendation)}</p>
      </div>

      <div class="recommendation-card">
        <h3>Suggested Next Step</h3>
        <p>Complete at least one task today, then refresh your analytics to see your progress change.</p>
      </div>
    `;
  }
}
function getWeeklyStudyGoal() {
  const savedGoal = Number(localStorage.getItem("jakWeeklyStudyGoal") || 300);
  return savedGoal > 0 ? savedGoal : 300;
}

function saveWeeklyStudyGoal() {
  const input = document.getElementById("weeklyGoalInput");
  const msg = document.getElementById("weeklyGoalMsg");

  const goal = Number(input?.value || 300);

  if (!goal || goal < 30) {
    if (msg) msg.textContent = "Please enter a realistic goal. Minimum: 30 minutes.";
    return;
  }

  localStorage.setItem("jakWeeklyStudyGoal", String(goal));

  if (msg) msg.textContent = "Weekly study goal saved ✅";

  if (typeof renderStudyAnalytics === "function") {
    renderStudyAnalytics();
  }
}

function loadWeeklyStudyGoalInput() {
  const input = document.getElementById("weeklyGoalInput");
  if (input) input.value = getWeeklyStudyGoal();
}

window.goDashboard = goDashboard;
window.logout = logout;
window.showPage = showPage;
window.openPlanner = openPlanner;
window.mockAIQuestions = mockAIQuestions;
window.insertMath = insertMath;
window.submitPremiumRequest = submitPremiumRequest;
window.generateSmartPlan = generateSmartPlan;
window.addPlan = addPlan;
window.printPlans = printPlans;
window.clearAllPlans = clearAllPlans;
window.loadLeaderboard = loadLeaderboard;
window.loadStudentDashboard = loadStudentDashboard;
window.loadTeacherResults = loadTeacherResults;
window.clearResultsViewOnly = clearResultsViewOnly;
window.openExamFromShareLink = openExamFromShareLink;
window.openExamByCode = openExamByCode;
window.editExam = editExam;
window.clearTeacherExamFilter = clearTeacherExamFilter;
window.clearStudentExamFilter = clearStudentExamFilter;
window.toggleExamStatus = toggleExamStatus;
window.toggleReviewLater = toggleReviewLater;
window.previousQuestion = previousQuestion;
window.nextQuestion = nextQuestion;
window.submitExam = submitExam;
window.chooseTeacher = chooseTeacher; 
window.chooseTeacherById = chooseTeacherById;
window.clearSelectedTeacher = clearSelectedTeacher;
window.renderSelectedTeacherInfo = renderSelectedTeacherInfo;
window.renderStudyMethodExplanation = renderStudyMethodExplanation;
window.generateStudySystemSchedule = generateStudySystemSchedule;
window.renderStudyAnalytics = renderStudyAnalytics;
window.getWeeklyStudyGoal = getWeeklyStudyGoal;
window.saveWeeklyStudyGoal = saveWeeklyStudyGoal;
window.loadWeeklyStudyGoalInput = loadWeeklyStudyGoalInput;
if (typeof deleteExam === "function") {
  window.deleteExam = deleteExam;
  console.log("✅ deleteExam connected to window");
} else {
  console.error("❌ deleteExam function was not found");
} 
if (typeof deleteQuestion === "function") {
  window.deleteQuestion = deleteQuestion;
  console.log("✅ deleteQuestion connected to window");
} else {
  console.error("❌ deleteQuestion function was not found");
}
if (typeof editQuestion === "function") {
  window.editQuestion = editQuestion;
  console.log("✅ editQuestion connected to window");
} else {
  console.error("❌ editQuestion function was not found");
}
// =========================
// Users Management - Super Admin
// =========================
async function loadUsers() {
  const status = $("usersStatus");
  const table = $("usersTable");

  if (status) status.textContent = "Loading users...";
  if (table) table.innerHTML = "";

  if (!table) {
    console.warn("usersTable element not found in index.html");
    if (status) status.textContent = "Users table not found.";
    return;
  }

  const { data, error } = await client
    .from("profiles")
    .select("email, role, full_name, premium_until")
    .order("email", { ascending: true });

  if (error) {
    console.error("Load users error:", error);
    if (status) status.textContent = "Error loading users: " + error.message;
    return;
  }

  const users = data || [];

  if (status) status.textContent = "Users loaded: " + users.length;

  if (!users.length) {
    table.innerHTML = `
      <tr>
        <td colspan="4">No users found.</td>
      </tr>
    `;
    return;
  }

  users.forEach(user => {
    const premiumText = user.premium_until
      ? new Date(user.premium_until).toLocaleDateString()
      : "Free";

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${safeText(user.email)}</td>
      <td>${safeText(user.role || "student")}</td>
      <td>${safeText(premiumText)}</td>
      <td>
        <button onclick="setUserRole('${safeText(user.email)}', 'teacher')">Make Teacher</button>
        <button onclick="setUserRole('${safeText(user.email)}', 'student')">Make Student</button>
        <button onclick="makeUserPremium('${safeText(user.email)}')">Make Premium</button>
        <button class="danger" onclick="removeUserProfile('${safeText(user.email)}')">Remove Profile</button>
      </td>
    `;

    table.appendChild(row);
  });
}

async function setUserRole(email, newRole) {
  if (!email || !newRole) return;

  const ok = confirm("Change role for " + email + " to " + newRole + "?");
  if (!ok) return;

  const { error } = await client
    .from("profiles")
    .update({ role: newRole })
    .eq("email", email);

  if (error) {
    console.error("Set role error:", error);
    alert("Error changing role: " + error.message);
    return;
  }

  alert("Role updated ✅");
  loadUsers();
}

async function makeUserPremium(email) {
  if (!email) return;

  const ok = confirm("Make " + email + " premium for 30 days?");
  if (!ok) return;

  const premiumDate = new Date();
  premiumDate.setDate(premiumDate.getDate() + 30);

  const { error } = await client
    .from("profiles")
    .update({ premium_until: premiumDate.toISOString() })
    .eq("email", email);

  if (error) {
    console.error("Premium error:", error);
    alert("Error making premium: " + error.message);
    return;
  }

  alert("Premium activated for 30 days ✅");
  loadUsers();
}

async function removeUserProfile(email) {
  if (!email) return;

  const ok = confirm(
    "Remove profile row only for " + email + "?\n\nThis will NOT delete the Supabase Auth user."
  );

  if (!ok) return;

  const { error } = await client
    .from("profiles")
    .delete()
    .eq("email", email);

  if (error) {
    console.error("Remove profile error:", error);
    alert("Error removing profile: " + error.message);
    return;
  }

  alert("Profile row removed only ✅");
  loadUsers();
}
if (typeof loadUsers === "function") window.loadUsers = loadUsers;
if (typeof setUserRole === "function") window.setUserRole = setUserRole;
if (typeof makeUserPremium === "function") window.makeUserPremium = makeUserPremium;
if (typeof removeUserProfile === "function") window.removeUserProfile = removeUserProfile;
async function openExamFromShareLink() {
  const params = new URLSearchParams(window.location.search);
  const examId = params.get("exam");

  if (!examId) return;

  console.log("Shared exam detected:", examId);

  // 1) Load exam
  const { data: exam, error } = await client
    .from("exams")
    .select("*")
    .eq("id", examId)
    .single();

  if (error || !exam) {
    console.error("Shared exam loading error:", error);
    alert("Could not open this exam link.");
    return;
  }

  // 2) Check exam status
  if (exam.status !== "published") {
    alert("This exam is not available yet. Please contact your teacher.");
    return;
  }

  // 3) Check real questions count
  const { data: questions, error: questionsError } = await client
    .from("questions")
    .select("id")
    .eq("exam_id", exam.id)
    .limit(1);

  if (questionsError) {
    console.error("Shared exam questions check error:", questionsError);
    alert("Could not check exam readiness.");
    return;
  }

  if (!questions || questions.length === 0) {
    alert("This exam is not ready yet. Please contact your teacher.");
    return;
  }

  // 4) Open preview only if exam is ready
  previewExam(
    exam.id,
    exam.title,
    exam.description,
    exam.time_limit
  );
}
async function openExamByCode() {
  const input = document.getElementById("examCodeInput");
  const msg = document.getElementById("examCodeMsg");

  const examId = input?.value.trim();

  if (!examId) {
    if (msg) msg.textContent = "Please enter an exam code.";
    return;
  }

  if (msg) msg.textContent = "Checking exam...";

  // 1) Load exam
  const { data: exam, error } = await client
    .from("exams")
    .select("*")
    .eq("id", examId)
    .single();

  if (error || !exam) {
    console.error("Open exam by code error:", error);
    if (msg) msg.textContent = "Invalid exam code or exam not found.";
    return;
  }

  // 2) Check exam status
  if (exam.status !== "published") {
    if (msg) msg.textContent = "This exam is not available yet. Please contact your teacher.";
    return;
  }

  // 3) Check real questions count
  const { data: questions, error: questionsError } = await client
    .from("questions")
    .select("id")
    .eq("exam_id", exam.id)
    .limit(1);

  if (questionsError) {
    console.error("Check exam questions error:", questionsError);
    if (msg) msg.textContent = "Could not check exam readiness.";
    return;
  }

  if (!questions || questions.length === 0) {
    if (msg) msg.textContent = "This exam is not ready yet. Please contact your teacher.";
    return;
  }

  // 4) Open preview only if exam is ready
  if (msg) msg.textContent = "Exam found ✅";

  previewExam(
    exam.id,
    exam.title,
    exam.description,
    exam.time_limit
  );
}
window.addEventListener("DOMContentLoaded", async () => {
  displayQuestion();
  bootStableApp();
  loadUserName();
  await openExamFromShareLink();
  if (window.location.hash === "#dashboard") {
    goDashboard();
  }

  const container = $("mathSymbols");

  if (container) {
    syms.forEach(s => {
      const b = document.createElement("button");
      b.textContent = s;
      b.onclick = () => insertMath(s);
      container.appendChild(b);
    });
  }
});
// ===============================
// Student Dashboard Binding Fix
// ===============================
if (typeof loadStudentDashboard === "function") {
  window.loadStudentDashboard = loadStudentDashboard;
  console.log("✅ loadStudentDashboard connected to window");
} else {
  console.error("❌ loadStudentDashboard function was not found");
}
// ===============================
// Final Safe Window Bindings
// ===============================
if (typeof showPage === "function") window.showPage = showPage;
if (typeof goDashboard === "function") window.goDashboard = goDashboard;
if (typeof logout === "function") window.logout = logout;

if (typeof loadLeaderboard === "function") window.loadLeaderboard = loadLeaderboard;
if (typeof loadStudentDashboard === "function") window.loadStudentDashboard = loadStudentDashboard;

if (typeof loadUsers === "function") window.loadUsers = loadUsers;
if (typeof setUserRole === "function") window.setUserRole = setUserRole;
if (typeof makeUserPremium === "function") window.makeUserPremium = makeUserPremium;
if (typeof removeUserProfile === "function") window.removeUserProfile = removeUserProfile;

console.log("✅ Final window bindings loaded");
console.log("✅ APP.JS FINISHED");
function updateExamAnswerStats() {
  const box = document.getElementById("examAnswerStats");
  if (!box) return;

  if (!Array.isArray(solvingQuestions) || solvingQuestions.length === 0) {
    box.innerHTML = "";
    return;
  }

  const total = solvingQuestions.length;

  const answered = solvingQuestions.filter(q => {
    return (
      studentAnswers &&
      studentAnswers[q.id] !== undefined &&
      studentAnswers[q.id] !== null &&
      studentAnswers[q.id] !== ""
    );
  }).length;

  const unanswered = total - answered;

  const reviewCount = Object.values(reviewLater || {}).filter(Boolean).length;

  box.innerHTML = `
    <div class="exam-stats-grid">
      <span>✅ Answered: <strong>${answered}</strong></span>
      <span>⚠️ Unanswered: <strong>${unanswered}</strong></span>
      <span>⭐ Review Later: <strong>${reviewCount}</strong></span>
    </div>
  `;
}

// Auto-update exam stats safely while exam page is open
setInterval(() => {
    const examSolver = document.getElementById("examSolver");

  if (!examSolver) return;

  const isActive =
    examSolver.classList.contains("active") ||
    window.getComputedStyle(examSolver).display !== "none";

  if (isActive) {
    updateExamAnswerStats();
  }
}, 800);
window.updateExamAnswerStats = updateExamAnswerStats;

function addMinutesToClock(time, minutesToAdd) {
  const [hours, minutes] = String(time || "17:00").split(":").map(Number);
  const date = new Date();
  date.setHours(hours || 17, minutes || 0, 0, 0);
  date.setMinutes(date.getMinutes() + minutesToAdd);

  return date.toTimeString().slice(0, 5);
}

function getTomorrowDateString() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split("T")[0];
}

function addRecommendedTaskToPlanner(type) {
  const plans = getPlans();

  const examTitle =
    currentPreviewExam?.title ||
    currentPreviewExam?.description ||
    "Exam Review";

  let recommendation = {
    subject: examTitle,
    type: "exam",
    task: "Review this exam and practise similar questions.",
    minutes: 30,
    color: "#2563eb"
  };

  if (type === "foundation") {
    recommendation = {
      subject: examTitle,
      type: "exam",
      task: "Foundation review: revise the basic rules of this exam topic and solve 10 easy practice questions.",
      minutes: 45,
      color: "#ef4444"
    };
  }

  if (type === "practice") {
    recommendation = {
      subject: examTitle,
      type: "exam",
      task: "Mistake correction: review your wrong answers, write them in a mistake notebook, then solve a short timed practice exam.",
      minutes: 30,
      color: "#f59e0b"
    };
  }
if (type === "no_answer") {
  recommendation = {
    subject: examTitle,
    type: "exam",
    task: "Timed answering practice: solve a short exam and make sure you answer every question before time ends.",
    minutes: 30,
    color: "#f59e0b"
  };
}

if (type === "wrong_answers") {
  recommendation = {
    subject: examTitle,
    type: "exam",
    task: "Mistake correction: review your wrong questions, write them in a mistake notebook, and solve 10 similar questions.",
    minutes: 45,
    color: "#ef4444"
  };
}
  if (type === "advanced") {
    recommendation = {
      subject: examTitle,
      type: "exam",
      task: "Advanced practice: solve harder exam-style questions and create one question of your own.",
      minutes: 30,
      color: "#22c55e"
    };
  }

  const start = "17:00";
  const end = addMinutesToClock(start, recommendation.minutes);

  const newPlan = {
    id: "exam-rec-" + Date.now(),
    subject: recommendation.subject,
    date: getTomorrowDateString(),
    start,
    end,
    type: recommendation.type,
    task: recommendation.task,
    color: recommendation.color,
    status: "not_started"
  };

  plans.push(newPlan);
  savePlans(plans);

  if (typeof loadPlans === "function") loadPlans();
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof updatePlannerStats === "function") updatePlannerStats();
  if (typeof renderTodayTasks === "function") renderTodayTasks();
  if (typeof renderStudyAnalytics === "function") renderStudyAnalytics();

const goToPlanner = confirm(
  "Recommended task added to your Planner ✅\n\nDo you want to open Planner now?"
);

if (goToPlanner && typeof openPlanner === "function") {
  openPlanner();
}
}

window.addRecommendedTaskToPlanner = addRecommendedTaskToPlanner;

function cleanFileName(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9.\-_]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

async function uploadTeacherResource() {
  const titleEl = document.getElementById("resourceTitle");
  const descEl = document.getElementById("resourceDesc");
  const subjectEl = document.getElementById("resourceSubject");
  const gradeEl = document.getElementById("resourceGrade");
  const unitEl = document.getElementById("resourceUnit");
  const fileEl = document.getElementById("resourceFile");
  const premiumEl = document.getElementById("resourcePremium");
  const msg = document.getElementById("resourceUploadMsg");

  if (msg) msg.textContent = "Preparing upload...";

  const title = titleEl?.value.trim();
  const description = descEl?.value.trim() || "";
  const subject = subjectEl?.value.trim() || "";
  const grade = gradeEl?.value.trim() || "";
  const unit = unitEl?.value.trim() || "";
  const file = fileEl?.files?.[0];

  if (!title || !file) {
    alert("Please add a title and choose a file.");
    if (msg) msg.textContent = "Title and file are required.";
    return;
  }

  try {
    const { data: userData } = await client.auth.getUser();
    const teacherId = userData?.user?.id || null;

    const safeName = cleanFileName(file.name);
const filePath = `${user.id}/${Date.now()}-${safeName}`;
    if (msg) msg.textContent = "Uploading file...";

    const { error: uploadError } = await client.storage
      .from("resources")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) {
      console.error("Resource upload error:", uploadError);
      if (msg) msg.textContent = "Upload failed: " + uploadError.message;
      alert("Upload failed: " + uploadError.message);
      return;
    }

    const { data: publicUrlData } = client.storage
      .from("resources")
      .getPublicUrl(filePath);

    const fileUrl = publicUrlData?.publicUrl;

    if (!fileUrl) {
      if (msg) msg.textContent = "Could not create public file URL.";
      alert("Could not create public file URL.");
      return;
    }

    if (msg) msg.textContent = "Saving resource record...";

    const { error: insertError } = await client
      .from("resources")
      .insert([
        {
          teacher_id: teacherId,
          title,
          description,
          file_url: fileUrl,
          file_path: filePath,
          file_type: file.type || file.name.split(".").pop() || "",
          subject,
          grade,
          unit,
          is_premium: !!premiumEl?.checked,
          is_visible: true
        }
      ]);

    if (insertError) {
      console.error("Resource insert error:", insertError);
      if (msg) msg.textContent = "File uploaded, but database save failed: " + insertError.message;
      alert("File uploaded, but database save failed: " + insertError.message);
      return;
    }

    if (msg) msg.textContent = "Resource uploaded successfully ✅";

    if (titleEl) titleEl.value = "";
    if (descEl) descEl.value = "";
    if (subjectEl) subjectEl.value = "";
    if (gradeEl) gradeEl.value = "";
    if (unitEl) unitEl.value = "";
    if (fileEl) fileEl.value = "";
    if (premiumEl) premiumEl.checked = false;

    await loadTeacherResources();
  } catch (err) {
    console.error("Unexpected upload error:", err);
    if (msg) msg.textContent = "Unexpected error while uploading.";
    alert("Unexpected error while uploading.");
  }
}
async function toggleResourcePremium(resourceId, currentStatus) {
  const newStatus = !currentStatus;

  const { error } = await client
    .from("resources")
    .update({ is_premium: newStatus })
    .eq("id", resourceId);

  if (error) {
    console.error("Toggle premium error:", error);
    alert("Could not update resource premium status.");
    return;
  }

  alert(newStatus ? "Resource is now Premium 💎" : "Resource is now Free 🔓");

  await loadTeacherResources();

  if (typeof loadStudentResources === "function") {
    await loadStudentResources();
  }
}

async function loadTeacherResources() {
  const list = document.getElementById("teacherResourcesList");
  const msg = document.getElementById("resourceUploadMsg");

  if (!list) return;

  list.innerHTML = "Loading resources...";
  if (msg) msg.textContent = "Loading resources...";

  const { data, error } = await client
    .from("resources")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load resources error:", error);
    list.innerHTML = "<p>Could not load resources.</p>";
    if (msg) msg.textContent = "Could not load resources.";
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = "<p>No resources uploaded yet.</p>";
    if (msg) msg.textContent = "No resources uploaded yet.";
    return;
  }

  list.innerHTML = "";

  data.forEach(resource => {
    const d = document.createElement("div");
    d.className = "box resource-card";

    d.innerHTML = `
      <span class="badge">${resource.is_premium ? "💎 Premium" : "Free"}</span>
      <span class="badge">${resource.is_visible ? "👁️ Visible" : "🙈 Hidden"}</span>

      <h3>${safeText(resource.title)}</h3>
      <p>${safeText(resource.description || "No description")}</p>
      <p><strong>Subject:</strong> ${safeText(resource.subject || "Not specified")}</p>
      <p><strong>Grade:</strong> ${safeText(resource.grade || "Not specified")}</p>
      <p><strong>Unit:</strong> ${safeText(resource.unit || "Not specified")}</p>
      <p><strong>Type:</strong> ${safeText(resource.file_type || "file")}</p>

      <div class="actions">
        <a href="${resource.file_url}" target="_blank" rel="noopener">
          <button type="button">Open / Download</button>
        </a>

        <button 
          type="button" 
          class="secondary" 
          onclick="toggleResourcePremium('${resource.id}', ${resource.is_premium === true})"
        >
          ${resource.is_premium ? "Make Free 🔓" : "Make Premium 💎"}
        </button>

        <button 
          type="button" 
          class="secondary" 
          onclick="toggleResourceVisibility('${resource.id}', ${resource.is_visible === true})"
        >
          ${resource.is_visible ? "Hide 🙈" : "Show 👁️"}
        </button>

        <button 
          type="button" 
          class="danger" 
          onclick="deleteTeacherResource('${resource.id}', '${resource.file_path}', '${safeText(resource.title || "this resource")}')"
        >
          Delete 🗑️
        </button>
      </div>
    `;

    list.appendChild(d);
  });

  if (msg) msg.textContent = "Resources loaded: " + data.length;
}
async function deleteTeacherResource(resourceId, filePath, title) {
  const confirmDelete = confirm(
    `Are you sure you want to delete "${title}"?\n\nThis will permanently delete the file and remove it from resources.`
  );

  if (!confirmDelete) return;

  const msg = document.getElementById("resourceUploadMsg");
  if (msg) msg.textContent = "Deleting resource...";

  if (filePath) {
    const { error: storageError } = await client.storage
      .from("resources")
      .remove([filePath]);

    if (storageError) {
      console.error("Storage delete error:", storageError);
      alert("Could not delete the file from storage.");
      if (msg) msg.textContent = "Could not delete file from storage.";
      return;
    }
  }

  const { error: dbError } = await client
    .from("resources")
    .delete()
    .eq("id", resourceId);

  if (dbError) {
    console.error("Database delete error:", dbError);
    alert("File was removed from storage, but the database record could not be deleted.");
    if (msg) msg.textContent = "Database delete failed.";
    return;
  }

  alert("Resource deleted successfully ✅");

  if (msg) msg.textContent = "Resource deleted successfully.";

  await loadTeacherResources();

  if (typeof loadStudentResources === "function") {
    await loadStudentResources();
  }
}
async function toggleResourceVisibility(resourceId, currentStatus) {
  const newStatus = !currentStatus;

  const { error } = await client
    .from("resources")
    .update({ is_visible: newStatus })
    .eq("id", resourceId);

  if (error) {
    console.error("Toggle visibility error:", error);
    alert("Could not update resource visibility.");
    return;
  }

  alert(newStatus ? "Resource is now visible 👁️" : "Resource is now hidden 🙈");

  if (typeof loadTeacherResources === "function") {
    await loadTeacherResources();
  }

  if (typeof loadStudentResources === "function") {
    await loadStudentResources();
  }
}

async function loadStudentResources() {
  const list = document.getElementById("studentResourcesList");
  const msg = document.getElementById("studentResourcesMsg");

  const subjectFilter = document
    .getElementById("studentResourceSubjectFilter")
    ?.value.trim()
    .toLowerCase();

  const gradeFilter = document
    .getElementById("studentResourceGradeFilter")
    ?.value.trim()
    .toLowerCase();

  const unitFilter = document
    .getElementById("studentResourceUnitFilter")
    ?.value.trim()
    .toLowerCase();

  if (!list) return;

  list.innerHTML = "Loading resources...";
  if (msg) msg.textContent = "Loading resources...";
  const { data: userData } = await client.auth.getUser();
  const currentUser = userData?.user;

  let currentProfile = null;

  if (currentUser) {
    const { data: profileData } = await client
      .from("profiles")
      .select("role, is_premium")
      .eq("id", currentUser.id)
      .single();

    currentProfile = profileData;
  }

  const currentRole = String(currentProfile?.role || "").toLowerCase();

  const canAccessPremiumResources =
    currentProfile?.is_premium === true ||
    currentRole.includes("teacher") ||
    currentRole.includes("admin") ||
    currentRole.includes("super_admin");
  const { data, error } = await client
    .from("resources")
    .select("*")
    .eq("is_visible", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load student resources error:", error);
    list.innerHTML = "<p>Could not load resources.</p>";
    if (msg) msg.textContent = "Could not load resources.";
    return;
  }

  let resources = data || [];

  if (subjectFilter) {
    resources = resources.filter(resource =>
      String(resource.subject || "").toLowerCase().includes(subjectFilter)
    );
  }

  if (gradeFilter) {
    resources = resources.filter(resource =>
      String(resource.grade || "").toLowerCase().includes(gradeFilter)
    );
  }

  if (unitFilter) {
    resources = resources.filter(resource =>
      String(resource.unit || "").toLowerCase().includes(unitFilter)
    );
  }

  if (resources.length === 0) {
    list.innerHTML = "<p>No resources found.</p>";
    if (msg) msg.textContent = "No resources found.";
    return;
  }

  list.innerHTML = "";

  resources.forEach(resource => {
    const d = document.createElement("div");
    d.className = "box resource-card student-resource-card";

    d.innerHTML = `
<span class="badge">${resource.is_premium ? "💎 Premium" : "Free"}</span>
<span class="badge">${resource.is_visible ? "👁️ Visible" : "🙈 Hidden"}</span>      <h3>${safeText(resource.title || "Untitled Resource")}</h3>
      <p>${safeText(resource.description || "No description")}</p>
      <p><strong>Subject:</strong> ${safeText(resource.subject || "Not specified")}</p>
      <p><strong>Grade:</strong> ${safeText(resource.grade || "Not specified")}</p>
      <p><strong>Unit:</strong> ${safeText(resource.unit || "Not specified")}</p>
      <p><strong>Type:</strong> ${safeText(resource.file_type || "file")}</p>

      ${resource.is_premium && !canAccessPremiumResources
  ? `
    <div class="actions">
      <button type="button" class="secondary" disabled>Premium Resource 🔒</button>
    </div>
    <p class="msg">Upgrade to Premium to access this file.</p>
  `
  : `
    <div class="actions">
      <a href="${resource.file_url}" target="_blank" rel="noopener">
        <button type="button">Open / Download</button>
      </a>
    </div>
  `
      }
    `;

    list.appendChild(d);
  });

  if (msg) msg.textContent = "Resources loaded: " + resources.length;
}

function clearStudentResourceFilters() {
  const subject = document.getElementById("studentResourceSubjectFilter");
  const grade = document.getElementById("studentResourceGradeFilter");
  const unit = document.getElementById("studentResourceUnitFilter");

  if (subject) subject.value = "";
  if (grade) grade.value = "";
  if (unit) unit.value = "";

  loadStudentResources();
}
async function protectResourcesUploadPanel() {
  const panel = document.querySelector(".resources-upload-panel");
  if (!panel) return;

  // Hide by default
  panel.style.display = "none";

  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userData?.user;

  if (userError || !user) {
    panel.style.display = "none";
    return;
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    panel.style.display = "none";
    return;
  }

  const role = String(profile.role || "").toLowerCase();

  const canUploadResources =
    role.includes("teacher") ||
    role.includes("admin") ||
    role.includes("super_admin");

  // Empty string restores original CSS display
  panel.style.display = canUploadResources ? "" : "none";
}
function getCurrentStudySystem() {
  return localStorage.getItem("jakCurrentStudySystem") || "all";
}
function loadStudySystemPreset(system) {
  const selectedSystem =
    typeof normalizeStudySystemKey === "function"
      ? normalizeStudySystemKey(system || "all")
      : (system || "all");

  const presets = {
    pomodoro: {
      subject: "English Grammar / Vocabulary / Math",
      days: "Sunday, Monday, Tuesday",
      startTime: "17:00",
      sessionLength: 25,
      breakMinutes: 5,
      sessions: 4
    },

    active_recall: {
      subject: "Review questions / grammar rules / vocabulary",
      days: "Sunday, Tuesday, Thursday",
      startTime: "18:00",
      sessionLength: 30,
      breakMinutes: 5,
      sessions: 3
    },

    spaced_repetition: {
      subject: "Vocabulary / weak lessons / previous mistakes",
      days: "Saturday, Monday, Wednesday",
      startTime: "17:30",
      sessionLength: 20,
      breakMinutes: 5,
      sessions: 3
    },

    mistake_notebook: {
      subject: "Mistakes from exams / weak questions",
      days: "Sunday, Wednesday",
      startTime: "19:00",
      sessionLength: 30,
      breakMinutes: 5,
      sessions: 2
    },

    mind_map: {
      subject: "Mind map for grammar / vocabulary / unit revision",
      days: "Sunday, Tuesday",
      startTime: "18:30",
      sessionLength: 30,
      breakMinutes: 5,
      sessions: 2
    },

    leitner: {
      subject: "Vocabulary flashcards / weak words / definitions",
      days: "Sunday, Monday, Wednesday, Thursday",
      startTime: "17:00",
      sessionLength: 25,
      breakMinutes: 5,
      sessions: 4
    },

    deep_work: {
      subject: "Difficult lesson / writing / exam practice",
      days: "Saturday, Tuesday",
      startTime: "18:00",
      sessionLength: 60,
      breakMinutes: 10,
      sessions: 1
    },

    weekly_plan: {
      subject: "Weekly study plan",
      days: "Saturday, Sunday, Monday, Tuesday, Wednesday",
      startTime: "17:00",
      sessionLength: 40,
      breakMinutes: 10,
      sessions: 2
    },

    before_exam: {
      subject: "Final revision / exam preparation",
      days: "Every day",
      startTime: "18:00",
      sessionLength: 45,
      breakMinutes: 10,
      sessions: 3
    },

    feynman: {
      subject: "Explain grammar / vocabulary in simple words",
      days: "Sunday, Wednesday",
      startTime: "18:00",
      sessionLength: 30,
      breakMinutes: 5,
      sessions: 3
    },

    cornell_notes: {
      subject: "Lesson notes / grammar rules / vocabulary",
      days: "Monday, Thursday",
      startTime: "17:30",
      sessionLength: 35,
      breakMinutes: 5,
      sessions: 2
    },

    time_blocking: {
      subject: "Focused study block",
      days: "Sunday, Tuesday, Thursday",
      startTime: "17:00",
      sessionLength: 40,
      breakMinutes: 10,
      sessions: 3
    },

    manual: {
      subject: "",
      days: "",
      startTime: "17:00",
      sessionLength: 25,
      breakMinutes: 5,
      sessions: 1
    }
  };

  const methodSelectValueMap = {
    pomodoro: "pomodoro",
    spaced_repetition: "spaced",
    active_recall: "activeRecall",
    time_blocking: "timeBlocking",
    deep_work: "deepWork",
    weekly_plan: "weeklyPlan",
    before_exam: "examCountdown",
    feynman: "feynman",
    cornell_notes: "cornell",
    leitner: "leitner",
    mistake_notebook: "mistakeNotebook",
    mind_map: "mindMap",
    manual: "manual"
  };

  const preset = presets[selectedSystem] || presets.manual;

 const studySystemSection = document.getElementById("studySystem");

const methodSelect =
  studySystemSection?.querySelector("#studyMethodSelect") ||
  document.getElementById("studyMethodSelect");

const subjectInput =
  studySystemSection?.querySelector("#studySystemSubject") ||
  document.getElementById("studySystemSubject");

const daysInput =
  studySystemSection?.querySelector("#studySystemDays") ||
  document.getElementById("studySystemDays");

const startTimeInput =
  studySystemSection?.querySelector("#studySystemStart") ||
  document.getElementById("studySystemStart");

const sessionLengthInput =
  studySystemSection?.querySelector("#studySystemSession") ||
  document.getElementById("studySystemSession");

const breakInput =
  studySystemSection?.querySelector("#studySystemBreak") ||
  document.getElementById("studySystemBreak");

const sessionsInput =
  studySystemSection?.querySelector("#studySystemSessions") ||
  document.getElementById("studySystemSessions");


  if (methodSelect) {
    methodSelect.value = methodSelectValueMap[selectedSystem] || "pomodoro";
  }

  if (subjectInput) subjectInput.value = preset.subject;
  if (daysInput) daysInput.value = preset.days;
  if (startTimeInput) startTimeInput.value = preset.startTime;
  if (sessionLengthInput) sessionLengthInput.value = preset.sessionLength;
  if (breakInput) breakInput.value = preset.breakMinutes;
  if (sessionsInput) sessionsInput.value = preset.sessions;

  console.log("Study System preset loaded:", selectedSystem);
}

function setCurrentStudySystem(system) {
  const rawSystem = system || "all";

  const selectedSystem =
    typeof normalizeStudySystemKey === "function"
      ? normalizeStudySystemKey(rawSystem)
      : rawSystem;

  localStorage.setItem("jakCurrentStudySystem", selectedSystem);

  if (typeof loadStudySystemPreset === "function") {
    loadStudySystemPreset(selectedSystem);
  }

  if (typeof renderPlannerSystemContext === "function") {
    renderPlannerSystemContext();
  }

  if (typeof updatePlannerStats === "function") {
    updatePlannerStats();
  }

  if (typeof renderStudyAnalytics === "function") {
    renderStudyAnalytics();
  }

  if (typeof renderTodayTasks === "function") {
    renderTodayTasks();
  }

  if (typeof renderCalendar === "function") {
    renderCalendar();
  }

  if (typeof renderStudySystemDashboard === "function") {
    renderStudySystemDashboard();
  }

  if (typeof renderStudySystemTimeline === "function") {
    renderStudySystemTimeline();
  }

  if (typeof updatePlannerTableTitle === "function") {
    updatePlannerTableTitle();
  }

  console.log("Current Study System:", selectedSystem);
}
function getStudySystemLabel(system) {
  const labels = {
    all: "All Study Systems",
    support_plan: "Support Plan",
    pomodoro: "Pomodoro",
    active_recall: "Active Recall",
    spaced_repetition: "Spaced Review",
    time_blocking: "Time Blocking",
    deep_work: "Deep Work",
    weekly_plan: "Weekly Plan",
    before_exam: "Before Exam Plan",
    feynman: "Feynman Technique",
    cornell_notes: "Cornell Notes",
    leitner: "Leitner Flashcards",
    mistake_notebook: "Mistake Notebook",
    mind_map: "Mind Map",
    manual: "Manual Plan"
  };

  return labels[system] || system || "Smart Mode";
}
function updatePlannerTableTitle() {
  const title = document.getElementById("plannerTableTitle");
  if (!title) return;

  const currentSystem =
    typeof getCurrentStudySystem === "function"
      ? getCurrentStudySystem()
      : "all";

  const label =
    typeof getStudySystemLabel === "function"
      ? getStudySystemLabel(currentSystem)
      : currentSystem;

  title.textContent =
    currentSystem === "all"
      ? "My Plans"
      : `${label} Plans`;
}
function renderStudySystemDashboard() {
  const currentSystem =
    typeof getCurrentStudySystem === "function"
      ? getCurrentStudySystem()
      : "all";

  const label =
    typeof getStudySystemLabel === "function"
      ? getStudySystemLabel(currentSystem)
      : currentSystem;

  const heroName = document.getElementById("studySystemHeroName");
  if (heroName) {
    heroName.textContent = label;
  }

  // Highlight active system card safely
  document.querySelectorAll(".study-system-card").forEach(card => {
    const onclickValue = card.getAttribute("onclick") || "";

    const normalizedOnclick = onclickValue
      .replace(/"/g, "'")
      .toLowerCase();

    const isActive =
      normalizedOnclick.includes(`'${String(currentSystem).toLowerCase()}'`);

    card.classList.toggle("active-study-system-card", isActive);
  });

  const dashboard = document.getElementById("studySystemDashboard");
  if (!dashboard) return;

  const tasks =
    typeof getPlannerTasksByCurrentSystem === "function"
      ? getPlannerTasksByCurrentSystem()
      : [];

  const total = tasks.length;
  const done = tasks.filter(t => t.status === "done").length;
  const inProgress = tasks.filter(t => t.status === "in_progress").length;
  const notStarted = tasks.filter(t => t.status === "not_started").length;
  const progress = total ? Math.round((done / total) * 100) : 0;

  const today =
    typeof getTodayDateString === "function"
      ? getTodayDateString()
      : new Date().toISOString().split("T")[0];

  const upcomingTasks = tasks
    .filter(t => t.date && t.date >= today)
    .sort((a, b) => {
      const aKey = `${a.date || ""} ${a.startTime || a.start || ""}`;
      const bKey = `${b.date || ""} ${b.startTime || b.start || ""}`;
      return aKey.localeCompare(bKey);
    });

  const nextTask = upcomingTasks[0];
  const lastTask = upcomingTasks[upcomingTasks.length - 1];

  const nextTaskText = nextTask
    ? `${safeText(nextTask.date)} • ${safeText(nextTask.startTime || nextTask.start || "No time")}`
    : "No upcoming task";

  const nextTaskName = nextTask
    ? safeText(nextTask.task || nextTask.subject || "Study task")
    : "Generate a schedule first";

  const finishDate = lastTask
    ? safeText(lastTask.date)
    : "No timeline yet";

  const adviceMap = {
    all: "You are viewing all systems. Choose one method to focus your study dashboard.",
    support_plan: "Start with the teacher support tasks first, then review your weakest exam areas.",
    pomodoro: "Use short focused sessions. Do not skip breaks; they help your brain reset.",
    active_recall: "Close the book and test yourself. The struggle to remember is part of learning.",
    spaced_repetition: "Review on the scheduled days. Spaced review works only if you return before forgetting.",
    time_blocking: "Protect the block from distractions. One task only, no multitasking.",
    deep_work: "Remove distractions before starting. Deep work needs a clear target and a quiet environment.",
    weekly_plan: "Follow the weekly rhythm. Small daily consistency beats last-minute pressure.",
    before_exam: "Start with weak topics, then practise timed questions before the exam.",
    feynman: "Explain the lesson in simple words. If you cannot explain it, restudy that part.",
    cornell_notes: "Write questions in the side column and summarize the lesson at the bottom.",
    leitner: "Move remembered cards forward and repeat weak cards more often.",
    mistake_notebook: "Do not only write the correct answer. Write why your first answer was wrong.",
    mind_map: "Start from one central idea, then add rules, examples, mistakes, and exam questions.",
    manual: "Manual tasks give you freedom. Keep them specific, short, and measurable."
  };

  const smartAdvice =
    adviceMap[currentSystem] ||
    "Focus on one clear task now. A small completed step is better than a large ignored plan.";

  const statusText =
    total === 0
      ? "No plan yet"
      : progress === 100
        ? "Completed"
        : inProgress > 0
          ? "In progress"
          : "Ready to start";

  dashboard.innerHTML = `
    <div class="study-mini-stat study-system-main-stat">
      <span>Selected System</span>
      <strong>${safeText(label)}</strong>
    </div>

    <div class="study-mini-stat">
      <span>Status</span>
      <strong>${safeText(statusText)}</strong>
    </div>

    <div class="study-mini-stat">
      <span>Progress</span>
      <strong>${safeText(progress)}%</strong>
      <div class="study-dashboard-progress">
        <i style="width:${progress}%"></i>
      </div>
    </div>

    <div class="study-mini-stat">
      <span>Total Tasks</span>
      <strong>${safeText(total)}</strong>
    </div>

    <div class="study-mini-stat">
      <span>Completed</span>
      <strong>${safeText(done)}</strong>
    </div>

    <div class="study-mini-stat">
      <span>In Progress</span>
      <strong>${safeText(inProgress)}</strong>
    </div>

    <div class="study-mini-stat">
      <span>Not Started</span>
      <strong>${safeText(notStarted)}</strong>
    </div>

    <div class="study-mini-stat">
      <span>Next Session</span>
      <strong>${nextTaskText}</strong>
      <small>${nextTaskName}</small>
    </div>

    <div class="study-mini-stat">
      <span>Plan Ends</span>
      <strong>${safeText(finishDate)}</strong>
    </div>

    <div class="study-mini-stat study-smart-advice-card">
      <span>Smart Advice</span>
      <strong>${safeText(smartAdvice)}</strong>
    </div>
  `;
}
function renderStudySystemTimeline() {
  const timeline = document.getElementById("studySystemTimeline");
  if (!timeline) return;

  const tasks =
    typeof getPlannerTasksByCurrentSystem === "function"
      ? getPlannerTasksByCurrentSystem()
      : [];

  const today =
    typeof getTodayDateString === "function"
      ? getTodayDateString()
      : new Date().toISOString().split("T")[0];

  const upcoming = tasks
    .filter(t => t.date && t.date >= today)
    .sort((a, b) => {
      const aKey = `${a.date || ""} ${a.startTime || a.start || ""}`;
      const bKey = `${b.date || ""} ${b.startTime || b.start || ""}`;
      return aKey.localeCompare(bKey);
    })
    .slice(0, 5);

  if (!upcoming.length) {
    timeline.innerHTML = `
      <div class="study-timeline-empty">
        <strong>No upcoming sessions</strong>
        <span>Generate a study schedule to see your next tasks here.</span>
      </div>
    `;
    return;
  }

  timeline.innerHTML = upcoming.map((task, index) => {
    const start = task.startTime || task.start || "No start";
    const end = task.endTime || task.end || "No end";

    return `
      <div class="study-timeline-item">
        <div class="study-timeline-dot">${index + 1}</div>
        <div class="study-timeline-content">
          <span>${safeText(task.date)} • ${safeText(start)} → ${safeText(end)}</span>
          <strong>${safeText(task.task || task.subject || "Study task")}</strong>
          <small>${safeText(task.subject || "Study Subject")}</small>
        </div>
      </div>
    `;
  }).join("");
}


function startNextStudySystemTask() {
  const tasks =
    typeof getPlannerTasksByCurrentSystem === "function"
      ? getPlannerTasksByCurrentSystem()
      : [];

  const today =
    typeof getTodayDateString === "function"
      ? getTodayDateString()
      : new Date().toISOString().split("T")[0];

  const nextTask = tasks
    .filter(t =>
      t.id &&
      t.date &&
      t.date >= today &&
      t.status !== "done"
    )
    .sort((a, b) => {
      const aKey = `${a.date || ""} ${a.startTime || a.start || ""}`;
      const bKey = `${b.date || ""} ${b.startTime || b.start || ""}`;
      return aKey.localeCompare(bKey);
    })[0];

  if (!nextTask) {
    alert("No upcoming task to start for this study system.");
    return;
  }

  if (typeof updatePlannerTaskStatus === "function") {
    updatePlannerTaskStatus(nextTask.id, "in_progress");
  }

  alert("Started: " + (nextTask.task || nextTask.subject || "Study task"));
}

function startNextStudySystemTask() {
  const tasks =
    typeof getPlannerTasksByCurrentSystem === "function"
      ? getPlannerTasksByCurrentSystem()
      : [];

  const today =
    typeof getTodayDateString === "function"
      ? getTodayDateString()
      : new Date().toISOString().split("T")[0];

  const nextTask = tasks
    .filter(task =>
      task.id &&
      task.date &&
      task.date >= today &&
      task.status !== "done"
    )
    .sort((a, b) => {
      const aKey = `${a.date || ""} ${a.startTime || a.start || ""}`;
      const bKey = `${b.date || ""} ${b.startTime || b.start || ""}`;
      return aKey.localeCompare(bKey);
    })[0];

  if (!nextTask) {
    alert("No upcoming task to start for this study system.");
    return;
  }

  if (typeof updatePlanStatusById === "function") {
    updatePlanStatusById(nextTask.id, "in_progress");
  } else {
    alert("Task status updater is not available.");
    return;
  }

  alert("Started: " + (nextTask.task || nextTask.subject || "Study task"));
}


const studyMethodSelectEl = document.getElementById("studyMethodSelect");

if (studyMethodSelectEl) {
  studyMethodSelectEl.addEventListener("change", function () {
    setCurrentStudySystem(this.value);
  });
}
function getPlannerTasksByCurrentSystem() {
  const currentSystem =
    typeof getCurrentStudySystem === "function"
      ? getCurrentStudySystem()
      : "all";

  const plans =
    typeof getPlannerData === "function"
      ? getPlannerData()
      : getPlans();

  if (currentSystem === "all") {
    return plans;
  }

  return plans.filter(plan => {
    const taskSystem = plan.system || plan.source || "manual";
    return taskSystem === currentSystem;
  });
}

function renderPlannerSystemContext() {
  const box = document.getElementById("plannerSystemContext");
  if (!box) return;

  const currentSystem =
    typeof getCurrentStudySystem === "function"
      ? getCurrentStudySystem()
      : "all";

  const labels = {
    all: "All Study Systems 🌐",
    support_plan: "Support Plan 📘",
    pomodoro: "Pomodoro ⏱️",
    active_recall: "Active Recall 🧠",
    spaced_repetition: "Spaced Review 🔁",
    time_blocking: "Time Blocking 🧩",
    deep_work: "Deep Work 🚀",
    weekly_plan: "Weekly Plan 📅",
    before_exam: "Before Exam Plan 🎯",
    feynman: "Feynman Technique 🗣️",
    cornell_notes: "Cornell Notes 📝",
    leitner: "Leitner Flashcards 🃏",
    mistake_notebook: "Mistake Notebook 📓",
    mind_map: "Mind Map 🗺️",
    manual: "Manual Tasks ✍️"
  };

  const descriptions = {
    all: "You are viewing all saved study tasks from every system.",
    support_plan: "You are viewing tasks created from teacher support plans only.",
    pomodoro: "You are viewing Pomodoro-focused study tasks only.",
    active_recall: "You are viewing Active Recall study tasks only.",
    spaced_repetition: "You are viewing Spaced Review tasks scheduled across different days.",
    time_blocking: "You are viewing Time Blocking tasks only.",
    deep_work: "You are viewing Deep Work focus blocks only.",
    weekly_plan: "You are viewing Weekly Plan tasks only.",
    before_exam: "You are viewing final revision tasks before an exam.",
    feynman: "You are viewing Feynman explanation-based study tasks.",
    cornell_notes: "You are viewing Cornell Notes study tasks.",
    leitner: "You are viewing Leitner Flashcards tasks only.",
    mistake_notebook: "You are viewing Mistake Notebook tasks created to fix repeated mistakes.",
    mind_map: "You are viewing Mind Map tasks for organizing lessons visually.",
    manual: "You are viewing manually created study tasks only."
  };

  const currentLabel = labels[currentSystem] || currentSystem;
  const currentDescription =
    descriptions[currentSystem] ||
    "The planner is showing the selected study context.";

  box.innerHTML = `
    <div class="box planner-system-context-card">
      <div class="planner-system-header">
        <div>
          <span class="badge">Smart Planner Auto-Switch</span>
          <h2>${safeText(currentLabel)} View</h2>
          <p>${safeText(currentDescription)}</p>
        </div>

        <div class="planner-system-pill">
          <span>Current View</span>
          <strong>${safeText(currentLabel)}</strong>
        </div>
      </div>

      <p class="msg">
        Other tasks are still saved safely. Switching systems only changes what you see now; it does not delete or change old tasks.
      </p>

      <div class="actions planner-system-actions">
        <button type="button" class="${currentSystem === "all" ? "gold" : "secondary"}" onclick="setCurrentStudySystem('all')">All 🌐</button>
        <button type="button" class="${currentSystem === "support_plan" ? "gold" : "secondary"}" onclick="setCurrentStudySystem('support_plan')">Support Plan 📘</button>
        <button type="button" class="${currentSystem === "pomodoro" ? "gold" : "secondary"}" onclick="setCurrentStudySystem('pomodoro')">Pomodoro ⏱️</button>
        <button type="button" class="${currentSystem === "active_recall" ? "gold" : "secondary"}" onclick="setCurrentStudySystem('active_recall')">Active Recall 🧠</button>
        <button type="button" class="${currentSystem === "spaced_repetition" ? "gold" : "secondary"}" onclick="setCurrentStudySystem('spaced_repetition')">Spaced Review 🔁</button>
        <button type="button" class="${currentSystem === "mistake_notebook" ? "gold" : "secondary"}" onclick="setCurrentStudySystem('mistake_notebook')">Mistake Notebook 📓</button>
        <button type="button" class="${currentSystem === "mind_map" ? "gold" : "secondary"}" onclick="setCurrentStudySystem('mind_map')">Mind Map 🗺️</button>
        <button type="button" class="${currentSystem === "leitner" ? "gold" : "secondary"}" onclick="setCurrentStudySystem('leitner')">Leitner 🃏</button>
        <button type="button" class="${currentSystem === "deep_work" ? "gold" : "secondary"}" onclick="setCurrentStudySystem('deep_work')">Deep Work 🚀</button>
        <button type="button" class="${currentSystem === "before_exam" ? "gold" : "secondary"}" onclick="setCurrentStudySystem('before_exam')">Before Exam 🎯</button>
        <button type="button" class="${currentSystem === "manual" ? "gold" : "secondary"}" onclick="setCurrentStudySystem('manual')">Manual ✍️</button>
      </div>
    </div>
  `;
}
function scrollToWritingEditor() {
  const editorPanel = document.getElementById("writingEditorPanel");
  if (editorPanel) {
    editorPanel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function showWritingMode(mode) {
  const input = document.getElementById("studentWritingInput");
  const coachBox = document.querySelector(".ai-coach-box");

  if (mode === "practice" && input) {
    input.value =
      "Write a short paragraph about how students can improve their study habits. Use at least two connectors.";
    scrollToWritingEditor();
  }

  if (mode === "coach" && coachBox) {
    coachBox.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  console.log("Writing mode:", mode);
}

function analyzeWritingLocally() {
  const input = document.getElementById("studentWritingInput");
  const scoreValue = document.getElementById("writingScoreValue");

  const feedbackBox =
    document.getElementById("writingFeedbackBox") ||
    document.querySelector(".writing-feedback-preview");

  if (!input) return;

  const text = input.value.trim();

  if (!text) {
    alert("Please write something first.");
    return;
  }

  const lowerText = text.toLowerCase();

  // =====================================================
  // 1. Basic Text Analysis
  // =====================================================

  const words = text
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const cleanWords = words
    .map(word => word.toLowerCase().replace(/[^a-z'-]/g, ""))
    .filter(Boolean);

  const wordCount = words.length;

  const sentences = text
    .split(/[.!?]+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);

  const sentenceCount = sentences.length;

  const paragraphs = text
    .split(/\n+/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);

  const paragraphCount = paragraphs.length;

  const averageSentenceLength =
    sentenceCount ? Math.round(wordCount / sentenceCount) : 0;

  const hasClearEnding = /[.!?]$/.test(text);

  // =====================================================
  // 2. Connector Detection
  // =====================================================

  const connectorGroups = {
    Addition: ["moreover", "also", "in addition", "furthermore", "besides"],
    Contrast: ["however", "although", "even though", "but", "whereas", "on the other hand"],
    Reason: ["because", "since", "as"],
    Result: ["therefore", "so", "as a result", "consequently"],
    Example: ["for example", "for instance", "such as"],
    Sequence: ["first", "second", "then", "after that", "finally"],
    Conclusion: ["in conclusion", "to sum up", "overall", "in short"]
  };

  const usedConnectors = [];

  Object.entries(connectorGroups).forEach(([category, list]) => {
    list.forEach(connector => {
      if (lowerText.includes(connector)) {
        usedConnectors.push({ connector, category });
      }
    });
  });

  const hasConclusion =
    lowerText.includes("in conclusion") ||
    lowerText.includes("to sum up") ||
    lowerText.includes("overall") ||
    lowerText.includes("in short");

  const hasExample =
    lowerText.includes("for example") ||
    lowerText.includes("for instance") ||
    lowerText.includes("such as");

  const hasOpinionPhrase =
    lowerText.includes("in my opinion") ||
    lowerText.includes("i believe") ||
    lowerText.includes("i think");

  // =====================================================
  // 3. Repetition Detection
  // =====================================================

  const ignoredWords = [
    "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "at",
    "is", "are", "was", "were", "be", "been", "being", "it", "this",
    "that", "these", "those", "i", "you", "he", "she", "we", "they",
    "with", "for", "from", "as", "by", "not", "can", "will", "would",
    "have", "has", "had", "do", "does", "did"
  ];

  const wordFrequency = {};

  cleanWords.forEach(word => {
    if (word.length < 4 || ignoredWords.includes(word)) return;
    wordFrequency[word] = (wordFrequency[word] || 0) + 1;
  });

  const repeatedWords = Object.entries(wordFrequency)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // =====================================================
  // 4. Gibberish / Low-Quality Text Detection
  // =====================================================

  const commonEnglishWords = new Set([
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
    "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
    "this", "but", "his", "by", "from", "they", "we", "say", "her",
    "she", "or", "an", "will", "my", "one", "all", "would", "there",
    "their", "what", "so", "up", "out", "if", "about", "who", "get",
    "which", "go", "me", "when", "make", "can", "like", "time", "no",
    "just", "him", "know", "take", "people", "into", "year", "your",
    "good", "some", "could", "them", "see", "other", "than", "then",
    "now", "look", "only", "come", "its", "over", "think", "also",
    "back", "after", "use", "two", "how", "our", "work", "first",
    "well", "way", "even", "new", "want", "because", "any", "these",
    "give", "day", "most", "us", "is", "are", "was", "were", "has",
    "had", "students", "student", "technology", "education", "learn",
    "learning", "school", "teacher", "teachers", "study", "studying",
    "important", "help", "helps", "improve", "improves", "paragraph",
    "essay", "write", "writing", "online", "internet", "computer",
    "children", "parents", "life", "future", "problem", "solution"
  ]);

  const meaningfulWords = cleanWords.filter(word =>
    commonEnglishWords.has(word) ||
    word.length <= 4 ||
    usedConnectors.some(item => item.connector === word)
  );

  const suspiciousWords = cleanWords.filter(word => {
    const lettersOnly = word.replace(/[^a-z]/g, "");
    if (lettersOnly.length < 5) return false;

    const vowels = (lettersOnly.match(/[aeiou]/g) || []).length;
    const vowelRatio = vowels / lettersOnly.length;

    const hasNoVowels = vowels === 0;
    const hasVeryLongRandomShape = lettersOnly.length >= 12 && vowelRatio < 0.28;
    const hasRepeatedLetters = /(.)\1{3,}/.test(lettersOnly);
    const hasTooManyConsonantsTogether = /[bcdfghjklmnpqrstvwxyz]{6,}/i.test(lettersOnly);

    return hasNoVowels || hasVeryLongRandomShape || hasRepeatedLetters || hasTooManyConsonantsTogether;
  });

  const meaningfulRatio = cleanWords.length
    ? meaningfulWords.length / cleanWords.length
    : 0;

  const isVeryShort = wordCount < 8;
  const isTooShort = wordCount < 20;

  const looksLikeGibberish =
    cleanWords.length > 0 &&
    (
      suspiciousWords.length >= Math.ceil(cleanWords.length * 0.45) ||
      (wordCount <= 10 && meaningfulRatio < 0.35)
    );

  // =====================================================
  // 5. Grammar Detection
  // =====================================================

  const grammarWarnings = [];

  const grammarPatterns = [
    {
      pattern: /\btechnology have\b/i,
      issue: "Subject-verb agreement",
      suggestion: "Use “technology has” because technology is singular."
    },
    {
      pattern: /\bstudents is\b/i,
      issue: "Subject-verb agreement",
      suggestion: "Use “students are” because students is plural."
    },
    {
      pattern: /\bpeople is\b/i,
      issue: "Subject-verb agreement",
      suggestion: "Use “people are”."
    },
    {
      pattern: /\bthere is many\b/i,
      issue: "There is / There are",
      suggestion: "Use “there are many”."
    },
    {
      pattern: /\bmore better\b/i,
      issue: "Double comparative",
      suggestion: "Use “better”, not “more better”."
    },
    {
      pattern: /\bcan to\b/i,
      issue: "Modal verb form",
      suggestion: "Use “can + base verb”, not “can to”."
    },
    {
      pattern: /\bmust to\b/i,
      issue: "Modal verb form",
      suggestion: "Use “must + base verb”, not “must to”."
    },
    {
      pattern: /\bshould to\b/i,
      issue: "Modal verb form",
      suggestion: "Use “should + base verb”, not “should to”."
    }
  ];

  grammarPatterns.forEach(item => {
    if (item.pattern.test(text)) {
      grammarWarnings.push(item);
    }
  });

  // =====================================================
  // 6. Organization + Vocabulary Checks
  // =====================================================

  const organizationWarnings = [];

  if (wordCount < 40) {
    organizationWarnings.push("Your writing is still short. Add more supporting details.");
  }

  if (sentenceCount < 3) {
    organizationWarnings.push("Try writing at least three complete sentences.");
  }

  if (!hasExample) {
    organizationWarnings.push("Add an example using “for example” or “for instance”.");
  }

  if (!hasConclusion && wordCount >= 60) {
    organizationWarnings.push("Add a clear concluding sentence.");
  }

  if (!hasClearEnding) {
    organizationWarnings.push("End your writing with proper punctuation.");
  }

  if (looksLikeGibberish) {
    organizationWarnings.unshift("The text does not look like meaningful English writing. Write complete, real sentences.");
  }

  const vocabularySuggestions = [
    { weak: "good", better: "effective / beneficial / valuable" },
    { weak: "bad", better: "harmful / negative / serious" },
    { weak: "very important", better: "essential / crucial / significant" },
    { weak: "a lot of", better: "many / numerous / a great number of" },
    { weak: "things", better: "factors / aspects / points" },
    { weak: "get better", better: "improve / develop / make progress" }
  ].filter(item => lowerText.includes(item.weak));

  // =====================================================
  // 7. Score Calculation
  // =====================================================

  let score = 0;

  // Length and effort
  if (wordCount >= 20) score += 10;
  if (wordCount >= 40) score += 10;
  if (wordCount >= 80) score += 10;

  // Sentence control
  if (sentenceCount >= 2) score += 8;
  if (sentenceCount >= 3) score += 7;

  // Connectors
  if (usedConnectors.length >= 1) score += 7;
  if (usedConnectors.length >= 2) score += 8;
  if (usedConnectors.length >= 4) score += 5;

  // Structure
  if (hasExample) score += 8;
  if (hasConclusion) score += 7;
  if (hasOpinionPhrase) score += 5;
  if (hasClearEnding) score += 5;

  // Sentence quality
  if (averageSentenceLength >= 8 && averageSentenceLength <= 24) score += 8;

  // Grammar reward only if text is long enough to judge
  if (wordCount >= 20 && grammarWarnings.length === 0) score += 7;

  // Penalties
  score -= Math.min(grammarWarnings.length * 6, 18);
  score -= Math.min(repeatedWords.length * 3, 10);

  // Strong guards
  if (isVeryShort) score = Math.min(score, 25);
  if (isTooShort) score = Math.min(score, 45);
  if (looksLikeGibberish) score = Math.min(score, 20);

  score = Math.max(0, Math.min(Math.round(score), 100));

  const level =
    looksLikeGibberish ? "Invalid / Needs Real Writing" :
    isVeryShort ? "Too Short" :
    score >= 90 ? "Excellent" :
    score >= 80 ? "Very Good" :
    score >= 70 ? "Good" :
    score >= 60 ? "Developing" :
    "Needs Support";

  // =====================================================
  // 8. Skill Scores
  // =====================================================

  let skillScores = {
    grammar:
      wordCount < 20
        ? 25
        : Math.max(20, Math.min(100, 82 - grammarWarnings.length * 12)),

    vocabulary:
      wordCount < 20
        ? 25
        : Math.max(20, Math.min(100, 78 - vocabularySuggestions.length * 10 - repeatedWords.length * 4)),

    connectors:
      Math.max(0, Math.min(100, usedConnectors.length * 22)),

    organization:
      Math.max(
        10,
        Math.min(
          100,
          35 +
          (sentenceCount >= 3 ? 15 : 0) +
          (hasExample ? 15 : 0) +
          (hasConclusion ? 15 : 0) +
          (paragraphCount > 1 ? 10 : 0)
        )
      ),

    clarity:
      wordCount < 20
        ? 25
        : Math.max(
            15,
            Math.min(
              100,
              averageSentenceLength >= 8 && averageSentenceLength <= 24 ? 78 : 50
            )
          )
  };

  if (looksLikeGibberish) {
    skillScores = {
      grammar: 10,
      vocabulary: 10,
      connectors: 0,
      organization: 10,
      clarity: 10
    };
  }

  // =====================================================
  // 9. Suggested Next Exercise
  // =====================================================

  const nextExercise =
    looksLikeGibberish
      ? "Write three real English sentences about the topic. Avoid random letters."
      : isTooShort
        ? "Write at least 20 words before asking for a full analysis."
        : grammarWarnings.length
          ? "Practice subject-verb agreement and modal verb structures."
          : usedConnectors.length < 2
            ? "Practice using connectors such as however, because, moreover, and for example."
            : !hasExample
              ? "Write a paragraph that includes one clear example."
              : !hasConclusion
                ? "Practice writing strong concluding sentences."
                : "Move to a longer paragraph or essay task.";

  // =====================================================
  // 10. Improved Draft Preview
  // =====================================================

  let improvedDraft = text
    .replace(/\btechnology have\b/gi, "technology has")
    .replace(/\bstudents is\b/gi, "students are")
    .replace(/\bpeople is\b/gi, "people are")
    .replace(/\bthere is many\b/gi, "there are many")
    .replace(/\bmore better\b/gi, "better")
    .replace(/\bcan to\b/gi, "can")
    .replace(/\bmust to\b/gi, "must")
    .replace(/\bshould to\b/gi, "should");

  if (!/[.!?]$/.test(improvedDraft)) {
    improvedDraft += ".";
  }

  if (looksLikeGibberish) {
    improvedDraft = "Please write meaningful English sentences before requesting an improved draft.";
  }

  // =====================================================
  // 11. Update UI
  // =====================================================

  if (scoreValue) {
    scoreValue.textContent = score;
  }

  if (typeof updateWritingCommandCenter === "function") {
    updateWritingCommandCenter();
  }

  if (typeof updateWritingSkillMap === "function") {
    updateWritingSkillMap(skillScores);
  }

  if (feedbackBox) {
    feedbackBox.innerHTML = `
      <h3>Writing Report</h3>

      <p>
        <strong>Score:</strong> ${safeText(score)}%
        <small>${safeText(level)}</small>
      </p>

      <p>
        <strong>Words:</strong> ${safeText(wordCount)}
        <small>${wordCount < 40 ? "Add more details." : "Good length for a first draft."}</small>
      </p>

      <p>
        <strong>Sentences:</strong> ${safeText(sentenceCount)}
        <small>Average sentence length: ${safeText(averageSentenceLength)} words.</small>
      </p>

      <p>
        <strong>Paragraphs:</strong> ${safeText(paragraphCount)}
        <small>${paragraphCount > 1 ? "Multi-paragraph writing." : "Single paragraph."}</small>
      </p>

      <p>
        <strong>Connectors:</strong> ${safeText(usedConnectors.length)}
        <small>${
          usedConnectors.length
            ? "Used: " + safeText(usedConnectors.map(item => item.connector).join(", "))
            : "Try using connectors such as however, because, moreover, and for example."
        }</small>
      </p>

      <h3>Grammar Warnings</h3>
      ${
        grammarWarnings.length
          ? grammarWarnings.map(item => `
              <p>
                <span class="writing-error">${safeText(item.issue)}</span>
                <small>${safeText(item.suggestion)}</small>
              </p>
            `).join("")
          : `<p><span class="writing-good">${
              looksLikeGibberish
                ? "Grammar cannot be judged accurately because the text is not meaningful."
                : "No major local grammar warning found."
            }</span></p>`
      }

      <h3>Organization Check</h3>
      ${
        organizationWarnings.length
          ? organizationWarnings.map(warning => `
              <p>
                <span class="writing-warning">Suggestion</span>
                <small>${safeText(warning)}</small>
              </p>
            `).join("")
          : `<p><span class="writing-good">Your organization looks clear for a first draft.</span></p>`
      }

      <h3>Vocabulary Suggestions</h3>
      ${
        vocabularySuggestions.length
          ? vocabularySuggestions.map(item => `
              <p>
                <span class="writing-warning">${safeText(item.weak)}</span>
                <small>Try: ${safeText(item.better)}</small>
              </p>
            `).join("")
          : `<p><span class="writing-good">${
              looksLikeGibberish
                ? "Vocabulary cannot be judged because the text does not look meaningful."
                : "No basic weak vocabulary detected locally."
            }</span></p>`
      }

      <h3>Repeated Words</h3>
      ${
        repeatedWords.length
          ? repeatedWords.map(([word, count]) => `
              <p>
                <span class="writing-warning">${safeText(word)}</span>
                <small>Repeated ${safeText(count)} times.</small>
              </p>
            `).join("")
          : `<p>No strong repetition detected.</p>`
      }

      <h3>Improved Draft Preview</h3>
      <p>${safeText(improvedDraft)}</p>

      <h3>Suggested Next Exercise</h3>
      <p>
        <span class="writing-good">Next Step</span>
        <small>${safeText(nextExercise)}</small>
      </p>

      <p>
        <span class="writing-good">Local Preview</span>
        <small>This is a rule-based local analyzer. Later, real AI can provide deeper grammar, style, task achievement, and personalized feedback.</small>
      </p>
    `;
  }

  // =====================================================
  // 12. Save Attempt Once
  // =====================================================

  if (typeof saveWritingAttempt === "function") {
    saveWritingAttempt({
      text,
      score,
      level,
      wordCount,
      sentenceCount,
      paragraphCount,
      averageSentenceLength,
      connectorsCount: usedConnectors.length,
      grammarWarningsCount: grammarWarnings.length,
      repeatedWordsCount: repeatedWords.length,
      topic: document.getElementById("writingTopicInput")?.value.trim() || "Untitled Topic",
      writingType: document.getElementById("writingTypeSelect")?.value || "paragraph",
      typeLabel:
        typeof getWritingTypeLabel === "function"
          ? getWritingTypeLabel(document.getElementById("writingTypeSelect")?.value || "paragraph")
          : "Writing Task",
      learnerMode: document.getElementById("writingLearnerModeSelect")?.value || "school",
      focusSkill: document.getElementById("writingGoalSelect")?.value || "paragraph",
      qualityFlags: {
        isVeryShort,
        isTooShort,
        looksLikeGibberish,
        suspiciousWordsCount: suspiciousWords.length,
        meaningfulRatio: Number(meaningfulRatio.toFixed(2))
      },
      skillScores
    });
  }

  // =====================================================
  // 13. Refresh Connected Writing Systems
  // =====================================================

  if (typeof renderDynamicWritingIntelligence === "function") {
    renderDynamicWritingIntelligence(text);
  }

  if (typeof renderGenreAwareWritingCheck === "function") {
    renderGenreAwareWritingCheck(text);
  }

  if (typeof renderSentenceQualityReport === "function") {
    renderSentenceQualityReport(text);
  }

  if (typeof renderWritingProgressSummary === "function") {
    renderWritingProgressSummary();
  }

  if (typeof updateWritingV3AnalyticsFromAttempts === "function") {
    updateWritingV3AnalyticsFromAttempts();
  }

  if (typeof updateWritingSmartCoachPanel === "function") {
    updateWritingSmartCoachPanel();
  }

  alert("Writing report generated. Score: " + score + "%");
}
function getWritingAttempts() {
  try {
    return JSON.parse(localStorage.getItem("jakWritingAttemptsV1")) || [];
  } catch (error) {
    console.warn("Could not read writing attempts:", error);
    return [];
  }
}

function saveWritingAttempt(attemptData) {
  const attempts = getWritingAttempts();

  const attempt = {
    id: "writing-" + Date.now(),
    createdAt: new Date().toISOString(),
    ...attemptData
  };

  attempts.unshift(attempt);

  const limitedAttempts = attempts.slice(0, 50);

  localStorage.setItem("jakWritingAttemptsV1", JSON.stringify(limitedAttempts));

  console.log("Writing attempt saved:", attempt);

  if (typeof renderWritingProgressSummary === "function") {
    renderWritingProgressSummary();
  }

  return attempt;
}

function renderWritingProgressSummary() {
  const summaryBox = document.getElementById("writingProgressSummary");
  const levelBadge = document.getElementById("writingLevelBadge");
  const barsBox = document.getElementById("writingSkillProgressBars");
  const adviceBox = document.getElementById("writingProgressAdvice");

  if (!summaryBox) return;

  const attempts = typeof getWritingAttempts === "function" ? getWritingAttempts() : [];

  if (!attempts || attempts.length === 0) {
    summaryBox.innerHTML = `
      <div class="writing-progress-empty">
        <strong>No writing history yet.</strong>
        <span>Analyze your writing to start tracking progress.</span>
      </div>
    `;

    if (levelBadge) levelBadge.textContent = "Level: —";
    if (barsBox) barsBox.innerHTML = "";
    if (adviceBox) adviceBox.innerHTML = "";
    return;
  }

  const scores = attempts
    .map(a => Number(a.score || 0))
    .filter(score => !Number.isNaN(score));

  const totalAttempts = attempts.length;
  const latestAttempt = attempts[0];
  const latestScore = Number(latestAttempt.score || 0);
  const averageScore = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : 0;

  const bestAttempt = attempts.reduce((best, current) => {
    return Number(current.score || 0) > Number(best.score || 0) ? current : best;
  }, attempts[0]);

  const weakestAttempt = attempts.reduce((weakest, current) => {
    return Number(current.score || 0) < Number(weakest.score || 0) ? current : weakest;
  }, attempts[0]);

  const writingLevel =
    averageScore >= 90 ? "Advanced" :
    averageScore >= 75 ? "Strong" :
    averageScore >= 60 ? "Developing" :
    averageScore >= 40 ? "Basic" :
    "Starter";

  if (levelBadge) {
    levelBadge.textContent = "Level: " + writingLevel;
  }

  const skillKeys = ["grammar", "vocabulary", "connectors", "organization", "clarity"];

  const skillTotals = {
    grammar: 0,
    vocabulary: 0,
    connectors: 0,
    organization: 0,
    clarity: 0
  };

  let skillCount = 0;

  attempts.forEach(attempt => {
    const skills = attempt.skillScores || attempt.skills || null;

    if (skills) {
      skillKeys.forEach(key => {
        skillTotals[key] += Number(skills[key] || 0);
      });
      skillCount++;
    }
  });

  const skillAverages = {};

  skillKeys.forEach(key => {
    skillAverages[key] = skillCount
      ? Math.round(skillTotals[key] / skillCount)
      : averageScore;
  });

  const weakestSkill = skillKeys.reduce((weakest, key) => {
    return skillAverages[key] < skillAverages[weakest] ? key : weakest;
  }, skillKeys[0]);

  const strongestSkill = skillKeys.reduce((strongest, key) => {
    return skillAverages[key] > skillAverages[strongest] ? key : strongest;
  }, skillKeys[0]);

  const formatSkill = (skill) => {
    return skill.charAt(0).toUpperCase() + skill.slice(1);
  };

  const formatDate = (value) => {
    if (!value) return "Recent";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recent";
    return date.toLocaleDateString();
  };

  const improvementMessage =
    totalAttempts < 2
      ? "Analyze more writing samples to unlock improvement tracking."
      : latestScore >= averageScore
        ? "Your latest writing is at or above your average. Keep building consistency."
        : "Your latest writing is below your average. Review your weakest skill before the next attempt.";

  summaryBox.innerHTML = `
    <div class="writing-progress-card">
      <span>Total Attempts</span>
      <strong>${totalAttempts}</strong>
      <small>Saved writing analyses</small>
    </div>

    <div class="writing-progress-card">
      <span>Average Score</span>
      <strong>${averageScore}%</strong>
      <small>Overall writing performance</small>
    </div>

    <div class="writing-progress-card">
      <span>Best Attempt</span>
      <strong>${Number(bestAttempt.score || 0)}%</strong>
      <small>${formatDate(bestAttempt.date || bestAttempt.createdAt || bestAttempt.savedAt)}</small>
    </div>

    <div class="writing-progress-card">
      <span>Focus Area</span>
      <strong>${formatSkill(weakestSkill)}</strong>
      <small>Strongest: ${formatSkill(strongestSkill)}</small>
    </div>
  `;

  if (barsBox) {
    barsBox.innerHTML = skillKeys.map(key => {
      const value = Math.max(0, Math.min(100, skillAverages[key] || 0));

      return `
        <div class="writing-skill-bar-row">
          <div class="writing-skill-bar-label">${formatSkill(key)}</div>
          <div class="writing-skill-bar-track">
            <div class="writing-skill-bar-fill" style="width:${value}%"></div>
          </div>
          <div class="writing-skill-bar-value">${value}%</div>
        </div>
      `;
    }).join("");
  }

  if (adviceBox) {
  adviceBox.innerHTML = `
    <strong>Smart Advice:</strong>
    Focus next on <b>${formatSkill(weakestSkill)}</b>.
    ${improvementMessage}
    Best score: <b>${Number(bestAttempt.score || 0)}%</b>.
    Lowest score: <b>${Number(weakestAttempt.score || 0)}%</b>.
  `;
}

if (typeof renderWritingAchievements === "function") {
  renderWritingAchievements();
}

if (typeof renderWritingAttemptsTimeline === "function") {
  renderWritingAttemptsTimeline();
}

if (typeof updateWritingSmartCoachPanel === "function") {
  updateWritingSmartCoachPanel();
}
}
function updateWritingSmartCoachPanel() {
  const focusBox = document.getElementById("coachCurrentFocus");
  const levelBox = document.getElementById("coachWritingLevel");
  const actionBox = document.getElementById("coachNextAction");

  const learnerModeSelect = document.getElementById("writingLearnerModeSelect");
  const writingGoalSelect = document.getElementById("writingGoalSelect");
  const writingTypeSelect = document.getElementById("writingTypeSelect");

  const attempts = typeof getWritingAttempts === "function" ? getWritingAttempts() : [];

  const formatText = (value) => {
    if (!value) return "Waiting";
    return String(value)
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/\b\w/g, letter => letter.toUpperCase())
      .trim();
  };

  const getWritingLevelFromAverage = () => {
    if (!attempts || attempts.length === 0) return "Waiting";

    const scores = attempts
      .map(attempt => Number(attempt.score || 0))
      .filter(score => !Number.isNaN(score));

    const average = scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : 0;

    if (average >= 90) return "Advanced";
    if (average >= 75) return "Strong";
    if (average >= 60) return "Developing";
    if (average >= 40) return "Basic";
    return "Starter";
  };

  const getWeakestSkill = () => {
    if (!attempts || attempts.length === 0) {
      return writingGoalSelect ? writingGoalSelect.value : "organization";
    }

    const skillKeys = ["grammar", "vocabulary", "connectors", "organization", "clarity"];

    const totals = {
      grammar: 0,
      vocabulary: 0,
      connectors: 0,
      organization: 0,
      clarity: 0
    };

    let count = 0;

    attempts.forEach(attempt => {
      const skills = attempt.skillScores || attempt.skills || null;

      if (skills) {
        skillKeys.forEach(key => {
          totals[key] += Number(skills[key] || 0);
        });
        count++;
      }
    });

    if (!count) {
      return writingGoalSelect ? writingGoalSelect.value : "organization";
    }

    const averages = {};
    skillKeys.forEach(key => {
      averages[key] = Math.round(totals[key] / count);
    });

    return skillKeys.reduce((weakest, key) => {
      return averages[key] < averages[weakest] ? key : weakest;
    }, skillKeys[0]);
  };

  const learnerMode = learnerModeSelect ? learnerModeSelect.value : "school";
  const writingType = writingTypeSelect ? writingTypeSelect.value : "paragraph";
  const focusSkill = getWeakestSkill();
  const writingLevel = getWritingLevelFromAverage();

  let nextAction = "Generate Mission";

  if (attempts.length === 0) {
    nextAction = "Write First Attempt";
  } else if (focusSkill === "grammar") {
    nextAction = "Review Grammar Clinic";
  } else if (focusSkill === "vocabulary") {
    nextAction = "Open Vocabulary Lab";
  } else if (focusSkill === "connectors") {
    nextAction = "Practice Connectors";
  } else if (focusSkill === "organization") {
    nextAction = "Build Paragraph Plan";
  } else if (focusSkill === "clarity") {
    nextAction = "Rewrite for Clarity";
  }

  if (focusBox) {
    focusBox.textContent = formatText(focusSkill);
  }

  if (levelBox) {
    levelBox.textContent = writingLevel;
  }

  if (actionBox) {
    actionBox.textContent = nextAction;
  }

  const commandLearnerMode = document.getElementById("commandLearnerMode");
  const commandWritingType = document.getElementById("commandWritingType");
  const commandFocusSkill = document.getElementById("commandFocusSkill");
  const commandNextStep = document.getElementById("commandNextStep");

  if (commandLearnerMode) commandLearnerMode.textContent = formatText(learnerMode);
  if (commandWritingType) commandWritingType.textContent = formatText(writingType);
  if (commandFocusSkill) commandFocusSkill.textContent = formatText(focusSkill);
  if (commandNextStep) commandNextStep.textContent = nextAction;
}

function renderWritingAchievements() {
  const streakBadge = document.getElementById("writingStreakBadge");
  const badgesBox = document.getElementById("writingAchievementBadges");
  const motivationBox = document.getElementById("writingMotivationMessage");

  if (!streakBadge || !badgesBox || !motivationBox) return;

  const attempts = typeof getWritingAttempts === "function" ? getWritingAttempts() : [];

  if (!attempts || attempts.length === 0) {
    streakBadge.textContent = "🔥 Streak: 0 days";
    badgesBox.innerHTML = `
      <span class="writing-achievement-badge locked">🔒 First Writing Attempt</span>
      <span class="writing-achievement-badge locked">🔒 5 Writing Attempts</span>
      <span class="writing-achievement-badge locked">🔒 Strong Vocabulary</span>
      <span class="writing-achievement-badge locked">🔒 Connector Builder</span>
      <span class="writing-achievement-badge locked">🔒 Advanced Writer</span>
    `;
    motivationBox.textContent = "Analyze your writing to start your achievement journey.";
    return;
  }

  const normalizeDate = (value) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return null;

    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
      .toISOString()
      .slice(0, 10);
  };

  const uniqueDates = [...new Set(
    attempts
      .map(attempt => normalizeDate(attempt.date || attempt.createdAt || attempt.savedAt))
      .filter(Boolean)
  )].sort((a, b) => new Date(b) - new Date(a));

  let streak = 0;

  if (uniqueDates.length > 0) {
    let cursor = new Date(uniqueDates[0] + "T00:00:00");

    for (const dateString of uniqueDates) {
      const current = new Date(dateString + "T00:00:00");

      if (current.toISOString().slice(0, 10) === cursor.toISOString().slice(0, 10)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
  }

  streakBadge.textContent = `🔥 Streak: ${streak} day${streak === 1 ? "" : "s"}`;

  const scores = attempts.map(a => Number(a.score || 0)).filter(score => !Number.isNaN(score));
  const averageScore = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : 0;

  const bestScore = scores.length ? Math.max(...scores) : 0;

  const skillKeys = ["grammar", "vocabulary", "connectors", "organization", "clarity"];

  const getAverageSkill = (skill) => {
    const values = attempts
      .map(attempt => {
        const skills = attempt.skillScores || attempt.skills || {};
        return Number(skills[skill] || 0);
      })
      .filter(value => value > 0);

    return values.length
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : averageScore;
  };

  const skillAverages = {};
  skillKeys.forEach(skill => {
    skillAverages[skill] = getAverageSkill(skill);
  });

  const achievements = [
    {
      title: "First Writing Attempt",
      icon: "✍️",
      unlocked: attempts.length >= 1
    },
    {
      title: "5 Writing Attempts",
      icon: "🧠",
      unlocked: attempts.length >= 5
    },
    {
      title: "Strong Vocabulary",
      icon: "📚",
      unlocked: skillAverages.vocabulary >= 80
    },
    {
      title: "Connector Builder",
      icon: "🔗",
      unlocked: skillAverages.connectors >= 70
    },
    {
      title: "Advanced Writer",
      icon: "🚀",
      unlocked: averageScore >= 90 || bestScore >= 90
    }
  ];

  badgesBox.innerHTML = achievements.map(achievement => {
    const statusClass = achievement.unlocked ? "unlocked" : "locked";
    const lockIcon = achievement.unlocked ? achievement.icon : "🔒";

    return `
      <span class="writing-achievement-badge ${statusClass}">
        ${lockIcon} ${achievement.title}
      </span>
    `;
  }).join("");

  const unlockedCount = achievements.filter(a => a.unlocked).length;

  let motivationMessage = "";

  if (averageScore >= 90) {
    motivationMessage = "Excellent progress. Your writing is becoming advanced. Keep polishing organization and style.";
  } else if (averageScore >= 75) {
    motivationMessage = "Great work. You are building strong writing habits. Try to improve your weakest skill next.";
  } else if (averageScore >= 60) {
    motivationMessage = "Good start. Keep writing regularly and focus on grammar, connectors, and clarity.";
  } else {
    motivationMessage = "Do not worry. Improvement starts with small attempts. Write short paragraphs and analyze them often.";
  }

  motivationBox.innerHTML = `
    ${motivationMessage}
    <br>
    <strong>Unlocked badges:</strong> ${unlockedCount}/${achievements.length}
    • <strong>Last writing day:</strong> ${uniqueDates[0] || "—"}
  `;
}
function renderWritingAttemptsTimeline() {
  const timelineBox = document.getElementById("writingAttemptsTimeline");
  if (!timelineBox) return;

  const attempts = typeof getWritingAttempts === "function" ? getWritingAttempts() : [];

  if (!attempts || attempts.length === 0) {
    timelineBox.innerHTML = `
      <div class="writing-progress-empty">
        <strong>No attempts yet.</strong>
        <span>Your recent writing attempts will appear here after analysis.</span>
      </div>
    `;
    return;
  }

  const formatDate = (value) => {
    if (!value) return "Recent";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recent";

    return date.toLocaleDateString() + " • " + date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const formatSkill = (skill) => {
    return skill.charAt(0).toUpperCase() + skill.slice(1);
  };

  const getLevel = (score) => {
    const value = Number(score || 0);

    if (value >= 90) return "Advanced";
    if (value >= 75) return "Strong";
    if (value >= 60) return "Developing";
    if (value >= 40) return "Basic";
    return "Starter";
  };

  const getSkillInfo = (attempt) => {
    const skills = attempt.skillScores || attempt.skills || null;

    if (!skills) {
      return {
        weakest: "clarity",
        strongest: "organization"
      };
    }

    const skillKeys = ["grammar", "vocabulary", "connectors", "organization", "clarity"];

    const weakest = skillKeys.reduce((weakestKey, key) => {
      return Number(skills[key] || 0) < Number(skills[weakestKey] || 0)
        ? key
        : weakestKey;
    }, skillKeys[0]);

    const strongest = skillKeys.reduce((strongestKey, key) => {
      return Number(skills[key] || 0) > Number(skills[strongestKey] || 0)
        ? key
        : strongestKey;
    }, skillKeys[0]);

    return {
      weakest,
      strongest
    };
  };

  const recentAttempts = attempts.slice(0, 6);

  timelineBox.innerHTML = recentAttempts.map((attempt, index) => {
    const score = Number(attempt.score || 0);
    const level = getLevel(score);
    const skillInfo = getSkillInfo(attempt);

    const message =
      score >= 90
        ? "Excellent attempt. Focus on refining style and sentence variety."
        : score >= 75
          ? "Strong attempt. Keep improving your weakest skill step by step."
          : score >= 60
            ? "Good progress. Review your mistakes and rewrite one improved paragraph."
            : "Start small. Write shorter sentences and focus on clarity first.";

    return `
      <div class="writing-attempt-card">
        <div class="writing-attempt-top">
          <div>
            <div class="writing-attempt-title">Attempt ${index + 1} • ${level}</div>
            <span class="writing-attempt-date">
              ${formatDate(attempt.date || attempt.createdAt || attempt.savedAt)}
            </span>
          </div>

          <div class="writing-attempt-score">${score}%</div>
        </div>

        <div class="writing-attempt-meta">
          <span class="writing-attempt-pill">Strongest: ${formatSkill(skillInfo.strongest)}</span>
          <span class="writing-attempt-pill warning">Focus: ${formatSkill(skillInfo.weakest)}</span>
        </div>

        <div class="writing-attempt-message">
          ${message}
        </div>
      </div>
    `;
  }).join("");
}
function analyzeSentenceQuality(text) {
  const rawSentences = (text || "")
    .split(/[.!?]+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);

  const sentences = rawSentences.map(sentence => {
    const words = sentence
      .replace(/[^\w\s'-]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    return {
      text: sentence,
      wordCount: words.length,
      firstWord: words[0] ? words[0].toLowerCase() : "",
      hasLikelyVerb: /\b(am|is|are|was|were|be|been|being|have|has|had|do|does|did|can|could|will|would|shall|should|may|might|must|go|goes|went|make|makes|made|use|uses|used|learn|learns|learned|study|studies|studied|help|helps|helped|think|thinks|thought|believe|believes|believed|write|writes|wrote|read|reads|read|play|plays|played|work|works|worked|need|needs|needed|get|gets|got)\b/i.test(sentence)
    };
  });

  const totalSentences = sentences.length;
  const totalWords = sentences.reduce((sum, sentence) => sum + sentence.wordCount, 0);
  const averageLength = totalSentences ? Math.round(totalWords / totalSentences) : 0;

  const veryShortSentences = sentences.filter(sentence => sentence.wordCount > 0 && sentence.wordCount < 5);
  const longSentences = sentences.filter(sentence => sentence.wordCount > 28);
  const noVerbSentences = sentences.filter(sentence => !sentence.hasLikelyVerb && sentence.wordCount >= 3);

  const openingFrequency = {};
  sentences.forEach(sentence => {
    if (!sentence.firstWord) return;
    openingFrequency[sentence.firstWord] = (openingFrequency[sentence.firstWord] || 0) + 1;
  });

  const repeatedOpenings = Object.entries(openingFrequency)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  const sentenceLengths = sentences.map(sentence => sentence.wordCount);
  const uniqueLengths = new Set(sentenceLengths).size;

  const hasVariety =
    totalSentences <= 2
      ? false
      : uniqueLengths >= Math.min(3, totalSentences);

  let clarityScore = 100;

  if (totalSentences < 3) clarityScore -= 15;
  if (veryShortSentences.length) clarityScore -= Math.min(veryShortSentences.length * 8, 20);
  if (longSentences.length) clarityScore -= Math.min(longSentences.length * 10, 25);
  if (noVerbSentences.length) clarityScore -= Math.min(noVerbSentences.length * 12, 30);
  if (repeatedOpenings.length) clarityScore -= Math.min(repeatedOpenings.length * 8, 20);
  if (!hasVariety && totalSentences >= 3) clarityScore -= 12;
  if (averageLength > 24) clarityScore -= 8;
  if (averageLength > 0 && averageLength < 7) clarityScore -= 8;

  clarityScore = Math.max(0, Math.min(100, clarityScore));

  const advice = [];

  if (totalSentences < 3) {
    advice.push("Add more complete sentences to develop your idea.");
  }

  if (veryShortSentences.length) {
    advice.push("Some sentences are very short. Try adding details or reasons.");
  }

  if (longSentences.length) {
    advice.push("Some sentences are too long. Split them into shorter, clearer sentences.");
  }

  if (noVerbSentences.length) {
    advice.push("Some sentences may be incomplete. Check that each sentence has a clear verb.");
  }

  if (repeatedOpenings.length) {
    advice.push("Several sentences start with the same word. Try changing sentence openings.");
  }

  if (!hasVariety && totalSentences >= 3) {
    advice.push("Try mixing short, medium, and longer sentences for better sentence variety.");
  }

  if (!advice.length) {
    advice.push("Your sentence clarity looks good for a local rule-based check.");
  }

  return {
    totalSentences,
    averageLength,
    clarityScore,
    veryShortSentences,
    longSentences,
    noVerbSentences,
    repeatedOpenings,
    hasVariety,
    advice
  };
}


function renderSentenceQualityReport(text) {
  const feedbackBox = document.querySelector(".writing-feedback-preview");
  if (!feedbackBox) return;

  const quality = analyzeSentenceQuality(text);

  const html = `
    <div class="writing-report-section">
      <h4>Sentence Quality & Clarity</h4>

      <p>
        <span class="writing-good">Clarity Score</span>
        <small>${safeText(quality.clarityScore)}%</small>
      </p>

      <p>
        <span class="writing-good">Average Sentence Length</span>
        <small>${safeText(quality.averageLength)} words per sentence</small>
      </p>

      <p>
        <span class="${quality.hasVariety ? "writing-good" : "writing-warning"}">
          ${quality.hasVariety ? "✓" : "!"} Sentence Variety
        </span>
        <small>
          ${
            quality.hasVariety
              ? "Your sentence lengths show some variety."
              : "Try mixing short, medium, and longer sentences."
          }
        </small>
      </p>

      ${
        quality.veryShortSentences.length
          ? `
            <p>
              <span class="writing-warning">Very Short Sentences</span>
              <small>${safeText(quality.veryShortSentences.length)} sentence(s) may need more detail.</small>
            </p>
          `
          : `
            <p>
              <span class="writing-good">Short Sentence Check</span>
              <small>No very short sentence problem detected.</small>
            </p>
          `
      }

      ${
        quality.longSentences.length
          ? `
            <p>
              <span class="writing-warning">Long Sentences</span>
              <small>${safeText(quality.longSentences.length)} sentence(s) may be too long. Consider splitting them.</small>
            </p>
          `
          : `
            <p>
              <span class="writing-good">Long Sentence Check</span>
              <small>No very long sentence problem detected.</small>
            </p>
          `
      }

      ${
        quality.noVerbSentences.length
          ? `
            <p>
              <span class="writing-warning">Possible Incomplete Sentences</span>
              <small>${safeText(quality.noVerbSentences.length)} sentence(s) may be missing a clear verb.</small>
            </p>
          `
          : `
            <p>
              <span class="writing-good">Complete Sentence Check</span>
              <small>No obvious missing-verb sentence detected locally.</small>
            </p>
          `
      }

      ${
        quality.repeatedOpenings.length
          ? `
            <p>
              <span class="writing-warning">Repeated Sentence Openings</span>
              <small>
                ${quality.repeatedOpenings
                  .map(([word, count]) => `${safeText(word)} (${safeText(count)} times)`)
                  .join(", ")}
              </small>
            </p>
          `
          : `
            <p>
              <span class="writing-good">Sentence Openings</span>
              <small>No strong repeated opening pattern detected.</small>
            </p>
          `
      }

      <h4>Clarity Advice</h4>
      ${quality.advice.map(item => `
        <p>
          <span class="writing-good">Tip</span>
          <small>${safeText(item)}</small>
        </p>
      `).join("")}
    </div>
  `;

  feedbackBox.insertAdjacentHTML("beforeend", html);

  console.log("Sentence Quality report rendered:", quality);
}
function checkWritingGenre(text, type) {
  const lowerText = (text || "").toLowerCase();

  const checks = {
    opinion: [
      {
        label: "Clear opinion",
        passed:
          lowerText.includes("in my opinion") ||
          lowerText.includes("i believe") ||
          lowerText.includes("i think") ||
          lowerText.includes("from my point of view"),
        advice: "State your opinion clearly using phrases like: In my opinion, I believe, or I think."
      },
      {
        label: "Reasons",
        passed:
          lowerText.includes("because") ||
          lowerText.includes("reason") ||
          lowerText.includes("one reason"),
        advice: "Add at least one reason to support your opinion."
      },
      {
        label: "Example",
        passed:
          lowerText.includes("for example") ||
          lowerText.includes("for instance") ||
          lowerText.includes("such as"),
        advice: "Add an example to make your opinion stronger."
      },
      {
        label: "Conclusion",
        passed:
          lowerText.includes("in conclusion") ||
          lowerText.includes("to sum up") ||
          lowerText.includes("overall"),
        advice: "End your opinion writing with a clear conclusion."
      }
    ],

    forAgainst: [
      {
        label: "Arguments for",
        passed:
          lowerText.includes("on the one hand") ||
          lowerText.includes("advantage") ||
          lowerText.includes("benefit"),
        advice: "Add arguments for the topic using phrases like: On the one hand, one advantage is..."
      },
      {
        label: "Arguments against",
        passed:
          lowerText.includes("on the other hand") ||
          lowerText.includes("however") ||
          lowerText.includes("disadvantage"),
        advice: "Add arguments against the topic using contrast language."
      },
      {
        label: "Balanced conclusion",
        passed:
          lowerText.includes("to sum up") ||
          lowerText.includes("in conclusion") ||
          lowerText.includes("overall"),
        advice: "Finish with a balanced conclusion."
      }
    ],

    formalEmail: [
      {
        label: "Greeting",
        passed:
          lowerText.includes("dear") ||
          lowerText.includes("dear sir") ||
          lowerText.includes("dear madam"),
        advice: "Start your email with a formal greeting such as: Dear Sir/Madam."
      },
      {
        label: "Purpose",
        passed:
          lowerText.includes("i am writing") ||
          lowerText.includes("i would like") ||
          lowerText.includes("regarding"),
        advice: "State the purpose of the email clearly."
      },
      {
        label: "Polite request",
        passed:
          lowerText.includes("i would appreciate") ||
          lowerText.includes("could you") ||
          lowerText.includes("would you") ||
          lowerText.includes("please"),
        advice: "Use polite request language."
      },
      {
        label: "Closing",
        passed:
          lowerText.includes("yours faithfully") ||
          lowerText.includes("yours sincerely") ||
          lowerText.includes("kind regards") ||
          lowerText.includes("best regards"),
        advice: "End your email with a suitable formal closing."
      }
    ],

    report: [
      {
        label: "Report title / purpose",
        passed:
          lowerText.includes("report") ||
          lowerText.includes("the aim of this report") ||
          lowerText.includes("this report aims"),
        advice: "Start the report with a clear title or purpose."
      },
      {
        label: "Findings",
        passed:
          lowerText.includes("findings") ||
          lowerText.includes("first") ||
          lowerText.includes("second"),
        advice: "Add findings or clear points."
      },
      {
        label: "Recommendations",
        passed:
          lowerText.includes("recommend") ||
          lowerText.includes("recommendation") ||
          lowerText.includes("should"),
        advice: "Add recommendations at the end of the report."
      }
    ],

    article: [
      {
        label: "Engaging opening",
        passed:
          lowerText.includes("have you ever") ||
          lowerText.includes("nowadays") ||
          lowerText.includes("?"),
        advice: "Start your article with an engaging opening or question."
      },
      {
        label: "Main points",
        passed:
          lowerText.includes("first") ||
          lowerText.includes("one important") ||
          lowerText.includes("another"),
        advice: "Add clear main points."
      },
      {
        label: "Final message",
        passed:
          lowerText.includes("to sum up") ||
          lowerText.includes("in conclusion") ||
          lowerText.includes("finally"),
        advice: "End with a strong final message."
      }
    ],

    story: [
      {
        label: "Setting",
        passed:
          lowerText.includes("one day") ||
          lowerText.includes("it happened") ||
          lowerText.includes("when") ||
          lowerText.includes("where"),
        advice: "Set the scene by saying when and where the story happened."
      },
      {
        label: "Sequence of events",
        passed:
          lowerText.includes("then") ||
          lowerText.includes("after that") ||
          lowerText.includes("suddenly") ||
          lowerText.includes("in the end"),
        advice: "Use sequence words to organize events."
      },
      {
        label: "Problem or surprise",
        passed:
          lowerText.includes("suddenly") ||
          lowerText.includes("problem") ||
          lowerText.includes("surprised") ||
          lowerText.includes("afraid"),
        advice: "Add a problem, surprise, or turning point."
      },
      {
        label: "Ending",
        passed:
          lowerText.includes("in the end") ||
          lowerText.includes("finally") ||
          lowerText.includes("this taught me"),
        advice: "Finish the story clearly."
      }
    ],

    paragraph: [
      {
        label: "Main idea",
        passed:
          lowerText.length > 30,
        advice: "Start with a clear main idea."
      },
      {
        label: "Supporting detail",
        passed:
          lowerText.includes("because") ||
          lowerText.includes("one reason") ||
          lowerText.includes("also"),
        advice: "Add a supporting detail."
      },
      {
        label: "Example",
        passed:
          lowerText.includes("for example") ||
          lowerText.includes("for instance"),
        advice: "Add an example."
      },
      {
        label: "Conclusion",
        passed:
          lowerText.includes("in conclusion") ||
          lowerText.includes("therefore") ||
          lowerText.includes("finally"),
        advice: "End with a concluding sentence."
      }
    ]
  };

  return checks[type] || checks.paragraph;
}


function renderGenreAwareWritingCheck(text) {
  const feedbackBox = document.querySelector(".writing-feedback-preview");
  if (!feedbackBox) return;

  const selectedType =
    document.getElementById("writingTypeSelect")?.value || "paragraph";

  const typeLabel =
    typeof getWritingTypeLabel === "function"
      ? getWritingTypeLabel(selectedType)
      : selectedType;

  const genreChecks = checkWritingGenre(text, selectedType);
  const passedCount = genreChecks.filter(check => check.passed).length;
  const totalCount = genreChecks.length;
  const genreScore = Math.round((passedCount / totalCount) * 100);

  const html = `
    <div class="writing-report-section">
      <h4>Genre-Aware Writing Check</h4>

      <p>
        <span class="writing-good">Selected Genre</span>
        <small>${safeText(typeLabel)} — ${safeText(genreScore)}% genre match</small>
      </p>

      ${genreChecks.map(check => `
        <p>
          <span class="${check.passed ? "writing-good" : "writing-warning"}">
            ${check.passed ? "✓" : "!"} ${safeText(check.label)}
          </span>
          <small>${safeText(check.passed ? "Detected in your writing." : check.advice)}</small>
        </p>
      `).join("")}
    </div>
  `;

  feedbackBox.insertAdjacentHTML("beforeend", html);

  console.log("Genre-aware writing check rendered:", {
    selectedType,
    genreScore,
    passedCount,
    totalCount
  });
}
function detectWritingTopic(text) {
  const lowerText = (text || "").toLowerCase();

  const topicKeywords = {
    education: [
      "school", "student", "students", "teacher", "teachers", "class",
      "lesson", "lessons", "exam", "exams", "study", "studying",
      "homework", "education", "learn", "learning", "university"
    ],
    technology: [
      "technology", "internet", "online", "computer", "phone", "phones",
      "mobile", "app", "apps", "ai", "robot", "robots", "digital",
      "website", "social media", "device", "devices"
    ],
    environment: [
      "environment", "pollution", "climate", "recycling", "waste",
      "plastic", "water", "air", "trees", "nature", "planet",
      "global warming", "green", "clean"
    ],
    health: [
      "health", "healthy", "exercise", "sport", "sports", "food",
      "diet", "sleep", "stress", "doctor", "medicine", "mental",
      "body", "fitness"
    ],
    work: [
      "work", "job", "career", "company", "business", "employee",
      "manager", "interview", "skills", "professional", "office",
      "salary", "training"
    ],
    social_media: [
      "facebook", "instagram", "tiktok", "youtube", "snapchat",
      "social media", "followers", "posts", "comments", "likes",
      "online friends", "influencer"
    ],
    travel: [
      "travel", "tourism", "tourist", "trip", "journey", "hotel",
      "airport", "country", "city", "visit", "holiday", "vacation"
    ],
    family: [
      "family", "parents", "mother", "father", "brother", "sister",
      "home", "children", "child", "friends", "friendship"
    ]
  };

  const scores = {};

  Object.entries(topicKeywords).forEach(([topic, keywords]) => {
    scores[topic] = keywords.reduce((total, keyword) => {
      return lowerText.includes(keyword) ? total + 1 : total;
    }, 0);
  });

  const sortedTopics = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .filter(([, score]) => score > 0);

  if (!sortedTopics.length) {
    return {
      topic: "general",
      label: "General Writing",
      confidence: 0,
      scores
    };
  }

  const topTopic = sortedTopics[0][0];
  const topScore = sortedTopics[0][1];

  const labels = {
    education: "Education",
    technology: "Technology",
    environment: "Environment",
    health: "Health",
    work: "Work / Career",
    social_media: "Social Media",
    travel: "Travel / Tourism",
    family: "Family / Relationships",
    general: "General Writing"
  };

  return {
    topic: topTopic,
    label: labels[topTopic] || "General Writing",
    confidence: topScore,
    scores
  };
}


function getDynamicVocabularySuggestions(text, detectedTopic) {
  const lowerText = (text || "").toLowerCase();

  const generalSuggestions = [
    { weak: "good", better: "useful / effective / beneficial" },
    { weak: "bad", better: "harmful / negative / serious" },
    { weak: "very important", better: "essential / significant / crucial" },
    { weak: "a lot of", better: "many / numerous / a wide range of" },
    { weak: "things", better: "factors / aspects / points" },
    { weak: "help", better: "support / improve / contribute to" },
    { weak: "make better", better: "improve / develop / enhance" },
    { weak: "big", better: "major / significant / considerable" }
  ];

  const topicSuggestions = {
    education: [
      { weak: "students", better: "learners / pupils / school students" },
      { weak: "study", better: "learn / revise / acquire knowledge" },
      { weak: "school things", better: "educational resources / learning materials" },
      { weak: "good for students", better: "beneficial for learners" },
      { weak: "teacher helps", better: "the teacher supports / guides learners" }
    ],
    technology: [
      { weak: "phones", better: "digital devices / mobile devices" },
      { weak: "internet", better: "online resources / digital platforms" },
      { weak: "use technology", better: "integrate technology / use digital tools" },
      { weak: "apps", better: "educational applications / digital tools" },
      { weak: "ai", better: "artificial intelligence / AI-powered tools" }
    ],
    environment: [
      { weak: "trash", better: "waste / litter" },
      { weak: "dirty air", better: "air pollution" },
      { weak: "help the environment", better: "protect the environment" },
      { weak: "bad for nature", better: "harmful to the environment" },
      { weak: "clean the earth", better: "preserve the planet" }
    ],
    health: [
      { weak: "do sport", better: "exercise regularly / practise physical activity" },
      { weak: "good food", better: "healthy food / balanced diet" },
      { weak: "feel bad", better: "feel stressed / feel exhausted" },
      { weak: "sleep good", better: "sleep well / get enough sleep" },
      { weak: "body strong", better: "physical fitness / a healthy body" }
    ],
    work: [
      { weak: "job", better: "career / position / profession" },
      { weak: "work skills", better: "professional skills / workplace skills" },
      { weak: "boss", better: "manager / employer" },
      { weak: "ask for job", better: "apply for a position" },
      { weak: "good worker", better: "reliable employee / professional worker" }
    ],
    social_media: [
      { weak: "use social media", better: "spend time on social media platforms" },
      { weak: "bad comments", better: "negative comments / online criticism" },
      { weak: "many followers", better: "a large online audience" },
      { weak: "internet people", better: "online users / digital audience" },
      { weak: "posting things", better: "sharing content online" }
    ],
    travel: [
      { weak: "go to places", better: "visit destinations / travel to different places" },
      { weak: "nice place", better: "attractive destination / beautiful location" },
      { weak: "people who travel", better: "tourists / travelers" },
      { weak: "trip", better: "journey / travel experience" },
      { weak: "learn about countries", better: "explore different cultures" }
    ],
    family: [
      { weak: "family is good", better: "family support is valuable" },
      { weak: "friends help", better: "friends support and encourage each other" },
      { weak: "home life", better: "family life / home environment" },
      { weak: "nice friend", better: "supportive friend / loyal friend" },
      { weak: "talk with family", better: "communicate with family members" }
    ],
    general: []
  };

  const selectedTopicSuggestions = topicSuggestions[detectedTopic] || [];

  const allSuggestions = [
    ...selectedTopicSuggestions,
    ...generalSuggestions
  ];

  const matchedSuggestions = allSuggestions.filter(item =>
    lowerText.includes(item.weak)
  );

  return matchedSuggestions.slice(0, 8);
}


function renderDynamicWritingIntelligence(text) {
  const feedbackBox = document.querySelector(".writing-feedback-preview");
  if (!feedbackBox) return;

  const detected = detectWritingTopic(text);
  const suggestions = getDynamicVocabularySuggestions(text, detected.topic);

  const intelligenceHtml = `
    <div class="writing-report-section">
      <h4>Dynamic Writing Intelligence</h4>

      <p>
        <span class="writing-good">Detected Topic</span>
        <small>${safeText(detected.label)} ${
          detected.confidence
            ? "(confidence: " + safeText(detected.confidence) + ")"
            : "(low confidence)"
        }</small>
      </p>

      <h4>Topic Vocabulary Suggestions</h4>
      ${
        suggestions.length
          ? suggestions.map(item => `
              <p>
                <span class="writing-warning">${safeText(item.weak)}</span>
                <small>Try: ${safeText(item.better)}</small>
              </p>
            `).join("")
          : `<p>
              <span class="writing-good">No obvious topic vocabulary weakness detected.</span>
              <small>The system will give deeper vocabulary feedback when AI correction is connected.</small>
            </p>`
      }
    </div>
  `;

  feedbackBox.insertAdjacentHTML("beforeend", intelligenceHtml);

  console.log("Dynamic Writing Intelligence rendered:", detected);
}
function updateWritingSkillMap(skillScores) {
  const defaultScores = {
    grammar: 70,
    vocabulary: 70,
    connectors: 70,
    organization: 70,
    clarity: 70
  };

  const scores = {
    ...defaultScores,
    ...(skillScores || {})
  };

  const skillConfig = {
    grammar: {
      label: "Grammar",
      valueId: "skillGrammarValue",
      barId: "skillGrammarBar",
      lesson: "Subject-Verb Agreement and Tense Accuracy",
      mission: "Write 5 sentences using correct subject-verb agreement. Include singular and plural subjects."
    },
    vocabulary: {
      label: "Vocabulary",
      valueId: "skillVocabularyValue",
      barId: "skillVocabularyBar",
      lesson: "Upgrade Basic Vocabulary into Academic Vocabulary",
      mission: "Rewrite 5 simple sentences using stronger vocabulary instead of words like good, bad, things, and very important."
    },
    connectors: {
      label: "Connectors",
      valueId: "skillConnectorsValue",
      barId: "skillConnectorsBar",
      lesson: "Cause, Result, Contrast, and Example Connectors",
      mission: "Write a paragraph using at least 4 connectors: because, however, moreover, and for example."
    },
    organization: {
      label: "Organization",
      valueId: "skillOrganizationValue",
      barId: "skillOrganizationBar",
      lesson: "Paragraph Structure: Topic Sentence, Support, Example, Conclusion",
      mission: "Write one paragraph with a topic sentence, two supporting details, one example, and one concluding sentence."
    },
    clarity: {
      label: "Clarity",
      valueId: "skillClarityValue",
      barId: "skillClarityBar",
      lesson: "Clear Sentence Writing and Sentence Variety",
      mission: "Rewrite 5 long or unclear sentences into clear academic sentences."
    }
  };

  Object.entries(skillConfig).forEach(([key, config]) => {
    const value = Math.max(0, Math.min(scores[key], 100));

    const valueEl = document.getElementById(config.valueId);
    const barEl = document.getElementById(config.barId);

    if (valueEl) valueEl.textContent = value + "%";
    if (barEl) barEl.style.width = value + "%";
  });

  const weakestKey = Object.keys(skillConfig).sort((a, b) => {
    return scores[a] - scores[b];
  })[0];

  const strongestKey = Object.keys(skillConfig).sort((a, b) => {
    return scores[b] - scores[a];
  })[0];

  const weakest = skillConfig[weakestKey];
  const strongest = skillConfig[strongestKey];

  const weakestEl = document.getElementById("writingWeakestSkill");
  const lessonEl = document.getElementById("writingRecommendedLesson");
  const missionEl = document.getElementById("writingNextMission");

  if (weakestEl) {
    weakestEl.textContent = weakest.label + " (" + scores[weakestKey] + "%)";
  }

  if (lessonEl) {
    lessonEl.textContent = weakest.lesson;
  }

  if (missionEl) {
    missionEl.textContent =
      weakest.mission + " Strongest skill: " + strongest.label + ".";
  }

  localStorage.setItem("jakWritingRecommendedMission", weakest.mission);

  console.log("Writing Skill Map updated:", {
    scores,
    weakest: weakest.label,
    strongest: strongest.label
  });
}

function loadRecommendedWritingMission() {
  const input = document.getElementById("studentWritingInput");
  const mission =
    localStorage.getItem("jakWritingRecommendedMission") ||
    "Write a short paragraph using clear sentences, strong vocabulary, connectors, and a conclusion.";

  if (!input) return;

  input.value = mission + "\n\nWrite your answer here:\n\n";

  if (typeof scrollToWritingEditor === "function") {
    scrollToWritingEditor();
  }

  console.log("Recommended writing mission loaded:", mission);
}
function loadWritingPrompt() {
  const input = document.getElementById("studentWritingInput");
  if (!input) return;

  const prompts = [
    "Write an opinion paragraph about whether students should use technology in learning.",
    "Write a for-and-against paragraph about online education.",
    "Write a formal email to your teacher asking for advice before an exam.",
    "Write a short report about the most common study problems students face.",
    "Write a story that begins with: I opened the door and saw something strange."
  ];

  const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];

  input.value = randomPrompt + "\n\n";
  scrollToWritingEditor();

  console.log("Writing prompt loaded:", randomPrompt);
}

function clearWritingEditor() {
  const input = document.getElementById("studentWritingInput");
  if (!input) return;

  const confirmClear = confirm("Clear the writing editor?");
  if (!confirmClear) return;

  input.value = "";
  input.focus();
}

function showConnectorCategory(category) {
  const box = document.getElementById("connectorTrainerBox");
  if (!box) return;

  const connectorData = {
    contrast: {
      title: "Contrast Connectors",
      connectors: ["however", "although", "even though", "whereas", "but"],
      example: "Although she studied hard, she did not pass the exam.",
      tip: "Use contrast connectors when two ideas are different or surprising."
    },
    addition: {
      title: "Addition Connectors",
      connectors: ["moreover", "also", "in addition", "furthermore", "besides"],
      example: "Students should revise daily. Moreover, they should practise exam questions.",
      tip: "Use addition connectors to add another supporting idea."
    },
    cause: {
      title: "Cause & Effect Connectors",
      connectors: ["because", "therefore", "as a result", "so", "consequently"],
      example: "Many students sleep late. Therefore, they feel tired in class.",
      tip: "Use cause and effect connectors to explain reasons and results."
    },
    sequence: {
      title: "Sequence Connectors",
      connectors: ["first", "next", "then", "after that", "finally"],
      example: "First, read the question carefully. Then, plan your answer.",
      tip: "Use sequence connectors to organize steps or events."
    },
    conclusion: {
      title: "Conclusion Connectors",
      connectors: ["in conclusion", "to sum up", "overall", "in short"],
      example: "In conclusion, good habits help students improve their results.",
      tip: "Use conclusion connectors to finish your paragraph or essay clearly."
    }
  };

  const data = connectorData[category] || connectorData.contrast;

  box.innerHTML = `
    <h3>${safeText(data.title)}</h3>
    <p>${safeText(data.tip)}</p>

    <div class="connector-chip-row">
      ${data.connectors.map(connector => `<span>${safeText(connector)}</span>`).join("")}
    </div>

    <div class="connector-example">
      <span>${safeText(data.example)}</span>
    </div>

    <div class="connector-ai-tip">
      AI Tip: ${safeText(data.tip)}
    </div>
  `;
}
function getWritingTypeLabel(type) {
  const labels = {
    opinion: "Opinion Essay",
    forAgainst: "For & Against Essay",
    formalEmail: "Formal Email",
    report: "Report",
    article: "Article",
    story: "Narrative Writing",
    paragraph: "Paragraph"
  };

  return labels[type] || "Writing Task";
}

function getWritingGoalLabel(goal) {
  const labels = {
    grammar: "Grammar Accuracy",
    connectors: "Connectors",
    paragraph: "Paragraph Organization",
    vocabulary: "Vocabulary Upgrade",
    cohesion: "Cohesion & Clarity",
    fullEssay: "Full Essay Structure"
  };

  return labels[goal] || "Writing Skill";
}

function getWritingChecklist(type, goal) {
  const base = [
    "Clear main idea",
    "Correct sentence structure",
    "At least two supporting details",
    "Appropriate punctuation"
  ];

  const byType = {
    opinion: [
      "State your opinion clearly",
      "Give reasons for your opinion",
      "Use examples",
      "End with a clear conclusion"
    ],
    forAgainst: [
      "Present arguments for",
      "Present arguments against",
      "Use contrast connectors",
      "Give a balanced conclusion"
    ],
    formalEmail: [
      "Use a formal greeting",
      "State the purpose clearly",
      "Use polite language",
      "End with a formal closing"
    ],
    report: [
      "Use headings or clear sections",
      "Describe findings clearly",
      "Give recommendations",
      "Use objective language"
    ],
    article: [
      "Use an engaging title",
      "Open with an interesting introduction",
      "Use examples",
      "End with a strong final idea"
    ],
    story: [
      "Set the scene",
      "Introduce a problem",
      "Use sequence words",
      "End the story clearly"
    ],
    paragraph: [
      "Topic sentence",
      "Supporting sentence",
      "Example sentence",
      "Concluding sentence"
    ]
  };

  const byGoal = {
    grammar: ["Check subject-verb agreement", "Check tense consistency"],
    connectors: ["Use at least three connectors", "Use connectors with correct meaning"],
    paragraph: ["Use topic sentence + support + example + conclusion"],
    vocabulary: ["Replace basic words with stronger vocabulary"],
    cohesion: ["Make ideas flow logically"],
    fullEssay: ["Introduction, body paragraphs, conclusion"]
  };

  return [
    ...(byType[type] || base),
    ...(byGoal[goal] || [])
  ];
}

function generateWritingMission() {
 const type = document.getElementById("writingTypeSelect")?.value || "paragraph";
const level = document.getElementById("writingLevelSelect")?.value || "intermediate";
const learnerMode =document.getElementById("writingLearnerModeSelect")?.value || "school";
const goal = document.getElementById("writingGoalSelect")?.value || "paragraph";
  const topic =
    document.getElementById("writingTopicInput")?.value.trim() ||
    "technology in education";

  const output = document.getElementById("writingMissionOutput");
  const input = document.getElementById("studentWritingInput");

  const typeLabel = getWritingTypeLabel(type);
  const goalLabel = getWritingGoalLabel(goal);

 const modeInstructions = {
  young:
    `Write a simple and friendly task about "${topic}". Use short sentences, clear words, capital letters, and full stops.`,
  school:
    `Write a ${level} ${typeLabel.toLowerCase()} about "${topic}". Focus especially on ${goalLabel.toLowerCase()}.`,
  tawjihi:
    `Write an exam-style ${typeLabel.toLowerCase()} about "${topic}". Use clear organization, strong connectors, examples, and formal language.`,
  academic:
    `Write an academic ${typeLabel.toLowerCase()} about "${topic}". Use a clear thesis, logical argument, formal vocabulary, cohesion, and developed support.`,
  adult:
    `Write a professional ${typeLabel.toLowerCase()} about "${topic}". Use polite, practical, clear, and workplace-appropriate language.`,
  teacher:
    `Create a teacher-style writing practice task about "${topic}". Focus on teaching ${goalLabel.toLowerCase()} with a clear model and student-friendly instructions.`
};

const missionText =
  modeInstructions[learnerMode] ||
  modeInstructions.school;

  const checklist = getWritingChecklist(type, goal);

  if (output) {
    output.innerHTML = `
      <div class="writing-mission-card">
        <span class="writing-ai-chip">Generated Mission</span>
        <h3>${safeText(typeLabel)} Mission</h3>
        <p>${safeText(missionText)}</p>

        <div class="writing-checklist">
          ${checklist.map(item => `
            <label>
              <input type="checkbox">
              <span>${safeText(item)}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `;
  }

  if (input) {
    input.value = `${missionText}\n\nWrite your answer here:\n\n`;
    if (typeof scrollToWritingEditor === "function") {
      scrollToWritingEditor();
    }
  }
if (typeof updateWritingCommandCenter === "function") {
  updateWritingCommandCenter();
}
  console.log("Writing mission generated:", {
  type,
  level,
  learnerMode,
  goal,
  topic
});

}

function loadWritingTemplate() {
  const type = document.getElementById("writingTypeSelect")?.value || "paragraph";
  const level = document.getElementById("writingLevelSelect")?.value || "intermediate";
  const learnerMode =
    document.getElementById("writingLearnerModeSelect")?.value || "school";
  const goal = document.getElementById("writingGoalSelect")?.value || "paragraph";
  const topic =
    document.getElementById("writingTopicInput")?.value.trim() ||
    "technology in education";

  const input = document.getElementById("studentWritingInput");

  if (!input) {
    alert("Writing editor was not found.");
    return;
  }

  const typeLabel =
    typeof getWritingTypeLabel === "function"
      ? getWritingTypeLabel(type)
      : "Writing Task";

  const goalLabel =
    typeof getWritingGoalLabel === "function"
      ? getWritingGoalLabel(goal)
      : "Writing Skill";

  const blueprint =
    typeof buildAdaptiveWritingBlueprint === "function"
      ? buildAdaptiveWritingBlueprint({
          type,
          typeLabel,
          level,
          learnerMode,
          goal,
          goalLabel,
          topic
        })
      : `Smart Writing Blueprint

Writing Type: ${typeLabel}
Level: ${level}
Learner Mode: ${learnerMode}
Topic: ${topic}
Focus Skill: ${goalLabel}

Write your answer here:
`;

  input.value = blueprint;
if (typeof renderWritingBlueprintPreview === "function") {
  renderWritingBlueprintPreview({
    type,
    typeLabel,
    level,
    learnerMode,
    goal,
    goalLabel,
    topic
  });
}
  if (typeof scrollToWritingEditor === "function") {
    scrollToWritingEditor();
  }
if (typeof updateWritingCommandCenter === "function") {
  updateWritingCommandCenter();
}
  console.log("Smart Adaptive Writing Blueprint loaded:", {
    type,
    level,
    learnerMode,
    goal,
    topic
  });
}
function renderWritingBlueprintPreview(config) {
  const preview = document.getElementById("writingBlueprintPreview");
  if (!preview) return;

  const connectorPath =
    typeof getConnectorPathForBlueprint === "function"
      ? getConnectorPathForBlueprint(config.type, config.learnerMode)
      : [];

  const vocabularyBank =
    typeof getVocabularyBankForBlueprint === "function"
      ? getVocabularyBankForBlueprint(config.topic, config.learnerMode)
      : [];

  const mistakeWarnings =
    typeof getMistakeWarningsForBlueprint === "function"
      ? getMistakeWarningsForBlueprint(config.topic, config.learnerMode)
      : [];

  const draftBlocks =
    typeof getDraftBlocksForBlueprint === "function"
      ? getDraftBlocksForBlueprint(config.type, config.learnerMode, config.topic)
      : [];

  const modelOpening =
    typeof getModelOpeningForBlueprint === "function"
      ? getModelOpeningForBlueprint(config.type, config.learnerMode, config.topic)
      : "";

  const rubric =
    typeof getSuccessRubricForBlueprint === "function"
      ? getSuccessRubricForBlueprint(config.learnerMode, config.type)
      : [];

  preview.innerHTML = `
    <div class="blueprint-cards-grid">

      <div class="blueprint-card blueprint-identity-card">
        <span class="blueprint-label">Writing Identity</span>
        <h3>${safeText(config.typeLabel)}</h3>
        <p><strong>Topic:</strong> ${safeText(config.topic)}</p>
        <p><strong>Level:</strong> ${safeText(config.level)}</p>
        <p><strong>Mode:</strong> ${safeText(config.learnerMode)}</p>
        <p><strong>Focus:</strong> ${safeText(config.goalLabel)}</p>
      </div>

      <div class="blueprint-card">
        <span class="blueprint-label">Connector Path</span>
        <h3>Flow Map</h3>
        <div class="blueprint-chip-list">
          ${connectorPath.map(connector => `
            <span>${safeText(connector)}</span>
          `).join("")}
        </div>
      </div>

      <div class="blueprint-card">
        <span class="blueprint-label">Vocabulary Upgrade</span>
        <h3>Better Word Choices</h3>
        <div class="blueprint-vocab-list">
          ${vocabularyBank.map(row => `
            <p>
              <strong>${safeText(row.basic)}</strong>
              <span>→ ${safeText(row.stronger)} → ${safeText(row.advanced)}</span>
            </p>
          `).join("")}
        </div>
      </div>

      <div class="blueprint-card">
        <span class="blueprint-label">Mistake Prevention</span>
        <h3>Avoid These Errors</h3>
        <div class="blueprint-mistake-list">
          ${mistakeWarnings.slice(0, 3).map(item => `
            <div>
              <p class="wrong">❌ ${safeText(item.wrong)}</p>
              <p class="right">✅ ${safeText(item.correct)}</p>
              <small>${safeText(item.tip)}</small>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="blueprint-card blueprint-wide-card">
        <span class="blueprint-label">Guided Draft Blocks</span>
        <h3>Build Your Writing Step by Step</h3>
        <div class="blueprint-block-list">
          ${draftBlocks.map((block, index) => `
            <div class="blueprint-draft-block">
              <span>Block ${index + 1}</span>
              <h4>${safeText(block.title)}</h4>
              <p>${safeText(block.goal)}</p>
              <button type="button" onclick="sendBlueprintBlockToEditor('${safeText(block.starter).replace(/'/g, "\\'")}')">
                Use Starter
              </button>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="blueprint-card blueprint-wide-card">
        <span class="blueprint-label">Model Opening</span>
        <h3>Professional Starting Point</h3>
        <p>${safeText(modelOpening)}</p>
        <button type="button" class="gold" onclick="sendBlueprintBlockToEditor('${safeText(modelOpening).replace(/'/g, "\\'")}')">
          Use Model Opening
        </button>
      </div>

      <div class="blueprint-card blueprint-wide-card">
        <span class="blueprint-label">Success Rubric</span>
        <h3>Before Submitting, Check This</h3>
        <div class="blueprint-rubric-list">
          ${rubric.map(item => `
            <label>
              <input type="checkbox">
              <span>${safeText(item)}</span>
            </label>
          `).join("")}
        </div>
      </div>

    </div>
  `;

  console.log("Writing Blueprint Preview rendered.");
}

function sendBlueprintBlockToEditor(text) {
  const input = document.getElementById("studentWritingInput");
  if (!input) return;

  const current = input.value.trim();

  input.value = current
    ? current + "\n\n" + text
    : text;

  if (typeof scrollToWritingEditor === "function") {
    scrollToWritingEditor();
  }

  console.log("Blueprint block sent to editor.");
}
function updateWritingCommandCenter() {
  const learnerMode = document.getElementById("writingLearnerModeSelect")?.value || "school";
  const writingType = document.getElementById("writingTypeSelect")?.value || "paragraph";
  const focusSkill = document.getElementById("writingGoalSelect")?.value || "paragraph";
  const score = document.getElementById("writingScoreValue")?.textContent || "--";

  const learnerModeLabels = {
    young: "Young Learner",
    school: "School Student",
    tawjihi: "Tawjihi / Exam",
    academic: "Academic",
    adult: "Professional",
    teacher: "Teacher Practice"
  };

  const typeLabel =
    typeof getWritingTypeLabel === "function"
      ? getWritingTypeLabel(writingType)
      : writingType;

  const focusLabel =
    typeof getWritingGoalLabel === "function"
      ? getWritingGoalLabel(focusSkill)
      : focusSkill;

  const learnerEl = document.getElementById("commandLearnerMode");
  const typeEl = document.getElementById("commandWritingType");
  const focusEl = document.getElementById("commandFocusSkill");
  const scoreEl = document.getElementById("commandWritingScore");
  const nextEl = document.getElementById("commandNextStep");

  if (learnerEl) learnerEl.textContent = learnerModeLabels[learnerMode] || learnerMode;
  if (typeEl) typeEl.textContent = typeLabel;
  if (focusEl) focusEl.textContent = focusLabel;
  if (scoreEl) scoreEl.textContent = score === "--" ? "--" : score + "%";

  if (nextEl) {
    const recommendedMission =
      localStorage.getItem("jakWritingRecommendedMission") ||
      "Generate Mission";

    nextEl.textContent =
      recommendedMission.length > 28
        ? recommendedMission.slice(0, 28) + "..."
        : recommendedMission;
  }

  console.log("Writing Command Center updated.");
}

function buildAdaptiveWritingBlueprint(config) {
  const { type, typeLabel, level, learnerMode, goalLabel, topic } = config;

  const modeNames = {
    young: "Young Learner Studio 🌱",
    school: "School Writing Studio 🎒",
    tawjihi: "Exam Writing Studio 🎯",
    academic: "Academic Writing Studio 🎓",
    adult: "Professional Writing Studio 💼",
    teacher: "Teacher Design Studio 👨‍🏫"
  };

  const audienceMap = {
    young: "Young learner / beginner writer",
    school: "School student",
    tawjihi: "Examiner / Tawjihi-style reader",
    academic: "Academic reader / university instructor",
    adult: "Professional reader / workplace audience",
    teacher: "Teacher preparing a classroom writing task"
  };

  const toneMap = {
    young: "simple, friendly, clear",
    school: "clear, organized, student-appropriate",
    tawjihi: "formal, exam-ready, direct",
    academic: "formal, logical, evidence-based",
    adult: "polite, concise, professional",
    teacher: "instructional, practical, measurable"
  };

  const purposeMap = {
    opinion: "persuade the reader with a clear opinion",
    forAgainst: "present two sides of an issue fairly",
    formalEmail: "communicate politely and clearly",
    report: "present information, findings, and recommendations",
    article: "inform and engage the reader",
    story: "narrate events in an organized and interesting way",
    paragraph: "develop one clear main idea"
  };

  const connectorPath = getConnectorPathForBlueprint(type, learnerMode);
  const vocabularyBank = getVocabularyBankForBlueprint(topic, learnerMode);
  const mistakeWarnings = getMistakeWarningsForBlueprint(topic, learnerMode);
  const draftBlocks = getDraftBlocksForBlueprint(type, learnerMode, topic);
  const modelOpening = getModelOpeningForBlueprint(type, learnerMode, topic);
  const successRubric = getSuccessRubricForBlueprint(learnerMode, type);
  const aiReadyPrompt = getAiReadyPromptForBlueprint(config);

  return `SMART ADAPTIVE WRITING BLUEPRINT
${modeNames[learnerMode] || modeNames.school}

━━━━━━━━━━━━━━━━━━
1) WRITING IDENTITY
━━━━━━━━━━━━━━━━━━
Writing Type: ${typeLabel}
Level: ${level}
Topic: ${topic}
Focus Skill: ${goalLabel}
Purpose: ${purposeMap[type] || "write clearly and effectively"}
Audience: ${audienceMap[learnerMode] || audienceMap.school}
Tone: ${toneMap[learnerMode] || toneMap.school}

━━━━━━━━━━━━━━━━━━
2) BEFORE YOU WRITE
━━━━━━━━━━━━━━━━━━
Main idea:
I want to say that ________________________________.

Reader should understand:
________________________________.

My strongest reason / message:
________________________________.

━━━━━━━━━━━━━━━━━━
3) CONNECTOR PATH
━━━━━━━━━━━━━━━━━━
Use this path to make your writing flow naturally:
${connectorPath.map((connector, index) => `${index + 1}. ${connector}`).join("\n")}

━━━━━━━━━━━━━━━━━━
4) VOCABULARY UPGRADE BANK
━━━━━━━━━━━━━━━━━━
Basic → Stronger → Advanced
${vocabularyBank.map(row => `• ${row.basic} → ${row.stronger} → ${row.advanced}`).join("\n")}

━━━━━━━━━━━━━━━━━━
5) MISTAKES TO AVOID
━━━━━━━━━━━━━━━━━━
${mistakeWarnings.map(item => `❌ ${item.wrong}\n✅ ${item.correct}\nTip: ${item.tip}`).join("\n\n")}

━━━━━━━━━━━━━━━━━━
6) GUIDED DRAFT BLOCKS
━━━━━━━━━━━━━━━━━━
${draftBlocks.map((block, index) => `
BLOCK ${index + 1}: ${block.title}
Goal: ${block.goal}
Sentence starter: ${block.starter}
Your sentence:
________________________________.
Upgrade tip: ${block.tip}
`).join("\n")}

━━━━━━━━━━━━━━━━━━
7) MODEL OPENING
━━━━━━━━━━━━━━━━━━
${modelOpening}

━━━━━━━━━━━━━━━━━━
8) SUCCESS RUBRIC
━━━━━━━━━━━━━━━━━━
${successRubric.map(item => `☐ ${item}`).join("\n")}

━━━━━━━━━━━━━━━━━━
9) FINAL WRITING SPACE
━━━━━━━━━━━━━━━━━━
Now write your final version here:




━━━━━━━━━━━━━━━━━━
10) AI-READY FEEDBACK REQUEST
━━━━━━━━━━━━━━━━━━
${aiReadyPrompt}
`;
}


function getConnectorPathForBlueprint(type, learnerMode) {
  if (learnerMode === "young") {
    return ["First", "and", "because", "then", "finally"];
  }

  if (type === "forAgainst") {
    return [
      "On the one hand",
      "In addition",
      "On the other hand",
      "However",
      "To sum up"
    ];
  }

  if (type === "formalEmail") {
    return [
      "I am writing to",
      "Regarding",
      "In addition",
      "I would appreciate it if",
      "Thank you for"
    ];
  }

  if (type === "story") {
    return [
      "At first",
      "Then",
      "Suddenly",
      "After that",
      "In the end"
    ];
  }

  if (learnerMode === "academic") {
    return [
      "To begin with",
      "Furthermore",
      "For instance",
      "Consequently",
      "Overall"
    ];
  }

  if (learnerMode === "tawjihi") {
    return [
      "First of all",
      "Moreover",
      "For example",
      "As a result",
      "In conclusion"
    ];
  }

  return [
    "First",
    "Moreover",
    "For example",
    "However",
    "Therefore",
    "In conclusion"
  ];
}


function getVocabularyBankForBlueprint(topic, learnerMode) {
  if (learnerMode === "young") {
    return [
      { basic: "good", stronger: "nice", advanced: "helpful" },
      { basic: "bad", stronger: "not good", advanced: "harmful" },
      { basic: "like", stronger: "enjoy", advanced: "prefer" },
      { basic: "big", stronger: "large", advanced: "important" }
    ];
  }

  if (learnerMode === "academic") {
    return [
      { basic: "good", stronger: "useful", advanced: "beneficial" },
      { basic: "important", stronger: "significant", advanced: "essential" },
      { basic: "show", stronger: "demonstrate", advanced: "indicate" },
      { basic: "problem", stronger: "issue", advanced: "challenge" },
      { basic: "help", stronger: "support", advanced: "facilitate" }
    ];
  }

  if (learnerMode === "adult") {
    return [
      { basic: "ask", stronger: "request", advanced: "inquire about" },
      { basic: "tell", stronger: "inform", advanced: "notify" },
      { basic: "need", stronger: "require", advanced: "would appreciate" },
      { basic: "help", stronger: "support", advanced: "assistance" }
    ];
  }

  return [
    { basic: "good", stronger: "useful", advanced: "beneficial" },
    { basic: "bad", stronger: "negative", advanced: "harmful" },
    { basic: "very important", stronger: "important", advanced: "essential" },
    { basic: "a lot of", stronger: "many", advanced: "numerous" },
    { basic: "things", stronger: "points", advanced: "factors" },
    { basic: "get better", stronger: "improve", advanced: "make progress" }
  ];
}


function getMistakeWarningsForBlueprint(topic, learnerMode) {
  if (learnerMode === "young") {
    return [
      {
        wrong: "i like my school",
        correct: "I like my school.",
        tip: "Start with a capital letter and end with a full stop."
      },
      {
        wrong: "My school big.",
        correct: "My school is big.",
        tip: "Use a verb in every complete sentence."
      }
    ];
  }

  return [
    {
      wrong: "Technology have changed education.",
      correct: "Technology has changed education.",
      tip: "Singular subjects need singular verbs."
    },
    {
      wrong: "Students is learning online.",
      correct: "Students are learning online.",
      tip: "Plural subjects need plural verbs."
    },
    {
      wrong: "Online learning is good because good for students.",
      correct: "Online learning is beneficial because it gives students flexibility.",
      tip: "Avoid repeating weak words. Use stronger vocabulary."
    },
    {
      wrong: "I think online learning useful.",
      correct: "I think online learning is useful.",
      tip: "Use a complete sentence with a verb."
    }
  ];
}


function getDraftBlocksForBlueprint(type, learnerMode, topic) {
  if (type === "formalEmail") {
    return [
      {
        title: "Purpose",
        goal: "Say why you are writing.",
        starter: `I am writing to ask for information about ${topic}.`,
        tip: "Be polite and direct."
      },
      {
        title: "Details",
        goal: "Give the specific information you need.",
        starter: "I would like to know more about ____________________.",
        tip: "Use clear and practical details."
      },
      {
        title: "Polite Request",
        goal: "Ask politely for a reply or support.",
        starter: "I would appreciate it if you could ____________________.",
        tip: "Use polite expressions."
      },
      {
        title: "Closing",
        goal: "End the email professionally.",
        starter: "Thank you for your time and support.",
        tip: "Keep the ending short and respectful."
      }
    ];
  }

  if (type === "story") {
    return [
      {
        title: "Opening Scene",
        goal: "Tell when and where the story happened.",
        starter: "One day, ____________________.",
        tip: "Set the scene clearly."
      },
      {
        title: "Problem",
        goal: "Introduce something unexpected.",
        starter: "Suddenly, ____________________.",
        tip: "Make the reader interested."
      },
      {
        title: "Events",
        goal: "Explain what happened next.",
        starter: "After that, ____________________.",
        tip: "Use sequence words."
      },
      {
        title: "Ending",
        goal: "Finish the story clearly.",
        starter: "In the end, ____________________.",
        tip: "Show what changed or what was learned."
      }
    ];
  }

  if (type === "forAgainst") {
    return [
      {
        title: "Introduction",
        goal: "Introduce the topic and show there are two sides.",
        starter: `Many people have different opinions about ${topic}.`,
        tip: "Do not give your final opinion too early unless required."
      },
      {
        title: "Arguments For",
        goal: "Explain the advantages.",
        starter: "On the one hand, ____________________.",
        tip: "Support your point with an example."
      },
      {
        title: "Arguments Against",
        goal: "Explain the disadvantages.",
        starter: "On the other hand, ____________________.",
        tip: "Use contrast connectors."
      },
      {
        title: "Balanced Conclusion",
        goal: "Summarize both sides and give a balanced view.",
        starter: "To sum up, ____________________.",
        tip: "Make the conclusion clear and fair."
      }
    ];
  }

  return [
    {
      title: "Hook / Opening",
      goal: "Introduce the topic naturally.",
      starter:
        learnerMode === "academic"
          ? `The issue of ${topic} has become increasingly significant because ____________________.`
          : `Nowadays, ${topic} is an important topic because ____________________.`,
      tip: "Make the first sentence clear and connected to the topic."
    },
    {
      title: "Main Idea",
      goal: "State your opinion or controlling idea.",
      starter: "I believe that ____________________.",
      tip: "Do not be vague. Say exactly what you think."
    },
    {
      title: "Reason",
      goal: "Give a strong reason.",
      starter: "One major reason is that ____________________.",
      tip: "A reason should explain why your idea is true."
    },
    {
      title: "Example",
      goal: "Support your reason with an example.",
      starter: "For example, ____________________.",
      tip: "Examples make your writing more convincing."
    },
    {
      title: "Explanation",
      goal: "Explain why the example matters.",
      starter: "This shows that ____________________.",
      tip: "Do not just give an example; explain it."
    },
    {
      title: "Conclusion",
      goal: "Finish with a clear final idea.",
      starter: "In conclusion, ____________________.",
      tip: "Restate the main idea using different words."
    }
  ];
}


function getModelOpeningForBlueprint(type, learnerMode, topic) {
  if (learnerMode === "young") {
    return `I want to write about ${topic}. I think it is interesting because it is part of my life.`;
  }

  if (type === "formalEmail") {
    return `Dear Sir/Madam,

I am writing to ask for information about ${topic}. I would appreciate it if you could send me more details about this matter.`;
  }

  if (learnerMode === "academic") {
    return `The issue of ${topic} has become increasingly significant in modern education. This essay argues that it can have a powerful impact when it is used in a thoughtful and organized way.`;
  }

  if (learnerMode === "tawjihi") {
    return `Nowadays, ${topic} has become an important issue in students' lives. In my opinion, it can be very useful if it is used wisely and responsibly.`;
  }

  return `Nowadays, ${topic} is an important topic for many students. I believe that it can be useful because it helps learners develop better skills and habits.`;
}


function getSuccessRubricForBlueprint(learnerMode, type) {
  if (learnerMode === "young") {
    return [
      "Capital letters are used correctly.",
      "Full stops are used correctly.",
      "Sentences are simple and complete.",
      "The idea is easy to understand."
    ];
  }

  if (learnerMode === "tawjihi") {
    return [
      "The task is answered directly.",
      "The writing has clear paragraphs.",
      "There are examples and supporting details.",
      "Connectors are used accurately.",
      "Grammar and spelling are checked."
    ];
  }

  if (learnerMode === "academic") {
    return [
      "The thesis or main argument is clear.",
      "Ideas are logically developed.",
      "Academic vocabulary is used appropriately.",
      "Evidence or examples support the argument.",
      "Cohesion is clear throughout the text."
    ];
  }

  if (learnerMode === "adult") {
    return [
      "The purpose is clear.",
      "The tone is polite and professional.",
      "The message is concise.",
      "The request or information is complete.",
      "The closing is appropriate."
    ];
  }

  return [
    "The main idea is clear.",
    "The writing includes supporting details.",
    "At least two connectors are used.",
    "There is an example.",
    "There is a clear ending."
  ];
}


function getAiReadyPromptForBlueprint(config) {
  return `When AI feedback is connected, analyze this writing using:
- Learner mode: ${config.learnerMode}
- Writing type: ${config.typeLabel}
- Level: ${config.level}
- Focus skill: ${config.goalLabel}
- Topic: ${config.topic}

Give feedback on:
1. Grammar
2. Vocabulary
3. Connectors
4. Organization
5. Clarity
6. Task achievement
7. Improved version
8. Next practice mission`;
}

function buildSmartWritingTemplate(config) {
  const { type, typeLabel, level, learnerMode, goalLabel, topic } = config;

  const modeHeader = {
    young: "Young Learner Mode 🌱",
    school: "School Student Mode 🎒",
    tawjihi: "Exam Writing Mode 🎯",
    academic: "Academic Writing Mode 🎓",
    adult: "Professional Writing Mode 💼",
    teacher: "Teacher Practice Mode 👨‍🏫"
  };

  const modeInstruction = {
    young:
      "Use short, clear sentences. Focus on capital letters, full stops, and simple ideas.",
    school:
      "Write clearly with a topic sentence, supporting details, examples, and connectors.",
    tawjihi:
      "Write in an exam-ready style with clear organization, formal language, examples, and strong connectors.",
    academic:
      "Use a thesis-style main idea, logical argument, formal vocabulary, and strong cohesion.",
    adult:
      "Use practical, polite, professional language suitable for real-life communication.",
    teacher:
      "Design this as a teaching model with instructions, model language, and feedback criteria."
  };

  const connectorBank = {
    young: ["and", "but", "because", "then", "finally"],
    school: ["first", "moreover", "for example", "however", "therefore", "in conclusion"],
    tawjihi: ["in addition", "for instance", "on the other hand", "as a result", "to sum up"],
    academic: ["furthermore", "nevertheless", "consequently", "for instance", "overall"],
    adult: ["regarding", "in addition", "therefore", "I would appreciate", "please let me know"],
    teacher: ["learning objective", "model answer", "success criteria", "feedback focus"]
  };

  const successCriteria = {
    young: [
      "I used capital letters.",
      "I used full stops.",
      "I wrote simple complete sentences.",
      "My ideas are clear."
    ],
    school: [
      "I wrote a clear topic sentence.",
      "I added supporting details.",
      "I used at least two connectors.",
      "I ended with a concluding sentence."
    ],
    tawjihi: [
      "I answered the task directly.",
      "I organized ideas into clear paragraphs.",
      "I used formal language and strong connectors.",
      "I gave examples and avoided repetition."
    ],
    academic: [
      "I used a clear thesis or controlling idea.",
      "I developed ideas logically.",
      "I used formal academic vocabulary.",
      "My writing is cohesive and well-supported."
    ],
    adult: [
      "My tone is polite and professional.",
      "My purpose is clear.",
      "My sentences are concise.",
      "My request or message is practical and complete."
    ],
    teacher: [
      "The task has a clear learning objective.",
      "The model is student-friendly.",
      "The feedback criteria are clear.",
      "The practice is measurable."
    ]
  };

  const connectors = connectorBank[learnerMode] || connectorBank.school;
  const criteria = successCriteria[learnerMode] || successCriteria.school;

  const templatesByType = {
    paragraph: createParagraphScaffold(topic, learnerMode),
    opinion: createOpinionScaffold(topic, learnerMode),
    forAgainst: createForAgainstScaffold(topic, learnerMode),
    formalEmail: createEmailScaffold(topic, learnerMode),
    report: createReportScaffold(topic, learnerMode),
    article: createArticleScaffold(topic, learnerMode),
    story: createStoryScaffold(topic, learnerMode)
  };

  const body =
    templatesByType[type] ||
    createParagraphScaffold(topic, learnerMode);

  return `SMART WRITING SCAFFOLD
${modeHeader[learnerMode] || modeHeader.school}
Writing Type: ${typeLabel}
Level: ${level}
Topic: ${topic}
Focus Skill: ${goalLabel}

Writing Goal:
${modeInstruction[learnerMode] || modeInstruction.school}

Useful Connectors:
${connectors.map(connector => "• " + connector).join("\n")}

Success Criteria:
${criteria.map(item => "☐ " + item).join("\n")}

Guided Draft:
${body}

Self-Check Before Submitting:
☐ Did I answer the topic?
☐ Did I organize my ideas clearly?
☐ Did I use suitable connectors?
☐ Did I check grammar and punctuation?
☐ Can I improve one word or sentence?

Now write your final version below:
`;
}


function createParagraphScaffold(topic, learnerMode) {
  if (learnerMode === "young") {
    return `I want to write about ${topic}.

Sentence 1: ${topic} is important to me.
Sentence 2: I like it because ____________________.
Sentence 3: For example, ____________________.
Sentence 4: Finally, ____________________.`;
  }

  if (learnerMode === "academic") {
    return `Topic sentence:
${topic} is a significant issue because it affects how people think, learn, and communicate.

Supporting idea:
One important aspect is ____________________.

Evidence / example:
For instance, ____________________.

Explanation:
This shows that ____________________.

Concluding sentence:
Therefore, ${topic} should be understood as ____________________.`;
  }

  return `Topic sentence:
${topic} is an important topic because ____________________.

Supporting detail:
One reason is that ____________________.

Example:
For example, ____________________.

Explanation:
This means that ____________________.

Concluding sentence:
In conclusion, ____________________.`;
}


function createOpinionScaffold(topic, learnerMode) {
  if (learnerMode === "young") {
    return `My opinion:
I think ${topic} is ____________________.

Reason:
I think this because ____________________.

Example:
For example, ____________________.

Ending:
Finally, I believe ____________________.`;
  }

  if (learnerMode === "tawjihi") {
    return `Introduction:
Nowadays, ${topic} has become an important issue in society. Some people have different views about it, but I strongly believe that ____________________.

Body Paragraph 1:
The first reason is that ____________________.
For example, ____________________.
Moreover, ____________________.

Body Paragraph 2:
Another important reason is that ____________________.
This can be seen when ____________________.
As a result, ____________________.

Conclusion:
In conclusion, I believe that ____________________ because ____________________.`;
  }

  if (learnerMode === "academic") {
    return `Introduction:
The issue of ${topic} has attracted increasing attention because ____________________.
This essay argues that ____________________.

Argument 1:
A major reason for this position is ____________________.
For instance, ____________________.
This suggests that ____________________.

Argument 2:
Furthermore, ____________________.
This point is important because ____________________.

Conclusion:
Overall, the evidence suggests that ____________________.`;
  }

  return `Introduction:
In my opinion, ${topic} is ____________________.

Reason 1:
One reason is that ____________________.
For example, ____________________.

Reason 2:
Moreover, ____________________.
This is important because ____________________.

Conclusion:
In conclusion, I believe that ____________________.`;
}


function createForAgainstScaffold(topic, learnerMode) {
  if (learnerMode === "young") {
    return `Good side:
One good thing about ${topic} is ____________________.

Not good side:
One problem is ____________________.

My idea:
I think ____________________.`;
  }

  return `Introduction:
Many people have different opinions about ${topic}.

Arguments for:
On the one hand, ____________________.
For example, ____________________.
In addition, ____________________.

Arguments against:
On the other hand, ____________________.
However, ____________________.
Another disadvantage is ____________________.

Balanced conclusion:
To sum up, ${topic} has both advantages and disadvantages. In my view, ____________________.`;
}


function createEmailScaffold(topic, learnerMode) {
  if (learnerMode === "adult") {
    return `Subject: Request Regarding ${topic}

Dear Sir/Madam,

I hope this message finds you well.

I am writing to ask for information about ${topic}. I would appreciate it if you could provide details about ____________________.

In addition, I would like to know ____________________.

Thank you for your time and support. I look forward to hearing from you.

Kind regards,
____________________`;
  }

  if (learnerMode === "young") {
    return `Hi ____________________,

I want to tell you about ${topic}.

First, ____________________.
Then, ____________________.
Finally, ____________________.

Best wishes,
____________________`;
  }

  return `Dear Sir/Madam,

I am writing to ____________________ regarding ${topic}.

First of all, ____________________.
In addition, ____________________.
I would be grateful if ____________________.

Thank you for your time.

Yours faithfully,
____________________`;
}


function createReportScaffold(topic, learnerMode) {
  return `Report Title: ${topic}

Introduction:
The aim of this report is to describe ____________________.

Findings:
1. The first finding is that ____________________.
2. Another important finding is ____________________.
3. Many students/people also ____________________.

Recommendations:
I recommend that ____________________.
It would also be useful to ____________________.

Conclusion:
Overall, ____________________.`;
}


function createArticleScaffold(topic, learnerMode) {
  if (learnerMode === "young") {
    return `Title: ${topic}

Do you like ${topic}?

I think it is ____________________.
First, ____________________.
Also, ____________________.
Finally, ____________________.

What do you think?`;
  }

  return `Title: ____________________

Opening:
Have you ever thought about ${topic}?

Main idea:
Nowadays, ____________________.

Point 1:
One important point is that ____________________.
For example, ____________________.

Point 2:
Another point is ____________________.
Moreover, ____________________.

Ending:
To sum up, ____________________.`;
}


function createStoryScaffold(topic, learnerMode) {
  if (learnerMode === "young") {
    return `Title: My Story

One day, ____________________.
Then, ____________________.
Suddenly, ____________________.
I felt ____________________.
In the end, ____________________.`;
  }

  return `Opening:
I will never forget the day when ____________________.

Setting:
It happened in ____________________.
The weather was ____________________.

Problem:
Suddenly, ____________________.

Events:
At first, ____________________.
Then, ____________________.
After that, ____________________.

Ending:
In the end, ____________________.
This experience taught me that ____________________.`;
}

window.uploadTeacherResource = uploadTeacherResource;
function loadWritingStep(step) {
  const guide = document.getElementById("writingStepGuide");
  if (!guide) return;

  const steps = {
    mainIdea: {
      title: "Main Idea / Topic Sentence",
      text: "Write one clear sentence that tells the reader what your paragraph is about.",
      example: "Technology helps students learn more effectively."
    },
    support: {
      title: "Supporting Detail",
      text: "Add a detail that explains or supports your main idea.",
      example: "It gives students access to videos, exercises, and online resources."
    },
    example: {
      title: "Example",
      text: "Give a real example to make your idea stronger and clearer.",
      example: "For example, students can watch lessons again when they do not understand."
    },
    connector: {
      title: "Connector",
      text: "Use a linking word to connect ideas naturally.",
      example: "Moreover, however, therefore, for example, in conclusion."
    },
    conclusion: {
      title: "Concluding Sentence",
      text: "Finish the paragraph with a sentence that summarizes the main idea.",
      example: "Therefore, technology can be a powerful tool for education."
    }
  };

  const data = steps[step] || steps.mainIdea;

  guide.innerHTML = `
    <strong>${safeText(data.title)}</strong>
    <span>${safeText(data.text)}</span>
    <small>Example: ${safeText(data.example)}</small>
  `;
}

function buildSmartParagraph() {
  const mainIdea = document.getElementById("builderMainIdea")?.value.trim() || "";
  const support = document.getElementById("builderSupport")?.value.trim() || "";
  const example = document.getElementById("builderExample")?.value.trim() || "";
  const connector = document.getElementById("builderConnector")?.value || "Moreover";
  const conclusion = document.getElementById("builderConclusion")?.value.trim() || "";

  const preview = document.getElementById("smartParagraphPreview");

  const parts = [];

  if (mainIdea) {
    parts.push(mainIdea);
  }

  if (support) {
    parts.push(`${connector}, ${support}`);
  }

  if (example) {
    parts.push(example);
  }

  if (conclusion) {
    parts.push(conclusion);
  }

  const paragraph = parts.join(" ");

  if (preview) {
    preview.textContent = paragraph || "Build your paragraph to see a preview.";
  }

  const checkMainIdea = document.getElementById("checkMainIdea");
  const checkSupport = document.getElementById("checkSupport");
  const checkExample = document.getElementById("checkExample");
  const checkConnector = document.getElementById("checkConnector");
  const checkConclusion = document.getElementById("checkConclusion");

  if (checkMainIdea) checkMainIdea.checked = !!mainIdea;
  if (checkSupport) checkSupport.checked = !!support;
  if (checkExample) checkExample.checked = !!example;
  if (checkConnector) checkConnector.checked = !!support && !!connector;
  if (checkConclusion) checkConclusion.checked = !!conclusion;

  if (!paragraph) {
    alert("Please write at least one part of the paragraph first.");
    return;
  }

  console.log("Smart paragraph built:", paragraph);
}

function sendWorkspaceToEditor() {
  const preview = document.getElementById("smartParagraphPreview");
  const input = document.getElementById("studentWritingInput");

  if (!preview || !input) return;

  const paragraph = preview.textContent.trim();

  if (!paragraph || paragraph === "Build your paragraph to see a preview.") {
    alert("Build your paragraph first.");
    return;
  }

  input.value = paragraph;

  if (typeof scrollToWritingEditor === "function") {
    scrollToWritingEditor();
  }

  console.log("Smart paragraph sent to editor.");
}

function clearWritingWorkspace() {
  const ids = [
    "builderMainIdea",
    "builderSupport",
    "builderExample",
    "builderConclusion"
  ];

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const connector = document.getElementById("builderConnector");
  if (connector) connector.value = "Moreover";

  const preview = document.getElementById("smartParagraphPreview");
  if (preview) {
    preview.textContent = "Build your paragraph to see a preview.";
  }

  [
    "checkMainIdea",
    "checkSupport",
    "checkExample",
    "checkConnector",
    "checkConclusion"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });

  loadWritingStep("mainIdea");

  console.log("Writing workspace cleared.");
}
function loadWritingLesson(skill) {
  const viewer = document.getElementById("writingLessonViewer");
  if (!viewer) return;

  const lessons = {
    connectors: {
      title: "Connector Coach 🔗",
      badge: "Flow & Cohesion",
      explain:
        "Connectors help your ideas move smoothly from one sentence to another. Strong writing does not only contain correct sentences; it also shows relationships between ideas.",
      examples: [
        ["Addition", "Moreover, students can review lessons at any time."],
        ["Contrast", "However, online learning can be distracting."],
        ["Reason", "Students use technology because it gives them quick access to information."],
        ["Result", "As a result, learning becomes more flexible."],
        ["Example", "For example, learners can watch educational videos."]
      ],
      practice:
        "Write 5 sentences about your topic. Use: moreover, however, because, as a result, and for example.",
      starter:
        "Moreover, ____________________.\nHowever, ____________________.\nBecause ____________________, ____________________.\nAs a result, ____________________.\nFor example, ____________________."
    },

    vocabulary: {
      title: "Vocabulary Upgrade Lab 💎",
      badge: "Word Power",
      explain:
        "Strong vocabulary makes writing clearer, more mature, and more academic. The goal is not to use difficult words randomly, but to choose accurate words.",
      examples: [
        ["good", "beneficial / useful / effective"],
        ["bad", "harmful / negative / serious"],
        ["very important", "essential / significant / crucial"],
        ["a lot of", "many / numerous / a great number of"],
        ["things", "factors / aspects / points"]
      ],
      practice:
        "Rewrite 5 simple sentences using stronger vocabulary.",
      starter:
        "This idea is good. → This idea is ____________________.\nThere are a lot of problems. → There are ____________________ problems.\nThis is very important. → This is ____________________."
    },

    organization: {
      title: "Paragraph Organization Lab 🧱",
      badge: "Structure",
      explain:
        "A strong paragraph is not a group of random sentences. It has a clear topic sentence, supporting details, examples, explanation, and a concluding sentence.",
      examples: [
        ["Topic sentence", "Online learning can help students study more effectively."],
        ["Supporting detail", "It gives students access to lessons and resources at any time."],
        ["Example", "For example, students can watch recorded lessons again."],
        ["Explanation", "This helps them understand difficult ideas more clearly."],
        ["Conclusion", "Therefore, online learning can support students when it is used properly."]
      ],
      practice:
        "Write one organized paragraph using: topic sentence, support, example, explanation, and conclusion.",
      starter:
        "Topic sentence: ____________________.\nSupporting detail: ____________________.\nFor example, ____________________.\nThis means that ____________________.\nIn conclusion, ____________________."
    },

    grammar: {
      title: "Grammar Accuracy Clinic ✅",
      badge: "Accuracy",
      explain:
        "Grammar accuracy helps the reader trust your writing. Start by checking subject-verb agreement, tense consistency, modal verbs, and complete sentences.",
      examples: [
        ["Wrong", "Technology have changed education."],
        ["Correct", "Technology has changed education."],
        ["Wrong", "Students is learning online."],
        ["Correct", "Students are learning online."],
        ["Wrong", "Students can to improve."],
        ["Correct", "Students can improve."]
      ],
      practice:
        "Correct the sentences, then write 5 new sentences with correct subject-verb agreement.",
      starter:
        "Technology has ____________________.\nStudents are ____________________.\nPeople can ____________________.\nThere are many ____________________.\nLearning becomes ____________________."
    },

    clarity: {
      title: "Clarity & Sentence Variety Lab ✨",
      badge: "Style",
      explain:
        "Clear writing is easy to understand. Sentence variety makes your writing more interesting by mixing short, medium, and complex sentences.",
      examples: [
        ["Simple", "Online learning is useful."],
        ["Developed", "Online learning is useful because students can study at their own pace."],
        ["Complex", "Although online learning is useful, students need discipline to avoid distractions."],
        ["Improved clarity", "This method helps students review lessons, practise skills, and manage their time."]
      ],
      practice:
        "Rewrite 4 simple sentences into stronger sentences using because, although, and which.",
      starter:
        "Online learning is useful because ____________________.\nAlthough ____________________, ____________________.\nStudents need ____________________ which ____________________."
    }
  };

  const lesson = lessons[skill] || lessons.connectors;

  localStorage.setItem("jakCurrentWritingLesson", skill);
  localStorage.setItem("jakCurrentWritingLessonStarter", lesson.starter);

  viewer.innerHTML = `
    <span class="writing-ai-chip">${safeText(lesson.badge)}</span>
    <h3>${safeText(lesson.title)}</h3>
    <p>${safeText(lesson.explain)}</p>

    <div class="writing-lesson-section">
      <h4>Examples</h4>
      ${lesson.examples.map(example => `
        <div class="writing-lesson-example">
          <strong>${safeText(example[0])}</strong>
          <span>${safeText(example[1])}</span>
        </div>
      `).join("")}
    </div>

    <div class="writing-lesson-section">
      <h4>Micro Practice</h4>
      <p>${safeText(lesson.practice)}</p>
      <div class="writing-lesson-starter">${safeText(lesson.starter)}</div>
    </div>

    <div class="writing-lesson-actions">
      <button type="button" onclick="sendCurrentWritingLessonPracticeToEditor()">
        Send Practice to Editor ✍️
      </button>

      <button type="button" class="gold" onclick="loadRecommendedWritingMission()">
        Load Recommended Mission 🚀
      </button>
    </div>
  `;

  console.log("Writing lesson loaded:", skill);
}

function sendWritingLessonPracticeToEditor(text) {
  const input = document.getElementById("studentWritingInput");
  if (!input) return;

  input.value = text;

  if (typeof scrollToWritingEditor === "function") {
    scrollToWritingEditor();
  }

  console.log("Writing lesson practice sent to editor.");
}
function sendCurrentWritingLessonPracticeToEditor() {
  const starter = localStorage.getItem("jakCurrentWritingLessonStarter") || "";

  if (!starter) {
    alert("Please load a writing lesson first.");
    return;
  }

  if (typeof sendWritingLessonPracticeToEditor === "function") {
    sendWritingLessonPracticeToEditor(starter);
  }
}
document.addEventListener("change", (event) => {
  if (
    event.target &&
    (
      event.target.id === "writingLearnerModeSelect" ||
      event.target.id === "writingGoalSelect" ||
      event.target.id === "writingTypeSelect"
    )
  ) {
    if (typeof updateWritingSmartCoachPanel === "function") {
      updateWritingSmartCoachPanel();
    }
  }
});

window.loadTeacherResources = loadTeacherResources;
window.loadStudentResources = loadStudentResources;
window.clearStudentResourceFilters = clearStudentResourceFilters;
window.toggleResourcePremium = toggleResourcePremium;
window.deleteTeacherResource = deleteTeacherResource;
window.toggleResourceVisibility = toggleResourceVisibility;
window.createStudentSupportPlan = createStudentSupportPlan;
window.closeStudentSupportPlan = closeStudentSupportPlan;
window.copyStudentSupportPlan = copyStudentSupportPlan;
window.printStudentSupportPlan = printStudentSupportPlan;
window.saveStudentSupportPlan = saveStudentSupportPlan;
window.loadSavedSupportPlans = loadSavedSupportPlans;
window.loadMySupportPlans = loadMySupportPlans;
window.addSupportPlanTasksToPlanner = addSupportPlanTasksToPlanner;
window.getCurrentStudySystem = getCurrentStudySystem;
window.setCurrentStudySystem = setCurrentStudySystem;
window.getPlannerTasksByCurrentSystem = getPlannerTasksByCurrentSystem;
window.renderPlannerSystemContext = renderPlannerSystemContext;
window.updatePlannerTaskStatus = updatePlannerTaskStatus;

function showWritingV2Tab(tabName) {
  const screens = document.querySelectorAll("#writingAcademy [data-writing-v2-screen]");
  const tabs = document.querySelectorAll("#writingAcademy [data-writing-v2-tab]");

  screens.forEach(screen => {
    screen.classList.remove("active");
  });

  tabs.forEach(tab => {
    tab.classList.remove("active");
  });

  const activeScreen = document.querySelector(`#writingAcademy [data-writing-v2-screen="${tabName}"]`);
  const activeTab = document.querySelector(`#writingAcademy [data-writing-v2-tab="${tabName}"]`);

  if (activeScreen) {
    activeScreen.classList.add("active");
  }

  if (activeTab) {
    activeTab.classList.add("active");
  }

  if (typeof updateWritingSmartCoachPanel === "function") {
    updateWritingSmartCoachPanel();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("writingAcademy")) {
    showWritingV2Tab("overview");
  }
});

window.showWritingV2Tab = showWritingV2Tab;

function showWritingV3Screen(screenName) {
  const screens = document.querySelectorAll("#writingAcademy [data-writing-v3-view]");
  const tabs = document.querySelectorAll("#writingAcademy [data-writing-v3-screen]");

  screens.forEach(screen => {
    screen.classList.remove("active");
  });

  tabs.forEach(tab => {
    tab.classList.remove("active");
  });

  const activeScreen = document.querySelector(`#writingAcademy [data-writing-v3-view="${screenName}"]`);
  const activeTab = document.querySelector(`#writingAcademy [data-writing-v3-screen="${screenName}"]`);

  if (activeScreen) {
    activeScreen.classList.add("active");
  }

  if (activeTab) {
    activeTab.classList.add("active");
  }

  if (typeof updateWritingSmartCoachPanel === "function") {
    updateWritingSmartCoachPanel();
  }

  if (typeof renderWritingProgressSummary === "function") {
    renderWritingProgressSummary();
  }

  if (typeof updateWritingV3AnalyticsFromAttempts === "function") {
    updateWritingV3AnalyticsFromAttempts();
  }
  
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("writingAcademy")) {
    showWritingV3Screen("mission");
  }
});
 function updateWritingV3AnalyticsFromAttempts() {
  const attempts = JSON.parse(localStorage.getItem("jakWritingAttemptsV1") || "[]");

  const scoreBox = document.getElementById("writingScoreValue");
  const commandScoreBox = document.getElementById("commandWritingScore");

  const editorBars = {
    grammar: {
      bar: document.getElementById("editorGrammarBar"),
      value: document.getElementById("editorGrammarValue")
    },
    vocabulary: {
      bar: document.getElementById("editorVocabularyBar"),
      value: document.getElementById("editorVocabularyValue")
    },
    connectors: {
      bar: document.getElementById("editorConnectorsBar"),
      value: document.getElementById("editorConnectorsValue")
    },
    organization: {
      bar: document.getElementById("editorOrganizationBar"),
      value: document.getElementById("editorOrganizationValue")
    },
    clarity: {
      bar: document.getElementById("editorClarityBar"),
      value: document.getElementById("editorClarityValue")
    }
  };

  const skillMapBars = {
    grammar: {
      bar: document.getElementById("skillGrammarBar"),
      value: document.getElementById("skillGrammarValue")
    },
    vocabulary: {
      bar: document.getElementById("skillVocabularyBar"),
      value: document.getElementById("skillVocabularyValue")
    },
    connectors: {
      bar: document.getElementById("skillConnectorsBar"),
      value: document.getElementById("skillConnectorsValue")
    },
    organization: {
      bar: document.getElementById("skillOrganizationBar"),
      value: document.getElementById("skillOrganizationValue")
    },
    clarity: {
      bar: document.getElementById("skillClarityBar"),
      value: document.getElementById("skillClarityValue")
    }
  };

  const setSkillValue = (target, value) => {
    const safeValue = Number.isFinite(Number(value))
      ? Math.max(0, Math.min(100, Math.round(Number(value))))
      : null;

    if (target.bar) {
      target.bar.style.width = safeValue === null ? "0%" : `${safeValue}%`;
    }

    if (target.value) {
      target.value.textContent = safeValue === null ? "--" : `${safeValue}%`;
    }
  };

  const resetValues = () => {
    if (scoreBox) scoreBox.textContent = "--";
    if (commandScoreBox) commandScoreBox.textContent = "--";

    Object.values(editorBars).forEach(target => setSkillValue(target, null));
    Object.values(skillMapBars).forEach(target => setSkillValue(target, null));
  };

  if (!Array.isArray(attempts) || attempts.length === 0) {
    resetValues();
    return;
  }

  const latestAttempt = attempts[0];

  const score = Number(latestAttempt.score);

  if (scoreBox) {
    scoreBox.textContent = Number.isFinite(score) ? Math.round(score) : "--";
  }

  if (commandScoreBox) {
    commandScoreBox.textContent = Number.isFinite(score) ? `${Math.round(score)}%` : "--";
  }

  const skills =
    latestAttempt.skillScores ||
    latestAttempt.skills ||
    latestAttempt.skillBreakdown ||
    {};

  const fallbackScore = Number.isFinite(score) ? score : null;

  const normalizedSkills = {
    grammar: skills.grammar ?? latestAttempt.grammar ?? fallbackScore,
    vocabulary: skills.vocabulary ?? latestAttempt.vocabulary ?? fallbackScore,
    connectors: skills.connectors ?? latestAttempt.connectors ?? fallbackScore,
    organization: skills.organization ?? latestAttempt.organization ?? skills.paragraph ?? fallbackScore,
    clarity: skills.clarity ?? latestAttempt.clarity ?? skills.cohesion ?? fallbackScore
  };

  Object.keys(normalizedSkills).forEach(skill => {
    setSkillValue(editorBars[skill], normalizedSkills[skill]);
    setSkillValue(skillMapBars[skill], normalizedSkills[skill]);
  });
}

window.updateWritingV3AnalyticsFromAttempts = updateWritingV3AnalyticsFromAttempts;
window.showWritingV3Screen = showWritingV3Screen;

/* =====================================================
   Role-Based Navigation Visibility
   Safe patch: hide/show existing nav buttons without removing them
===================================================== */

function getNavButtonKey(button) {
  const text = (button.innerText || "").trim().toLowerCase();
  const onclick = button.getAttribute("onclick") || "";

  if (onclick.includes("showPage('home')")) return "home";
  if (onclick.includes("teachersPage")) return "teachers";
  if (onclick.includes("goDashboard")) return "dashboard";
  if (onclick.includes("login.html")) return "login";
  if (onclick.includes("studentExams")) return "exams";
  if (onclick.includes("openPlanner")) return "planner";
  if (onclick.includes("studySystem")) return "studySystem";
  if (onclick.includes("writingAcademy")) return "writing";
  if (onclick.includes("aiCenter")) return "aiCenter";
  if (onclick.includes("studentAssistant")) return "assistant";
  if (onclick.includes("games")) return "games";
  if (onclick.includes("dictionaries")) return "dictionaries";
  if (onclick.includes("premium")) return "premium";
  if (onclick.includes("leaderboard")) return "leaderboard";
  if (onclick.includes("logout")) return "logout";

  if (text.includes("home")) return "home";
  if (text.includes("teacher")) return "teachers";
  if (text.includes("dashboard")) return "dashboard";
  if (text.includes("login")) return "login";
  if (text.includes("exam")) return "exams";
  if (text.includes("planner")) return "planner";
  if (text.includes("study system")) return "studySystem";
  if (text.includes("writing")) return "writing";
  if (text.includes("ai")) return "aiCenter";
  if (text.includes("assistant")) return "assistant";
  if (text.includes("game")) return "games";
  if (text.includes("dictionary")) return "dictionaries";
  if (text.includes("premium")) return "premium";
  if (text.includes("leaderboard")) return "leaderboard";
  if (text.includes("logout")) return "logout";

  return "unknown";
}

function getVisibleNavKeysByRole(role, isLoggedIn) {
  const normalizedRole = String(role || "").toLowerCase();

  if (!isLoggedIn) {
    return ["home", "teachers", "login"];
  }

  // Admin / Super Admin should see all main platform sections
  if (normalizedRole.includes("super_admin") || normalizedRole.includes("admin")) {
    return [
      "home",
      "dashboard",
      "teachers",
      "exams",
      "planner",
      "studySystem",
      "writing",
      "aiCenter",
      "assistant",
      "games",
      "dictionaries",
      "premium",
      "leaderboard",
      "logout"
    ];
  }

  if (normalizedRole.includes("teacher")) {
    return [
      "home",
      "dashboard",
      "teachers",
      "exams",
      "planner",
      "studySystem",
      "writing",
      "aiCenter",
      "assistant",
      "games",
      "dictionaries",
      "premium",
      "leaderboard",
      "logout"
    ];
  }

  if (normalizedRole.includes("student")) {
    return [
      "home",
      "dashboard",
      "teachers",
      "exams",
      "planner",
      "studySystem",
      "writing",
      "assistant",
      "games",
      "dictionaries",
      "premium",
      "leaderboard",
      "logout"
    ];
  }

  return [
    "home",
    "dashboard",
    "exams",
    "planner",
    "writing",
    "premium",
    "logout"
  ];
}

async function getCurrentNavigationRoleSafe() {
  try {
    if (!client?.auth?.getUser) {
      return {
        isLoggedIn: false,
        role: null,
        email: null,
        error: "Supabase client auth is not available"
      };
    }

    const { data, error } = await client.auth.getUser();

    if (error) {
      return {
        isLoggedIn: false,
        role: null,
        email: null,
        error: error.message
      };
    }

    const user = data?.user || null;

    if (!user?.id) {
      return {
        isLoggedIn: false,
        role: null,
        email: null,
        error: null
      };
    }

    let role = null;
    let profile = null;
    let profileError = null;

    const byId = await client
      .from("profiles")
      .select("id, role, email, full_name, is_premium")
      .eq("id", user.id)
      .maybeSingle();

    if (!byId.error && byId.data) {
      profile = byId.data;
      role = profile.role || null;
    } else {
      profileError = byId.error;
    }

    if (!profile && user.email) {
      const byEmail = await client
        .from("profiles")
        .select("id, role, email, full_name, is_premium")
        .eq("email", user.email)
        .maybeSingle();

      if (!byEmail.error && byEmail.data) {
        profile = byEmail.data;
        role = profile.role || null;
        profileError = null;
      } else {
        profileError = byEmail.error;
      }
    }

    return {
      isLoggedIn: true,
      role: role ? String(role).toLowerCase().trim() : "student",
      email: user.email || profile?.email || null,
      error: profileError?.message || null
    };
  } catch (err) {
    return {
      isLoggedIn: false,
      role: null,
      email: null,
      error: err?.message || "Navigation role check failed"
    };
  }
}

window.getCurrentNavigationRoleSafe = getCurrentNavigationRoleSafe;

async function applyRoleBasedNavigation() {
  const nav = document.querySelector("header nav");

  if (!nav) {
    console.warn("Role navigation: header nav not found.");
    return;
  }

  const navState = await getCurrentNavigationRoleSafe();
  const visibleKeys = getVisibleNavKeysByRole(navState.role, navState.isLoggedIn);

  const buttons = Array.from(nav.querySelectorAll("button"));

  buttons.forEach((button) => {
    const key = getNavButtonKey(button);

    button.dataset.navKey = key;

    const shouldShow = visibleKeys.includes(key);

    button.style.display = shouldShow ? "" : "none";
    button.setAttribute("aria-hidden", shouldShow ? "false" : "true");
  });

  console.log("✅ Role-based navigation applied:", {
    isLoggedIn: navState.isLoggedIn,
    role: navState.role,
    email: navState.email,
    visibleKeys,
    hiddenCount: buttons.filter((button) => button.style.display === "none").length,
    visibleCount: buttons.filter((button) => button.style.display !== "none").length,
    error: navState.error
  });
}

window.applyRoleBasedNavigation = applyRoleBasedNavigation;

/* Run safely after page load */
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    if (typeof applyRoleBasedNavigation === "function") {
      applyRoleBasedNavigation();
    }
  }, 400);
});

// =========================
// Safe Local Study Assistant Fallback
// Prevents Ask button from breaking if no real AI backend is connected yet
// =========================
function localAssistant() {
  const input =
    document.getElementById("assistantInput") ||
    document.getElementById("studentAssistantInput") ||
    document.getElementById("assistantPrompt") ||
    document.querySelector("#studentAssistant textarea") ||
    document.querySelector("#studentAssistant input");

  const output =
    document.getElementById("assistantOutput") ||
    document.getElementById("studentAssistantOutput") ||
    document.getElementById("assistantResponse") ||
    document.querySelector("#studentAssistant .assistant-output") ||
    document.querySelector("#studentAssistant .result-box") ||
    document.querySelector("#studentAssistant .box:last-child");

  const question = input?.value?.trim() || "";

  if (!output) {
    alert("Assistant output box is missing.");
    return;
  }

  if (!question) {
    output.innerHTML = `
      <div class="box">
        <h3>Study Assistant 🤖</h3>
        <p>Please write a question first.</p>
      </div>
    `;
    return;
  }

  output.innerHTML = `
    <div class="box">
      <h3>Study Assistant 🤖</h3>
      <p><strong>Your question:</strong> ${safeText(question)}</p>
      <p>This is a local study helper. Full AI responses will be connected later through a secure backend.</p>
      <ul>
        <li>Identify the lesson or topic first.</li>
        <li>Review the rule or example related to your question.</li>
        <li>If it is grammar, write the sentence and underline the confusing part.</li>
        <li>If it is studying, turn it into one clear 20-minute task.</li>
      </ul>
    </div>
  `;
}

window.localAssistant = localAssistant;