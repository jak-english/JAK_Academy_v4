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
  const plans = getPlans();

  const updatedPlans = plans.map(plan => {
    if (plan.id === planId) {
      return {
        ...plan,
        status: newStatus
      };
    }

    return plan;
  });

  localStorage.setItem("jakPlansV5", JSON.stringify(updatedPlans));

  loadPlans();
  renderCalendar();
  updatePlannerStats();
  renderTodayTasks();

  if (typeof renderStudyAnalytics === "function") {
    renderStudyAnalytics();
  }
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
  if (!$('plannerStats')) return;
  const plans = getPlans();
  const total = plans.length;
  const done = plans.filter(p => p.status === "done").length;
  const progress = total ? Math.round((done / total) * 100) : 0;
  plannerStats.innerHTML = `
    <div class="box"><h3>Total Tasks</h3><p>${total}</p></div>
    <div class="box"><h3>Completed</h3><p>${done}</p></div>
    <div class="box"><h3>Progress</h3><p>${progress}%</p><div class="progress"><span style="width:${progress}%"></span></div></div>
  `;
}

function renderCalendar() {
  if (!$('calendarView')) return;
  const plans = getPlans();
  const filter = $("subjectFilter")?.value.trim().toLowerCase() || "";
  const filtered = filter ? plans.filter(p => p.subject.toLowerCase().includes(filter)) : plans;

  calendarView.innerHTML = filtered.length ? '<div class="calendar-grid"></div>' : "No plans yet";
  const grid = calendarView.querySelector(".calendar-grid");
  if (!grid) return;

  const grouped = {};
  filtered.forEach(p => {
    if (!grouped[p.date]) grouped[p.date] = [];
    grouped[p.date].push(p);
  });

  Object.keys(grouped).sort().forEach(date => {
    const day = document.createElement("div");
    day.className = "calendar-day";
    day.innerHTML = "<b>📅 " + date + "</b>";

    grouped[date].sort((a, b) => a.start.localeCompare(b.start)).forEach(p => {
      day.innerHTML += `
        <div class="mini-plan ${safeText(p.type)}" style="background:${p.color || getSubjectColor(p.subject)}">
          <b>${safeText(p.subject)}</b><br>
          ${safeText(p.start)} → ${safeText(p.end)}<br>
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
  const tasks = getPlans().filter(p => p.date === today).sort((a, b) => a.start.localeCompare(b.start));
  target.innerHTML = tasks.length ? "" : "No tasks for today";
  tasks.forEach(p => {
    const div = document.createElement("div");
    div.className = "mini-plan";
    div.style.background = p.color || getSubjectColor(p.subject);
    div.innerHTML = `<b>${safeText(p.subject)}</b> | ${safeText(p.start)} → ${safeText(p.end)}<br>${safeText(p.task)}<br><small>${statusLabel(p.status)}</small>`;
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

  if (methodKey === "pomodoro") {
    let currentTime = start;

    for (let i = 1; i <= sessions; i++) {
      const studyEnd = addMinutesToTime(currentTime, sessionMinutes);
      const breakEnd = addMinutesToTime(studyEnd, breakMinutes);

      scheduleHtml += `
        <div class="mini-plan">
          <strong>Pomodoro Session ${i}</strong><br>
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

    scheduleHtml = reviewSteps.map((step, index) => `
      <div class="mini-plan">
        <strong>Review ${index + 1}</strong><br>
        ${safeText(step)}<br>
        Topic: ${safeText(subject)}
      </div>
    `).join("");
  }

  else if (methodKey === "activeRecall") {
    for (let i = 1; i <= sessions; i++) {
      scheduleHtml += `
        <div class="mini-plan">
          <strong>Active Recall Round ${i}</strong><br>
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

      scheduleHtml += `
        <div class="mini-plan">
          <strong>${safeText(day)} - Block ${index + 1}</strong><br>
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

    scheduleHtml = `
      <div class="mini-plan">
        <strong>Deep Work Block</strong><br>
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
    const weeklyDays = days.length ? days : ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday"];

    scheduleHtml = weeklyDays.map((day, index) => `
      <div class="mini-plan">
        <strong>${safeText(day)}</strong><br>
        ${safeText(subject)} - Session ${index + 1}<br>
        Focus: lesson review + practice questions.
      </div>
    `).join("");
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
        Choose ${safeText(subject)} and explain it in very simple words.
      </div>

      <div class="mini-plan">
        <strong>Feynman Step 2</strong><br>
        Find the part you cannot explain clearly.
      </div>

      <div class="mini-plan">
        <strong>Feynman Step 3</strong><br>
        Restudy that weak part, then explain it again.
      </div>
    `;
  }

  else if (methodKey === "cornell") {
    scheduleHtml = `
      <div class="mini-plan">
        <strong>Cornell Notes Layout</strong><br>
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
        Create cards for ${safeText(subject)}.<br>
        Correct cards move forward. Wrong cards stay for daily review.
      </div>

      <div class="mini-plan">
        <strong>Review System</strong><br>
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
        Write your wrong answer, the correct answer, and why the mistake happened.
      </div>

      <div class="mini-plan">
        <strong>Weekly Review</strong><br>
        Review all repeated mistakes before solving new questions.
      </div>
    `;
  }

  else if (methodKey === "mindMap") {
    scheduleHtml = `
      <div class="mini-plan">
        <strong>Mind Map Plan</strong><br>
        Put ${safeText(subject)} in the center.<br>
        Add branches for rules, examples, keywords, and common mistakes.
      </div>
    `;
  }

  else {
    scheduleHtml = `
      <div class="mini-plan">
        <strong>${safeText(method?.title || "Study Plan")}</strong><br>
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
  const plans = getPlannerData();

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
  cardsBox.innerHTML = `
    <div class="box analytics-card-box">
      <h2>Total Plans</h2>
      <p>${safeText(totalPlans)}</p>
      <span>All saved study tasks</span>
    </div>
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

function setCurrentStudySystem(system) {
  const selectedSystem = system || "all";

  localStorage.setItem("jakCurrentStudySystem", selectedSystem);

  if (typeof renderPlannerSystemContext === "function") {
    renderPlannerSystemContext();
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

  console.log("Current Study System:", selectedSystem);
}

function getPlannerTasksByCurrentSystem() {
  const currentSystem = getCurrentStudySystem();
  const plans = getPlannerData();

  if (currentSystem === "all") {
    return plans;
  }

  return plans.filter(plan =>
    plan.system === currentSystem ||
    plan.source === currentSystem
  );
}

function renderPlannerSystemContext() {
  const box = document.getElementById("plannerSystemContext");
  if (!box) return;

  const currentSystem = getCurrentStudySystem();

  const labels = {
    all: "All Tasks 🌐",
    support_plan: "Support Plan 📘",
    pomodoro: "Pomodoro ⏱️",
    active_recall: "Active Recall 🧠",
    spaced: "Spaced Repetition 🔁",
    manual: "Manual Tasks ✍️"
  };

  box.innerHTML = `
    <div class="box planner-system-context-card">
      <span class="badge">Smart Planner Auto-Switch</span>
      <h2>${safeText(labels[currentSystem] || currentSystem)}</h2>
      <p>The planner is now showing the selected study context without deleting or changing old tasks.</p>

      <div class="actions">
        <button type="button" onclick="setCurrentStudySystem('all')">All 🌐</button>
        <button type="button" class="gold" onclick="setCurrentStudySystem('support_plan')">Support Plan 📘</button>
        <button type="button" class="secondary" onclick="setCurrentStudySystem('pomodoro')">Pomodoro ⏱️</button>
        <button type="button" class="secondary" onclick="setCurrentStudySystem('active_recall')">Active Recall 🧠</button>
        <button type="button" class="secondary" onclick="setCurrentStudySystem('spaced')">Spaced Review 🔁</button>
        <button type="button" class="secondary" onclick="setCurrentStudySystem('manual')">Manual ✍️</button>
      </div>
    </div>
  `;
}
window.uploadTeacherResource = uploadTeacherResource;
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
window.saveStudentSupportPlan = saveStudentSupportPlan;window.saveStudentSupportPlan = saveStudentSupportPlan;
window.loadSavedSupportPlans = loadSavedSupportPlans;
window.loadMySupportPlans = loadMySupportPlans;
window.addSupportPlanTasksToPlanner = addSupportPlanTasksToPlanner;
window.getCurrentStudySystem = getCurrentStudySystem;
window.setCurrentStudySystem = setCurrentStudySystem;
window.getPlannerTasksByCurrentSystem = getPlannerTasksByCurrentSystem;
window.renderPlannerSystemContext = renderPlannerSystemContext;