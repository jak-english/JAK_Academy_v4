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
    p.className = "question-pill";
    if (i === currentQuestionIndex) p.classList.add("active");
    if (studentAnswers[q.id]) p.classList.add("answered");
    if (reviewLater[q.id]) p.classList.add("review");
    p.textContent = i + 1;
    p.title = reviewLater[q.id] ? "Marked for review" : "";
    p.onclick = () => {
      currentQuestionIndex = i;
      renderSolver();
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
      alert("You still have unanswered questions: " + unanswered.join(", ") + ". Please answer them before submitting.");
      return;
    }
    if (!confirm("Submit exam now?")) return;
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
  const percentage = Math.round((correct / total) * 100);
  await saveExamResult(correct, total, percentage, answers);

  resultTitle.textContent = currentPreviewExam.title || "Result";
  scoreText.textContent = `Your score: ${correct} / ${total} (${percentage}%)`;
  studyAdviceAfterResult.innerHTML = getStudyAdvice(percentage);
  resultDetails.innerHTML = "";

  answers.forEach((a, i) => {
    const div = document.createElement("div");
    div.className = "box " + (a.is_correct ? "correct" : "wrong");
    div.innerHTML = `
      <h3>${i + 1}. ${safeText(a.question_text)}</h3>
      <p><b>Status:</b> ${a.is_correct ? "✅ Correct" : "❌ Wrong"}</p>
      <p><b>Your answer:</b> ${a.student_answer || "No answer"} - ${safeText(a.student_answer_text)}</p>
      <p><b>Correct answer:</b> ${a.correct_answer} - ${safeText(a.correct_answer_text)}</p>
      <p><b>Explanation:</b> ${safeText(a.explanation) || "-"}</p>
    `;
    resultDetails.appendChild(div);
  });

  showPage("examResult");
}

function getStudyAdvice(p) {
  if (p < 50) return "<h2>Study Advice</h2><p>Review basics first: grammar rules, vocabulary meanings, and solve easy questions again.</p>";
  if (p < 80) return "<h2>Study Advice</h2><p>Good work. Focus on your mistakes and practise timed questions.</p>";
  return "<h2>Study Advice</h2><p>Excellent. Move to advanced questions and teach the idea to someone else.</p>";
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

  // 1) Load exam results
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

  // 2) Apply filter
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

  // 3) Sort filtered results
  results.sort((a, b) => {
    const percentageDiff = Number(b.percentage || 0) - Number(a.percentage || 0);
    if (percentageDiff !== 0) return percentageDiff;

    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;

    const dateA = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
    const dateB = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
    return dateB - dateA;
  });

  // 4) Collect student IDs
  const studentIds = [
    ...new Set(
      results
        .map(result => result.student_id)
        .filter(Boolean)
    )
  ];

  // 5) Load profiles separately
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

  // 6) Teacher results summary based on the selected filter
  const totalSubmissions = results.length;

  const percentages = results.map(result => Number(result.percentage || 0));

  const averageScore = Math.round(
    percentages.reduce((sum, value) => sum + value, 0) / totalSubmissions
  );

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

  const topProfile = profilesMap[topResult.student_id];

  const topStudentName =
    topProfile?.full_name ||
    topProfile?.email ||
    topResult.student_id ||
    "Unknown Student";

  const below50Count = results.filter(result => Number(result.percentage || 0) < 50).length;

  const filterTitle =
    filter === "passed" ? "Passed Students" :
    filter === "failed" ? "Failed Students" :
    filter === "best" ? "Best Result Per Student" :
    "All Results";

  if (summary) {
    summary.innerHTML = `
      <h3>Teacher Analytics Summary 📊</h3>

      <p><strong>Current Filter:</strong> ${safeText(filterTitle)}</p>
      <p><strong>Total Shown:</strong> ${safeText(totalSubmissions)}</p>
      <p><strong>Average Score:</strong> ${safeText(averageScore)}%</p>
      <p><strong>Top Student:</strong> ${safeText(topStudentName)}</p>
      <p><strong>Students Below 50%:</strong> ${safeText(below50Count)}</p>
    `;
  }

  if (status) {
    status.textContent = "Results loaded: " + results.length + " | Filter: " + filterTitle;
  }

  // 7) Render results
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

    const d = document.createElement("div");
    d.className = "box";

    d.innerHTML = `
      <h3>${safeText(studentName)}</h3>
      <p><strong>Exam:</strong> ${safeText(examTitle)}</p>
      <p><strong>Score:</strong> ${safeText(score)}/${safeText(total)} (${safeText(percentage)}%)</p>
      <p><strong>Submitted:</strong> ${safeText(submittedDate)}</p>
    `;

    list.appendChild(d);
  });
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

  // 🔥 dashboard
  if (window.location.hash === "#dashboard") {
    goDashboard();
  }

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
});

// =========================
// Advanced Study Planner + Colored Calendar
// =========================
function openPlanner() {
  showPage("planner");
  loadPlans();
  renderCalendar();
  updatePlannerStats();
  renderTodayTasks();
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
  if (!$('plansList')) return;
  const plans = getPlans().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  plansList.innerHTML = plans.length ? "" : "No plans yet";

  plans.forEach((p, i) => {
    const d = document.createElement("div");
    d.className = "box plan-card";
    d.style.borderLeft = `8px solid ${p.color || getSubjectColor(p.subject)}`;
    d.innerHTML = `
      <span class="badge">${safeText(p.type)}</span>
      <h3>${safeText(p.subject)}</h3>
      <p>📅 ${safeText(p.date)}</p>
      <p>⏰ ${safeText(p.start)} → ${safeText(p.end)}</p>
      <p>${safeText(p.task)}</p>
      <p><b>Status:</b> ${statusLabel(p.status)}</p>
      <div class="actions">
        <button class="success" onclick="updatePlanStatus(${i}, 'done')">Done</button>
        <button class="gold" onclick="updatePlanStatus(${i}, 'in_progress')">In Progress</button>
        <button class="danger" onclick="deletePlan(${i})">Delete</button>
      </div>
    `;
    plansList.appendChild(d);
  });
}

function updatePlanStatus(index, status) {
  const plans = getPlans();
  if (!plans[index]) return;
  plans[index].status = status;
  savePlans(plans);
  loadPlans();
  renderCalendar();
  updatePlannerStats();
  renderTodayTasks();
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