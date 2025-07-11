// Bmob云端应用初始化
Bmob.initialize("368533e147336682", "qwqertyui");

// 全局变量
let matches = [];
let currentUser = null;
let currentRole = "viewer"; // 默认未登录为观众

// 全局比分历史
let scoreHistory = { A: [], B: [], labels: [] };
let chartInstance = null;
let lastLiveMatchId = null;

// 页面入口
window.onload = function () {
  checkLogin();
};

// 检查登录状态
function checkLogin() {
  currentUser = Bmob.User.current();
  if (currentUser) {
    currentRole = currentUser.role || "viewer";
  } else {
    currentRole = "viewer";
  }
  renderMainPage();
}

// 渲染主页面（根据角色）
function renderMainPage() {
  document.body.innerHTML = `
    <div class="container card-main">
        <div class="top-bar">
            <span>当前用户：${
              currentUser ? currentUser.username : "未登录"
            }（${roleName(currentRole)}）</span>
            ${
              currentUser
                ? `<button class="btn btn-logout" onclick="logout()">退出</button>`
                : `<button class="btn btn-login" onclick="renderLoginPage()">登录/注册</button>`
            }
        </div>
        <h1 class="main-title">比分直播</h1>
        <div id="liveScore"></div>
        <hr>
        <div class="card collapsible">
            <div class="card-header" onclick="toggleCollapse('allMatchContent')">
                <span>所有比赛名单与积分</span>
                <span class="collapse-arrow" id="arrow-allMatchContent">▼</span>
            </div>
            <div class="card-content" id="allMatchContent"></div>
        </div>
        <div id="scorePanel"></div>
        <div class="card collapsible">
            <div class="card-header" onclick="toggleCollapse('signupCheckContent')">
                <span>今日报名名单检测</span>
                <span class="collapse-arrow" id="arrow-signupCheckContent">▼</span>
            </div>
            <div class="card-content" id="signupCheckContent"></div>
        </div>
    </div>
    `;
  fetchMatchesFromBmob();
  // 折叠区块初始展开
  setTimeout(() => {
    document.getElementById("allMatchContent").style.display = "";
    document.getElementById("signupCheckContent").style.display = "";
  }, 0);
}

// 折叠区块切换
function toggleCollapse(id) {
  const content = document.getElementById(id);
  const arrow = document.getElementById("arrow-" + id);
  if (content.style.display === "none") {
    content.style.display = "";
    arrow.innerText = "▼";
  } else {
    content.style.display = "none";
    arrow.innerText = "▲";
  }
}

// 角色中文名
function roleName(role) {
  if (role === "admin") return "管理员";
  if (role === "scorekeeper") return "记分员";
  return "观众";
}

// 拉取比赛数据
function fetchMatchesFromBmob() {
  const query = Bmob.Query("Match");
  query.find().then((res) => {
    matches = res.map((item) => ({
      id: item.objectId,
      teamA: parseTeam(item.teamA),
      teamB: parseTeam(item.teamB),
      project: item.project,
      completed: item.completed === true,
      scoreA: parseInt(item.scoreA, 10),
      scoreB: parseInt(item.scoreB, 10),
      isLive: item.isLive === true,
    }));
    renderLiveScore();
    renderAllMatchTable();
    renderScorePanel();
    renderSignupCheck();
  });
}

function parseTeam(val) {
  if (Array.isArray(val)) return val;
  try {
    return JSON.parse(val);
  } catch {
    return typeof val === "string" ? val.split(",").map((s) => s.trim()) : [];
  }
}

// 比分直播（只显示当前进行中的比赛，含折线图）
function renderLiveScore() {
  let html = '<div class="card live-card">';
  html += '<table class="live-table">';
  html +=
    "<tr><th>A组</th><th>B组</th><th>项目</th><th>A组得分</th><th>B组得分</th><th>状态</th></tr>";
  const liveMatch = matches.find((match) => match.isLive);
  if (liveMatch) {
    html += `<tr class="live-row">
            <td class="live-team">${liveMatch.teamA.join(" 和 ")}</td>
            <td class="live-team">${liveMatch.teamB.join(" 和 ")}</td>
            <td>${liveMatch.project}</td>
            <td class="live-score">${liveMatch.scoreA}</td>
            <td class="live-score">${liveMatch.scoreB}</td>
            <td>${
              liveMatch.completed
                ? '<span class="status-finished">已完成</span>'
                : '<span class="status-live">进行中</span>'
            }</td>
        </tr>`;
    html +=
      '<tr><td colspan="6"><canvas id="scoreChart" height="120"></canvas></td></tr>';
  } else {
    html +=
      '<tr><td colspan="6" style="text-align:center;">暂无进行中的比赛</td></tr>';
  }
  html += "</table></div>";
  document.getElementById("liveScore").innerHTML = html;
  // 折线图逻辑
  if (liveMatch) {
    // 如果切换了比赛，重置历史
    if (lastLiveMatchId !== liveMatch.id) {
      resetScoreHistory(liveMatch);
      lastLiveMatchId = liveMatch.id;
    } else {
      // 只在比分变化时记录
      const lastA = scoreHistory.A[scoreHistory.A.length - 1];
      const lastB = scoreHistory.B[scoreHistory.B.length - 1];
      if (lastA !== liveMatch.scoreA || lastB !== liveMatch.scoreB) {
        recordScoreHistory(liveMatch.scoreA, liveMatch.scoreB);
      }
    }
    updateScoreChart();
  } else {
    resetScoreHistory();
    lastLiveMatchId = null;
  }
}

// 初始化/重置比分历史
function resetScoreHistory(match) {
  if (!match) {
    scoreHistory = { A: [], B: [], labels: [] };
    updateScoreChart();
    return;
  }
  scoreHistory = { A: [match.scoreA], B: [match.scoreB], labels: [0] };
  updateScoreChart();
}
// 记录比分变化
function recordScoreHistory(a, b) {
  scoreHistory.A.push(a);
  scoreHistory.B.push(b);
  scoreHistory.labels.push(scoreHistory.A.length - 1);
}
// Chart.js折线图
function updateScoreChart() {
  const ctx = document.getElementById("scoreChart");
  if (!ctx) return;
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: scoreHistory.labels,
      datasets: [
        {
          label: "A组",
          data: scoreHistory.A,
          borderColor: "#36a2eb",
          backgroundColor: "rgba(54,162,235,0.1)",
          fill: false,
          tension: 0.2,
        },
        {
          label: "B组",
          data: scoreHistory.B,
          borderColor: "#ff6384",
          backgroundColor: "rgba(255,99,132,0.1)",
          fill: false,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true, max: 31 } },
    },
  });
}

// 所有比赛名单与积分
function renderAllMatchTable() {
  let html =
    '<div class="card"><h2 class="section-title">所有比赛名单与积分</h2>';
  html += '<table class="match-table">';
  html +=
    "<tr><th>序号</th><th>A组</th><th>B组</th><th>项目</th><th>比分</th><th>胜负</th><th>积分</th>";
  if (currentRole === "admin") html += "<th>操作</th>";
  html += "</tr>";
  matches.forEach((match, idx) => {
    let result = "-";
    let point = "-";
    if (match.completed) {
      if (match.scoreA === 31) {
        result = "A组胜";
        point = `A组: 3分<br>B组: 1分`;
      } else if (match.scoreB === 31) {
        result = "B组胜";
        point = `A组: 1分<br>B组: 3分`;
      }
    } else {
      result = "未完成";
    }
    html += `<tr>
            <td>${idx + 1}</td>
            <td>${match.teamA.join(" 和 ")}</td>
            <td>${match.teamB.join(" 和 ")}</td>
            <td>${match.project}</td>
            <td>${match.scoreA} : ${match.scoreB} / 31</td>
            <td>${result}</td>
            <td>${point}</td>`;
    if (currentRole === "admin") {
      html += `<td><button class="btn btn-reset" onclick="resetMatchScore('${match.id}')">重置</button></td>`;
    }
    html += "</tr>";
  });
  html += "</table></div>";
  document.getElementById("allMatchContent").innerHTML = html; // 更新到折叠区块
}

// 记分面板（记分员和管理员可见）
function renderScorePanel() {
  if (currentRole === "scorekeeper" || currentRole === "admin") {
    let html =
      '<div class="card"><h2 class="section-title">选择当前比赛的选手组合：</h2>';
    html +=
      '<select id="matchSelect" onchange="selectMatch()" class="select-match">';
    html += '<option value="">请选择选手组合</option>';
    matches.forEach((match) => {
      if (!match.completed) {
        html += `<option value="${match.id}" ${
          match.isLive ? "selected" : ""
        }>${match.teamA.join(" 和 ")} - ${match.project} vs ${match.teamB.join(
          " 和 "
        )}</option>`;
      }
    });
    html += "</select>";
    html += '<div id="scoreControl"></div></div>';
    document.getElementById("scorePanel").innerHTML = html;
    // 自动渲染当前比赛的记分操作区
    selectMatch();
  } else {
    document.getElementById("scorePanel").innerHTML = "";
  }
}

// 切换当前比赛并显示记分操作
function selectMatch() {
  const select = document.getElementById("matchSelect");
  const matchId = select ? select.value : "";
  if (!matchId) {
    document.getElementById("scoreControl").innerHTML = "";
    return;
  }
  setCurrentLiveMatch(matchId);
  const match = matches.find((m) => m.id === matchId);
  if (!match) {
    document.getElementById("scoreControl").innerHTML = "";
    return;
  }
  let html = `<div class="score-ops">
        <span class="score-label">A组：${match.teamA.join(" 和 ")}</span>
        <button class="btn btn-score" onclick="addScoreA('${
          match.id
        }')">A组加分</button>
        <button class="btn btn-score" onclick="subtractScoreA('${
          match.id
        }')">A组减分</button>
        <span class="score-label" style="margin-left:30px;">B组：${match.teamB.join(
          " 和 "
        )}</span>
        <button class="btn btn-score" onclick="addScoreB('${
          match.id
        }')">B组加分</button>
        <button class="btn btn-score" onclick="subtractScoreB('${
          match.id
        }')">B组减分</button>
        <button class="btn btn-clear" onclick="resetMatchScore('${
          match.id
        }')">清零</button>
    </div>`;
  document.getElementById("scoreControl").innerHTML = html;
}

// 设置当前进行中的比赛（优化：只更新有变化的比赛）
function setCurrentLiveMatch(matchId) {
  if (!(currentRole === "scorekeeper" || currentRole === "admin")) return;
  const updates = [];
  matches.forEach((m) => {
    const shouldBeLive = m.id === matchId;
    if (m.isLive !== shouldBeLive) {
      const query = Bmob.Query("Match");
      query.set("id", m.id);
      query.set("isLive", shouldBeLive);
      updates.push(query.save());
    }
  });
  if (updates.length > 0) {
    Promise.all(updates).then(() => {
      fetchMatchesFromBmob();
    });
  } else {
    // 没有变化时也要刷新UI
    fetchMatchesFromBmob();
  }
}

// 记分操作
function addScoreA(id) {
  const match = matches.find((m) => m.id === id);
  if (!match) return;
  if (match.scoreA < 31 && match.scoreB < 31) {
    updateMatchScoreInBmob(match, match.scoreA + 1, match.scoreB);
  }
}
function subtractScoreA(id) {
  const match = matches.find((m) => m.id === id);
  if (!match) return;
  if (match.scoreA > 0) {
    updateMatchScoreInBmob(match, match.scoreA - 1, match.scoreB);
  }
}
function addScoreB(id) {
  const match = matches.find((m) => m.id === id);
  if (!match) return;
  if (match.scoreB < 31 && match.scoreA < 31) {
    updateMatchScoreInBmob(match, match.scoreA, match.scoreB + 1);
  }
}
function subtractScoreB(id) {
  const match = matches.find((m) => m.id === id);
  if (!match) return;
  if (match.scoreB > 0) {
    updateMatchScoreInBmob(match, match.scoreA, match.scoreB - 1);
  }
}
function resetMatchScore(id) {
  const match = matches.find((m) => m.id === id);
  if (!match) return;
  updateMatchScoreInBmob(match, 0, 0);
}

// 更新比分到Bmob
function updateMatchScoreInBmob(match, newScoreA, newScoreB) {
  const completed = newScoreA === 31 || newScoreB === 31;
  const query = Bmob.Query("Match");
  query.set("id", match.id);
  query.set("scoreA", String(newScoreA));
  query.set("scoreB", String(newScoreB));
  query.set("completed", completed);
  query.save().then(() => {
    fetchMatchesFromBmob();
  });
}

// 今日报名名单检测区域
function renderSignupCheck() {
  const html = `
    <div class="card" style="margin-top:30px;">
        <h2 class="section-title">今日报名名单检测</h2>
        <label for="signupInput">输入今日报名人员（用逗号或空格分隔）：</label>
        <input type="text" id="signupInput" placeholder="如：李健, 李京燕, 江红梅..." class="input-signup">
        <button class="btn btn-check" onclick="checkSignup()">检测可组队情况</button>
        <div id="signupResult" style="margin-top:20px;"></div>
    </div>
    `;
  document.getElementById("signupCheckContent").innerHTML = html; // 更新到折叠区块
}

// 检查今日报名名单
function checkSignup() {
  const input = document.getElementById("signupInput").value;
  const signupList = input
    .split(/[，,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let html = '<table class="signup-table">';
  html +=
    "<tr><th>序号</th><th>A组</th><th>B组</th><th>项目</th><th>能否进行</th><th>缺少人员</th></tr>";
  let showIdx = 1;
  matches.forEach((match) => {
    if (match.completed) return; // 已完成比赛不检测
    let missing = [];
    match.teamA.concat(match.teamB).forEach((name) => {
      if (!signupList.includes(name)) missing.push(name);
    });
    let canPlay = missing.length === 0;
    html += `<tr style="background:${canPlay ? "#eaffea" : "#ffeaea"};">`;
    html += `<td>${showIdx++}</td>`;
    html += `<td>${match.teamA.join(" 和 ")}</td>`;
    html += `<td>${match.teamB.join(" 和 ")}</td>`;
    html += `<td>${match.project}</td>`;
    html += `<td style="color:${
      canPlay ? "#3c763d" : "#d9534f"
    };font-weight:bold;">${canPlay ? "可进行" : "不可进行"}</td>`;
    html += `<td style="color:#d9534f;">${
      canPlay ? "-" : missing.join("、")
    }</td>`;
    html += "</tr>";
  });
  html += "</table>";
  document.getElementById("signupResult").innerHTML = html;
}

// 登录页面
function renderLoginPage() {
  document.body.innerHTML = `
    <div class="container card-main">
        <h2 class="main-title">登录</h2>
        <div style="max-width:300px;margin:30px auto;">
            <input id="login-username" type="text" placeholder="用户名" class="input-login">
            <input id="login-password" type="password" placeholder="密码" class="input-login">
            <button class="btn btn-login" onclick="login()">登录</button>
            <div style="margin-top:10px;text-align:center;">
                <a href="#" onclick="checkLogin()">返回首页</a>
            </div>
        </div>
    </div>
    `;
}

// 登录逻辑
function login() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!username || !password) {
    alert("请输入用户名和密码");
    return;
  }
  Bmob.User.login(username, password)
    .then((user) => {
      currentUser = user;
      currentRole = user.role || "viewer";
      renderMainPage();
    })
    .catch((err) => {
      alert("登录失败，请联系管理员添加账号");
    });
}

// 退出登录
function logout() {
  Bmob.User.logout();
  currentUser = null;
  currentRole = "viewer";
  checkLogin();
}
