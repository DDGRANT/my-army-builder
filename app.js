// 全局状态管理
const State = {
  factions: [],
  rosters: {},
  currentFactionId: null,
  army: [],             // 最大 30 队
  costLimit: 14000,
  maxTotalUnits: 30,    // 对应 max_units_all = 30
  maxArtillery: 3,     // 对应 max_artillery = 3
  maxMob: 3,           // 对应 max_mob = 3 (战斗将军固定上限3)
  maxHeavyCavArt: 7    // 对应 max_heavy_cav_art = 7 (重骑兵+火炮联合上限)
};

// 严格对齐 army_box_2.luac 中的 Class 判定集合
const ClassGroup = {
  LINE: ["线列步兵", "轻步兵", "非正规步兵"],
  SKIRMISHER: ["散兵"],
  GRENADIER: ["掷弹兵"],
  ELITE: ["精锐步兵"],
  ARTILLERY: ["步兵炮", "骑乘炮兵"],
  HEAVY_CAV: ["重骑兵"],
  MOB: ["战斗将军"]
};

// 统计特定 Key 的单位数量（对齐 UnitsOfType）
function countUnitsOfKey(key) {
  return State.army.filter(u => u.key === key).length;
}

// 统计特定 Class 类别的单位总数
function countUnitsByClasses(classList) {
  return State.army.filter(u => classList.includes(u.class_type)).length;
}

// 对应 army_box_2.luac 的 AddUnit 前置判定
function validateAddUnit(unit) {
  const currentCost = State.army.reduce((sum, u) => sum + u.cost, 0);

  // 1. 金额预算检查: TotalCost + cost <= cost_limit
  if (currentCost + unit.cost > State.costLimit) {
    alert("超出军费预算上限！");
    return false;
  }

  // 2. 总单位数上限检查: TotalCards < max_units_all (30)
  if (State.army.length >= State.maxTotalUnits) {
    alert(`全军编制已满（最大容量 ${State.maxTotalUnits} 队）！`);
    return false;
  }

  // 3. 单位自身 Cap 检查: details.Cap == 0 or UnitsOfType(details.Key) < details.Cap
  if (unit.cap > 0 && countUnitsOfKey(unit.key) >= unit.cap) {
    alert(`该单位已达到招募上限（编制上限: ${unit.cap} 队）！`);
    return false;
  }

  // 4. 战斗将军上限检查: max_mob = 3
  const currentMob = countUnitsByClasses(ClassGroup.MOB);
  if (ClassGroup.MOB.includes(unit.class_type) && currentMob >= State.maxMob) {
    alert("战斗将军已达到全军招募上限（最多 3 队）！");
    return false;
  }

  // 5. 火炮上限检查: max_artillery = 3
  const currentArt = countUnitsByClasses(ClassGroup.ARTILLERY);
  if (ClassGroup.ARTILLERY.includes(unit.class_type) && currentArt >= State.maxArtillery) {
    alert("火炮（步兵炮/骑乘炮兵）已达上限（最多 3 门）！");
    return false;
  }

  // 6. 重骑兵与火炮联合上限检查: current_heavy_cav + current_artillery <= 7
  const currentHeavyCav = countUnitsByClasses(ClassGroup.HEAVY_CAV);
  if (ClassGroup.HEAVY_CAV.includes(unit.class_type)) {
    if ((currentHeavyCav + 1) + currentArt > State.maxHeavyCavArt) {
      alert("重骑兵与火炮联合数量不能超过 7 队！");
      return false;
    }
  }
  if (ClassGroup.ARTILLERY.includes(unit.class_type)) {
    if (currentHeavyCav + (currentArt + 1) > State.maxHeavyCavArt) {
      alert("重骑兵与火炮联合数量不能超过 7 队！");
      return false;
    }
  }

  // 7. 线列步兵联动上限计算
  const lineCount = countUnitsByClasses(ClassGroup.LINE);
  const maxSkirmisher = Math.floor(lineCount * 2);        // line * 2
  const maxGrenadier = Math.floor(lineCount / 1.5);       // line / 1.5
  const maxElite = Math.floor(lineCount / 2);             // line / 2

  if (ClassGroup.SKIRMISHER.includes(unit.class_type) && countUnitsByClasses(ClassGroup.SKIRMISHER) >= maxSkirmisher) {
    alert(`散兵超出配额！当前线列步兵数量支持招募上限为 ${maxSkirmisher} 队。`);
    return false;
  }
  if (ClassGroup.GRENADIER.includes(unit.class_type) && countUnitsByClasses(ClassGroup.GRENADIER) >= maxGrenadier) {
    alert(`掷弹兵超出配额！当前线列步兵数量支持招募上限为 ${maxGrenadier} 队。`);
    return false;
  }
  if (ClassGroup.ELITE.includes(unit.class_type) && countUnitsByClasses(ClassGroup.ELITE) >= maxElite) {
    alert(`精锐步兵超出配额！当前线列步兵数量支持招募上限为 ${maxElite} 队。`);
    return false;
  }

  return true;
}

// 添加单位
function addUnitToArmy(unit) {
  if (validateAddUnit(unit)) {
    State.army.push(unit);
    updateArmyState();
  }
}

// 移除单位 (对应 Lua 的 OnDivorceChild)
function removeUnitFromArmy(index) {
  State.army.splice(index, 1);
  cullExcessUnits();
  updateArmyState();
}

// 对应 Lua 的 RemoveExcessUnits 自动剔除逻辑
function cullExcessUnits() {
  const lineCount = countUnitsByClasses(ClassGroup.LINE);
  const maxSkirmisher = Math.floor(lineCount * 2);
  const maxGrenadier = Math.floor(lineCount / 1.5);
  const maxElite = Math.floor(lineCount / 2);

  removeExcessByClass(ClassGroup.SKIRMISHER, maxSkirmisher);
  removeExcessByClass(ClassGroup.GRENADIER, maxGrenadier);
  removeExcessByClass(ClassGroup.ELITE, maxElite);
  removeExcessByClass(ClassGroup.MOB, State.maxMob);
}

function removeExcessByClass(classList, maxLimit) {
  let count = countUnitsByClasses(classList);
  if (count > maxLimit) {
    const toRemove = count - maxLimit;
    let removed = 0;
    for (let i = State.army.length - 1; i >= 0 && removed < toRemove; i--) {
      if (classList.includes(State.army[i].class_type)) {
        State.army.splice(i, 1);
        removed++;
      }
    }
  }
}

// 刷新界面仪表盘
function updateArmyState() {
  const totalCost = State.army.reduce((sum, u) => sum + u.cost, 0);
  const lineCount = countUnitsByClasses(ClassGroup.LINE);
  const currentArt = countUnitsByClasses(ClassGroup.ARTILLERY);
  const currentHeavyCav = countUnitsByClasses(ClassGroup.HEAVY_CAV);
  const currentMob = countUnitsByClasses(ClassGroup.MOB);
  const currentSkirmisher = countUnitsByClasses(ClassGroup.SKIRMISHER);
  const currentGrenadier = countUnitsByClasses(ClassGroup.GRENADIER);
  const currentElite = countUnitsByClasses(ClassGroup.ELITE);

  document.getElementById('stat-cost').textContent = totalCost;
  document.getElementById('stat-total').textContent = `${State.army.length} / ${State.maxTotalUnits}`;
  document.getElementById('stat-heavy-art').textContent = `${currentHeavyCav + currentArt} / ${State.maxHeavyCavArt}`;
  document.getElementById('stat-artillery').textContent = `${currentArt} / ${State.maxArtillery}`;
  document.getElementById('stat-mob').textContent = `${currentMob} / ${State.maxMob}`;

  document.getElementById('pill-line').textContent = `线列步兵: ${lineCount}`;
  document.getElementById('pill-skirmisher').textContent = `散兵: ${currentSkirmisher} / ${Math.floor(lineCount * 2)}`;
  document.getElementById('pill-grenadier').textContent = `掷弹兵: ${currentGrenadier} / ${Math.floor(lineCount / 1.5)}`;
  document.getElementById('pill-elite').textContent = `精锐步兵: ${currentElite} / ${Math.floor(lineCount / 2)}`;

  renderArmyGrid();
}

// 渲染选配卡牌网格 (30格)
function renderArmyGrid() {
  const grid = document.getElementById('army-grid');
  grid.innerHTML = "";

  for (let i = 0; i < State.maxTotalUnits; i++) {
    const slot = document.createElement('div');
    slot.className = "card-slot";

    if (i < State.army.length) {
      const unit = State.army[i];
      slot.classList.add("filled");
      slot.innerHTML = `
        <div class="card-inner">
          <img class="unit-icon" src="${unit.icon}" onerror="this.style.display='none'">
          <div class="unit-meta">
            <span class="unit-name">${unit.name}</span>
            <span class="unit-cost">${unit.cost}</span>
          </div>
          <button class="remove-btn" title="移除单位">×</button>
        </div>
      `;
      slot.querySelector('.remove-btn').onclick = (e) => {
        e.stopPropagation();
        removeUnitFromArmy(i);
      };
    } else {
      slot.innerHTML = `<span class="slot-idx">${i + 1}</span>`;
    }
    grid.appendChild(slot);
  }
}

// 渲染右侧单位池
function renderRoster() {
  const container = document.getElementById('roster-list');
  container.innerHTML = "";
  const list = State.rosters[State.currentFactionId] || [];
  const search = document.getElementById('search-unit').value.toLowerCase();
  const currentTab = document.querySelector('.tab-btn.active').dataset.cat;

  list.forEach(unit => {
    if (currentTab !== 'all' && unit.category !== currentTab) return;
    if (search && !unit.name.toLowerCase().includes(search) && !unit.key.toLowerCase().includes(search)) return;

    const card = document.createElement('div');
    card.className = "roster-card";
    card.innerHTML = `
      <img class="roster-icon" src="${unit.icon}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'50\'><rect width=\'40\' height=\'50\' fill=\'%23444\'/></svg>'">
      <div class="roster-info">
        <div class="roster-title">${unit.name}</div>
        <div class="roster-details">
          <span>花费: <b>${unit.cost}</b></span>
          <span>编制上限: <b>${unit.cap > 0 ? unit.cap : '无限制'}</b></span>
        </div>
      </div>
      <button class="btn-add">+</button>
    `;

    card.onclick = () => addUnitToArmy(unit);
    container.appendChild(card);
  });
}

// 切换派系
function switchFaction(facId) {
  State.currentFactionId = facId;
  State.army = [];
  
  const currentFac = State.factions.find(f => f.id === facId);
  const flagImg = document.getElementById('current-flag');
  if (currentFac && currentFac.flag) {
    flagImg.src = currentFac.flag;
  }

  renderRoster();
  updateArmyState();
}

// 初始化派系下拉
function initFactionSelector() {
  const sel = document.getElementById('faction-select');
  sel.innerHTML = "";
  State.factions.forEach(fac => {
    const opt = document.createElement('option');
    opt.value = fac.id;
    opt.textContent = fac.name;
    sel.appendChild(opt);
  });
  if (State.factions.length > 0) {
    switchFaction(State.factions[0].id);
  }
}

// 初始化加载数据
async function initApp() {
  try {
    const res = await fetch('data/army_data.json');
    if (!res.ok) throw new Error("未找到本地 army_data.json");
    const data = await res.json();
    State.factions = data.factions;
    State.rosters = data.rosters;
    initFactionSelector();
  } catch (err) {
    console.warn("未能自动载入 data/army_data.json，可通过数据管理面板上传加载。", err);
  }
  setupEventListeners();
  renderArmyGrid();
}

// 绑定各类交互事件
function setupEventListeners() {
  document.getElementById('faction-select').onchange = (e) => switchFaction(e.target.value);
  document.getElementById('input-cost-limit').onchange = (e) => {
    State.costLimit = parseInt(e.target.value) || 14000;
    updateArmyState();
  };
  document.getElementById('search-unit').oninput = renderRoster;
  document.getElementById('btn-clear-army').onclick = () => {
    State.army = [];
    updateArmyState();
  };

  // 分类过滤
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderRoster();
    };
  });

  // 导出配置
  document.getElementById('btn-export').onclick = () => {
    const payload = {
      faction: State.currentFactionId,
      units: State.army.map(u => u.key),
      totalCost: State.army.reduce((s, u) => s + u.cost, 0)
    };
    navigator.clipboard.writeText(JSON.stringify(payload));
    alert("配兵代码已复制到剪贴板！");
  };

  // 导入配置
  document.getElementById('btn-import').onclick = () => {
    const raw = prompt("请输入导出的 JSON 配兵代码：");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.faction && State.rosters[data.faction]) {
        document.getElementById('faction-select').value = data.faction;
        switchFaction(data.faction);
        const pool = State.rosters[data.faction];
        data.units.forEach(key => {
          const match = pool.find(u => u.key === key);
          if (match) addUnitToArmy(match);
        });
      }
    } catch (e) {
      alert("配置数据格式有误，导入失败！");
    }
  };

  // 数据热更新弹窗
  const modal = document.getElementById('data-modal');
  document.getElementById('btn-manage-data').onclick = () => modal.style.display = 'flex';
  document.getElementById('btn-close-modal').onclick = () => modal.style.display = 'none';

  // 本地热更 JSON
  document.getElementById('upload-json-file').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        State.factions = parsed.factions;
        State.rosters = parsed.rosters;
        initFactionSelector();
        modal.style.display = 'none';
        alert("热更新数据加载成功！");
      } catch (err) {
        alert("解析 JSON 失败，请检查文件格式。");
      }
    };
    reader.readAsText(file);
  };
}

window.onload = initApp;
