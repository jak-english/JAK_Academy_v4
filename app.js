const supabaseUrl = "https://bvvgfsogkzaikpraluof.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dmdmc29na3phaWtwcmFsdW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjYwMDAsImV4cCI6MjA5MjYwMjAwMH0.Rv4gjwqFA_ZVyice9JBV7sf81alsZb3PmB3lVtS4Xjo";
const client = window.supabase.createClient(supabaseUrl, supabaseKey);

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

const $ = (id) => document.getElementById(id);
const safeText = (value) => (value === null || value === undefined ? "" : String(value));

function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const page = $(id);
  if (page) page.classList.add("active");
}

async function getCurrentUser() {
  const { data } = await client.auth.getUser();
  return data.user || null;
}

function getRoleFromUser(user) {
  return user?.user_metadata?.role || user?.app_metadata?.role || "student";
}

async function goDashboard() {
  const user = await getCurrentUser();

  if (!user) {
    location.href = "login.html";
    return;
  }

  const { data: profile } = await client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const role =
    profile?.role ||
    user?.user_metadata?.role ||
    "student";

  const name =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "User";

  displayUserName({
    ...user,
    user_metadata: { full_name: name }
  });

  if (role === "admin" || role === "super_admin") {
    showPage("superAdminDashboard");
    loadAdminOverview();
    return;
  }

  if (role === "teacher") {
    showPage("teacherDashboard");
    loadTeacherExams();
    loadTeacherResults();
    return;
  }

  showPage("studentDashboard");
  loadStudentDashboard();
  loadStudentExams();
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
async function createExam() {
  const title = $("examTitle")?.value.trim();
  const description = $("examDesc")?.value.trim();
  const timeLimit = Number($("examTime")?.value || 10);

  if (!title) {
    examMsg.textContent = "Please enter title";
    return;
  }

  const user = await getCurrentUser();
  if (!user) {
    examMsg.textContent = "Login first";
    return;
  }

  examMsg.textContent = "Creating...";

  const r = await client.from("exams").insert([{ title, description, time_limit: timeLimit, teacher_id: user.id }]);

  if (r.error) {
    examMsg.textContent = r.error.message;
    console.error(r.error);
    return;
  }

  examMsg.textContent = "Exam created ✅";
  examTitle.value = "";
  examDesc.value = "";
  examTime.value = 10;
  loadTeacherExams();
}

async function loadTeacherExams() {
  if (!$('teacherExamList')) return;
  teacherExamList.innerHTML = "Loading...";

  const user = await getCurrentUser();
  if (!user) return;

  const r = await client
    .from("exams")
    .select("*")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  if (r.error) {
    teacherExamList.innerHTML = "Error";
    console.error(r.error);
    return;
  }

  const rows = r.data || [];
  teacherExamList.innerHTML = rows.length ? "" : "No exams yet";

  rows.forEach(exam => {
    const d = document.createElement("div");
    d.className = "box";
    d.innerHTML = `
      <h3>${safeText(exam.title)}</h3>
      <p>${safeText(exam.description)}</p>
      <p>⏱ ${exam.time_limit || 10} min</p>
    `;

    const b = document.createElement("button");
    b.textContent = "Manage Questions";
    b.onclick = () => openQuestionManager(exam.id, exam.title);
    d.appendChild(b);
    teacherExamList.appendChild(d);
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

async function addQuestion() {
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

  let row = { exam_id: currentExamId, question_text: text, question_type: type, explanation };

  if (type === "mcq") {
    if (!optionA.value || !optionB.value || !optionC.value || !optionD.value) {
      questionMsg.textContent = "Fill options";
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
    Object.assign(row, { option_a: "True", option_b: "False", correct_answer: tfCorrectAnswer.value });
  }

  const r = await client.from("questions").insert([row]);

  if (r.error) {
    questionMsg.textContent = r.error.message;
    console.error(r.error);
    return;
  }

  questionMsg.textContent = "Saved ✅";
  questionText.value = "";
  optionA.value = "";
  optionB.value = "";
  optionC.value = "";
  optionD.value = "";
  questionExplanation.value = "";
  loadQuestions();
}

async function loadQuestions() {
  if (!$('questionList')) return;
  questionList.innerHTML = "Loading...";

  const r = await client
    .from("questions")
    .select("*")
    .eq("exam_id", currentExamId)
    .order("created_at", { ascending: true });

  if (r.error) {
    questionList.innerHTML = "Error";
    return;
  }

  const qs = r.data || [];
  questionList.innerHTML = qs.length ? "" : "No questions yet";

  qs.forEach((q, i) => {
    const box = document.createElement("div");
    box.className = "box";
    box.innerHTML = `
      <h3>${i + 1}. ${safeText(q.question_text)}</h3>
      <p><b>Correct:</b> ${safeText(q.correct_answer)}</p>
      <p>${safeText(q.explanation)}</p>
    `;
    questionList.appendChild(box);
  });
}

// =========================
// Student Exams + Interactive Solver
// =========================
async function loadStudentExams() {
  if (!$('studentExamList')) return;
  studentExamList.innerHTML = "Loading exams...";

  const r = await client.from("exams").select("*").order("created_at", { ascending: false });

  if (r.error) {
    studentExamList.innerHTML = "Error loading exams";
    console.error(r.error);
    return;
  }

  const exams = r.data || [];
  studentExamList.innerHTML = exams.length ? "" : "No exams yet";

  exams.forEach(exam => {
    const box = document.createElement("div");
    box.className = "box";
    box.innerHTML = `
      <h3>${safeText(exam.title)}</h3>
      <p>${safeText(exam.description)}</p>
      <p><b>⏱ Time:</b> ${exam.time_limit || 10} min</p>
    `;

    const btn = document.createElement("button");
    btn.textContent = "Start Exam 🚀";
    btn.onclick = () => previewExam(exam.id, exam.title, exam.description, exam.time_limit);
    box.appendChild(btn);
    studentExamList.appendChild(box);
  });
}

function previewExam(id, title, description, timeLimit) {
  currentPreviewExam = { id, title, description, timeLimit: Number(timeLimit || 10) };
  takeExamTitle.textContent = title || "Exam";
  takeExamDesc.textContent = description || "";
  takeExamTime.textContent = "Time limit: " + (timeLimit || 10) + " minutes";
  showPage("takeExam");
}

async function startSolvingExam() {
  if (!currentPreviewExam) return;

  const r = await client
    .from("questions")
    .select("*")
    .eq("exam_id", currentPreviewExam.id)
    .order("created_at", { ascending: true });

  if (r.error) {
    alert("Error loading questions");
    return;
  }

  solvingQuestions = r.data || [];

  if (!solvingQuestions.length) {
    alert("This exam has no questions yet.");
    return;
  }

  currentQuestionIndex = 0;
  studentAnswers = {};
  reviewLater = {};
  remainingSeconds = currentPreviewExam.timeLimit * 60;
  solverExamTitle.textContent = currentPreviewExam.title || "Exam";

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
  solverQuestionText.textContent = (currentQuestionIndex + 1) + ". " + q.question_text;
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
      renderSolver();
    };
    solverOptions.appendChild(lab);
  });
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
  reviewLater[q.id] = !reviewLater[q.id];
  renderQuestionNav();
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
    .order("created_at", { ascending: false });

  if (r.error) {
    myResultsList.innerHTML = "Error";
    return;
  }

  const rows = r.data || [];
  myResultsList.innerHTML = rows.length ? "" : "No results yet";
  rows.forEach(x => {
    const d = document.createElement("div");
    d.className = "box";
    d.innerHTML = `<h3>${safeText(x.exams?.title || "Exam")}</h3><p>Score: ${x.score}/${x.total} (${x.percentage}%)</p><p>${new Date(x.created_at).toLocaleString()}</p>`;
    myResultsList.appendChild(d);
  });
}

async function loadTeacherResults() {
  if (!$('teacherResultsList')) return;
  teacherResultsList.innerHTML = "Loading...";

  const r = await client.from("exam_results").select("*, exams(title)").order("created_at", { ascending: false });

  if (r.error) {
    teacherResultsList.innerHTML = "Error or no table";
    return;
  }

  teacherResultsList.innerHTML = "";
  (r.data || []).forEach(x => {
    const d = document.createElement("div");
    d.className = "box";
    d.innerHTML = `<h3>${safeText(x.exams?.title || "Exam")}</h3><p>Score: ${x.score}/${x.total} (${x.percentage}%)</p>`;
    teacherResultsList.appendChild(d);
  });
}

async function loadLeaderboard(type) {
  if (!$('leaderboardList')) return;
  leaderboardList.innerHTML = "Loading...";

  const start = new Date();
  if (type === "daily") start.setHours(0, 0, 0, 0);
  else start.setDate(start.getDate() - 7);

  const r = await client
    .from("exam_results")
    .select("*, exams(title)")
    .gte("created_at", start.toISOString())
    .order("percentage", { ascending: false })
    .order("score", { ascending: false });

  if (r.error) {
    leaderboardList.innerHTML = "Error";
    return;
  }

  leaderboardList.innerHTML = `<h2>${type === "daily" ? "Daily" : "Weekly"} Leaderboard 🏆</h2>`;

  (r.data || []).forEach((x, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "#" + (i + 1);
    const d = document.createElement("div");
    d.className = "box";
    d.innerHTML = `<h3>${medal} Student</h3><p>${safeText(x.exams?.title || "Exam")}</p><p>${x.score}/${x.total} (${x.percentage}%)</p>`;
    leaderboardList.appendChild(d);
  });
}

function fillAssistantPrompt(type) {
  if (!$('assistantQuestion')) return;
  const prompts = {
    grammar: "Explain this grammar rule with examples in English and Arabic.",
    plan: "I need a study plan for English this week.",
    mistakes: "How can I fix my repeated mistakes in exams?"
  };
  assistantQuestion.value = prompts[type] || "Help me study English better.";
  localAssistant();
}

function localAssistant() {
  if (!$('assistantQuestion') || !$('assistantAnswer')) return;
  const q = assistantQuestion.value.toLowerCase();

  let ans = `
    <h3>JAK Assistant 🤖</h3>
    <p>Start by identifying your weak point, then practise with short timed exercises.</p>
    <p><b>ابدأ بتحديد نقطة ضعفك، ثم تدرب بتمارين قصيرة ومؤقتة.</b></p>
  `;

  if (q.includes("grammar") || q.includes("rule") || q.includes("passive") || q.includes("tense")) {
    ans = `
      <h3>Grammar Plan</h3>
      <p>1. Read the rule. 2. Write 3 examples. 3. Solve 10 mixed questions. 4. Write your mistakes in a notebook.</p>
      <p><b>الخطة:</b> افهم القاعدة، اكتب أمثلة، حل أسئلة متنوعة، وسجل أخطاءك.</p>
    `;
  }

  if (q.includes("vocab") || q.includes("word") || q.includes("meaning")) {
    ans = `
      <h3>Vocabulary Plan</h3>
      <p>Use: word + Arabic meaning + English sentence + revision after 24 hours.</p>
      <p><b>للمفردات:</b> الكلمة + معناها + جملة + مراجعة بعد يوم.</p>
    `;
  }

  if (q.includes("plan") || q.includes("study") || q.includes("schedule")) {
    ans = `
      <h3>Study Plan</h3>
      <p>Use 25 minutes study + 5 minutes break. Start with the hardest skill first, then practise exam questions.</p>
      <p><b>خطة الدراسة:</b> 25 دقيقة دراسة + 5 دقائق راحة، وابدأ بالأصعب.</p>
    `;
  }

  if (q.includes("mistake") || q.includes("wrong") || q.includes("weak")) {
    ans = `
      <h3>Mistakes Strategy</h3>
      <p>Write every mistake under three columns: the wrong answer, the correct answer, and the reason.</p>
      <p><b>استراتيجية الأخطاء:</b> اكتب الخطأ، التصحيح، وسبب الخطأ.</p>
    `;
  }

  assistantAnswer.innerHTML = ans;
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
window.addEventListener("load", () => {
  if ($("mathSymbols")) {
    syms.forEach(s => {
      const b = document.createElement("button");
      b.textContent = s;
      b.onclick = () => insertMath(s);
      mathSymbols.appendChild(b);
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
  renderTodayTasks();
  updatePlannerStats();
  renderRotatingAdvice();
  if ($("studentProgressBox")) {
    const plans = getPlans();
    const total = plans.length;
    const done = plans.filter(p => p.status === "done").length;
    const progress = total ? Math.round((done / total) * 100) : 0;
    studentProgressBox.innerHTML = `<h2>Study Progress</h2><p>${progress}% completed</p><div class="progress"><span style="width:${progress}%"></span></div>`;
  }
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
  renderPaymentInfo();
  renderTodayTasks();
  renderRotatingAdvice();
  renderDictionaryHome();
  renderGamesHome();
  const user = await getCurrentUser();
  if (user) {
  await goDashboard();
  return;
}

showPage('home');
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
window.addEventListener("DOMContentLoaded", () => {
  displayQuestion();
  bootStableApp();
  loadUserName();
});
function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });

  const target = document.getElementById(pageId);

  if (target) {
    target.classList.add("active");
  } else {
    console.log("Page not found:", pageId);
  }
}async function goDashboard() {
  const { data: { user } } = await client.auth.getUser();

  if (!user) {
    showPage("home");
    return;
  }

  const { data, error } = await client
    .from("profiles")
    .select("role")
    .eq("email", user.email)
    .single();

  if (error) {
    console.log("Role error:", error.message);
    return;
  }

  if (data?.role === "teacher") {
    showPage("teacherDashboard");
  } else {
    showPage("studentDashboard");
  }
}