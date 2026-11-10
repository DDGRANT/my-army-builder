// 全局状态管理
const State = {
  factions: [],
  rosters: {},
  currentFactionId: null,
  army: [], // 最大 30 队
  costLimit: 14000,
  maxTotalUnits: 30,    // max_units_all = 30
  maxArtillery: 3,     // max_artillery = 3
  maxMob: 3,           // max_mob = 3 (战斗将军固定上限3)
  maxHeavyCavArt: 7    // max_heavy_cav_art = 7 (重骑兵+火炮联合上限)
};

// 类别映射（严格对齐全战底层数据与 Lua 规则）
const ClassMapping = {
  LINE: ["infantry_line", "infantry_light", "infantry_irregulars"],
  SKIRMISHER: ["infantry_skirmishers"],
  GRENADIER: ["infantry_grenadiers"],
  ELITE: ["infantry_elite"],
  ARTILLERY: ["artillery_foot", "artillery_horse"],
  HEAVY_CAV: ["cavalry_heavy"],
  MOB: ["infantry_mob"],
  GENERAL: ["general"]
};

// 非阻塞轻量通知气泡 (替代系统卡死弹窗)
function showToast(text, isWarn = false) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast-msg ${isWarn ? 'warn' : ''}`;
  toast.innerHTML = `<span>⚠️</span> <span>${text}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "toastOut 0.25s forwards";
    setTimeout(() => toast.remove(), 250);
  }, 2000);
}

// 从单位名称中正则提取 [...] 里的代码
function extractSpeedTag(name) {
  if (!name) return "";
  const match = name.match(/\[(.*?)\]/);
  return match ? match[1] : "";
}

// 获取单位人数或火炮门数
function getUnitPersonnel(unit) {
  if (!unit || !unit.stats) return "-";
  if (unit.category === "artillery" && unit.stats.guns > 0) {
    return `${unit.stats.guns}G`;
  }
  return unit.stats.men ? `${unit.stats.men}` : "-";
}

// 判断是否为统帅将军（STAFF）
function isStaffGeneral(unit) {
  if (!unit) return false;
  return unit.class_type === "general" || (unit.name && unit.name.includes("[GEN]"));
}

// 判断是否为战斗将军（COMBAT GENERAL）
function isCombatGeneral(unit) {
  if (!unit) return false;
  return unit.class_type === "infantry_mob" || (unit.key && unit.key.endsWith("_com"));
}

// 判断是否属于某类兵种
function isUnitOfClass(unit, classGroup) {
  if (!unit || !unit.class_type) return false;
  return classGroup.includes(unit.class_type.toLowerCase());
}

// 统计全军中某类兵种的数量
function countArmyByClass(classGroup) {
  return State.army.filter(u => isUnitOfClass(u, classGroup)).length;
}

// 统计全军中特定番号 Key 的数量
function countUnitsOfKey(key) {
  return State.army.filter(u => u.key === key).length;
}

// 确保统帅将军 [GEN] 始终稳居军队第一位（Index 0）
function sortArmyWithGeneralFirst() {
  const genIndex = State.army.findIndex(u => isStaffGeneral(u));
  if (genIndex > 0) {
    const [genUnit] = State.army.splice(genIndex, 1);
    State.army.unshift(genUnit); // 移至第一位
  }
}

// 对应 army_box_2.luac 的 AddUnit 校验逻辑
function validateAddUnit(unit) {
  const currentCost = State.army.reduce((sum, u) => sum + u.cost, 0);

  // 1. 金额预算检查
  if (currentCost + unit.cost > State.costLimit) {
    showToast("超出军费预算上限！");
    return false;
  }

  // 2. 总单位数上限检查 (30 队)
  if (State.army.length >= State.maxTotalUnits) {
    showToast(`全军编制已满（最大容量 ${State.maxTotalUnits} 队）！`);
    return false;
  }

  // 3. 单位自身 Cap 检查
  if (unit.cap > 0 && countUnitsOfKey(unit.key) >= unit.cap) {
    showToast(`该单位已达到配额上限（编制上限: ${unit.cap} 队）！`);
    return false;
  }

  // 4. 战斗将军上限检查 (固定上限 3 队)
  const currentMob = countArmyByClass(ClassMapping.MOB);
  if (isCombatGeneral(unit) && currentMob >= State.maxMob) {
    showToast("战斗将军已达到全军招募上限（最多 3 队）！");
    return false;
  }

  // 5. 火炮上限检查 (最多 3 门)
  const currentArt = countArmyByClass(ClassMapping.ARTILLERY);
  if (unit.category === "artillery" && currentArt >= State.maxArtillery) {
    showToast("火炮已达全军招募上限（最多 3 门）！");
    return false;
  }

  // 6. 重骑兵与火炮联合上限检查 (合计不超过 7 队)
  const currentHeavyCav = countArmyByClass(ClassMapping.HEAVY_CAV);
  if (isUnitOfClass(unit, ClassMapping.HEAVY_CAV)) {
    if ((currentHeavyCav + 1) + currentArt > State.maxHeavyCavArt) {
      showToast("重骑兵与火炮联合数量不能超过 7 队！");
      return false;
    }
  }
  if (unit.category === "artillery") {
    if (currentHeavyCav + (currentArt + 1) > State.maxHeavyCavArt) {
      showToast("重骑兵与火炮联合数量不能超过 7 队！");
      return false;
    }
  }

  // 7. 线列步兵联动上限判定
  const lineCount = countArmyByClass(ClassMapping.LINE);
  const maxSkirmisher = Math.floor(lineCount * 2);
  const maxGrenadier = Math.floor(lineCount / 1.5);
  const maxElite = Math.floor(lineCount / 2);

  if (isUnitOfClass(unit, ClassMapping.SKIRMISHER) && countArmyByClass(ClassMapping.SKIRMISHER) >= maxSkirmisher) {
    showToast(`散兵超出上限！当前线列步兵数允许配选 ${maxSkirmisher} 队。`);
    return false;
  }
  if (isUnitOfClass(unit, ClassMapping.GRENADIER) && countArmyByClass(ClassMapping.GRENADIER) >= maxGrenadier) {
    showToast(`掷弹兵超出上限！当前线列步兵数允许配选 ${maxGrenadier} 队。`);
    return false;
  }
  if (isUnitOfClass(unit, ClassMapping.ELITE) && countArmyByClass(ClassMapping.ELITE) >= maxElite) {
    showToast(`精锐步兵超出上限！当前线列步兵数允许配选 ${maxElite} 队。`);
    return false;
  }

  return true;
}

// 添加入军
function addUnitToArmy(unit) {
  if (validateAddUnit(unit)) {
    State.army.push(unit);
    sortArmyWithGeneralFirst(); // 统帅自动置顶第 1 位
    updateArmyUI();
    renderRoster();
  }
}

// 从军队移除 (对应 Lua 的 OnDivorceChild 联级剔除)
function removeUnitFromArmy(index) {
  State.army.splice(index, 1);
  cullExcessUnits();
  sortArmyWithGeneralFirst();
  updateArmyUI();
  renderRoster();
}

// 对应 Lua 的 RemoveExcessUnits 自动修剪超额单位
function cullExcessUnits() {
  const lineCount = countArmyByClass(ClassMapping.LINE);
  const maxSkirmisher = Math.floor(lineCount * 2);
  const maxGrenadier = Math.floor(lineCount / 1.5);
  const maxElite = Math.floor(lineCount / 2);

  removeExcessByGroup(ClassMapping.SKIRMISHER, maxSkirmisher);
  removeExcessByGroup(ClassMapping.GRENADIER, maxGrenadier);
  removeExcessByGroup(ClassMapping.ELITE, maxElite);
  removeExcessByGroup(ClassMapping.MOB, State.maxMob);
}

function removeExcessByGroup(classGroup, maxLimit) {
  let count = countArmyByClass(classGroup);
  if (count > maxLimit) {
    const toRemove = count - maxLimit;
    let removed = 0;
    for (let i = State.army.length - 1; i >= 0 && removed < toRemove; i--) {
      if (isUnitOfClass(State.army[i], classGroup)) {
        State.army.splice(i, 1);
        removed++;
      }
    }
  }
}

// 刷新状态仪表盘与底栏
function updateArmyUI() {
  const totalCost = State.army.reduce((sum, u) => sum + u.cost, 0);
  const lineCount = countArmyByClass(ClassMapping.LINE);
  const currentArt = countArmyByClass(ClassMapping.ARTILLERY);
  const currentHeavyCav = countArmyByClass(ClassMapping.HEAVY_CAV);
  const currentMob = countArmyByClass(ClassMapping.MOB);
  const currentSkirmisher = countArmyByClass(ClassMapping.SKIRMISHER);
  const currentGrenadier = countArmyByClass(ClassMapping.GRENADIER);
  const currentElite = countArmyByClass(ClassMapping.ELITE);

  document.getElementById('stat-cost').textContent = totalCost;
  document.getElementById('stat-total').textContent = `${State.army.length} / ${State.maxTotalUnits}`;
  document.getElementById('stat-heavy-art').textContent = `${currentHeavyCav + currentArt} / ${State.maxHeavyCavArt}`;
  document.getElementById('stat-artillery').textContent = `${currentArt} / ${State.maxArtillery}`;
  document.getElementById('stat-mob').textContent = `${currentMob} / ${State.maxMob}`;

  document.getElementById('q-line').textContent = lineCount;
  document.getElementById('q-skirmisher').textContent = `${currentSkirmisher} / ${Math.floor(lineCount * 2)}`;
  document.getElementById('q-grenadier').textContent = `${currentGrenadier} / ${Math.floor(lineCount / 1.5)}`;
  document.getElementById('q-elite').textContent = `${currentElite} / ${Math.floor(lineCount / 2)}`;

  renderBottomTray();
}

// 渲染底栏 30 槽军队阵列 (支持左键复制、右键取消)
function renderBottomTray() {
  const container = document.getElementById('army-slots-container');
  container.innerHTML = "";

  for (let i = 0; i < State.maxTotalUnits; i++) {
    const slot = document.createElement('div');
    slot.className = "army-slot";

    if (i < State.army.length) {
      const unit = State.army[i];
      slot.classList.add("filled");
      slot.title = `${unit.name}\n【左键】：复制此单位\n【右键】：取消此单位`;

      slot.innerHTML = `
        <img class="slot-img" src="${unit.icon}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'70\\' height=\\'100\\'><rect width=\\'70\\' height=\\'100\\' fill=\\'%231b2129\\'/></svg>'">
        <div class="slot-remove" title="移除单位">×</div>
      `;

      // 左键点击：复制本单位
      slot.onclick = (e) => {
        if (e.target.classList.contains('slot-remove')) {
          e.stopPropagation();
          removeUnitFromArmy(i);
          return;
        }
        addUnitToArmy(unit);
      };

      // 右键点击：取消 / 移除本单位
      slot.oncontextmenu = (e) => {
        e.preventDefault(); // 屏蔽浏览器原生右键菜单
        removeUnitFromArmy(i);
      };

      attachTooltip(slot, unit);
    } else {
      slot.innerHTML = `<span class="slot-num">${i + 1}</span>`;
      slot.oncontextmenu = (e) => e.preventDefault();
    }
    container.appendChild(slot);
  }
}

// 渲染单位池
function renderRoster() {
  const container = document.getElementById('roster-view');
  container.innerHTML = "";
  const list = State.rosters[State.currentFactionId] || [];

  const search = document.getElementById('search-input').value.toLowerCase();
  const activeCat = document.querySelector('.filter-btn.active').dataset.cat;
  const maxPrice = parseInt(document.getElementById('cost-range').value) || 2500;

  // 1. 过滤单位
  const filtered = list.filter(u => {
    if (activeCat === 'general' && !isStaffGeneral(u)) return false;
    if (activeCat !== 'all' && activeCat !== 'general' && u.category !== activeCat) return false;
    if (u.cost > maxPrice) return false;
    if (search && !u.name.toLowerCase().includes(search) && !u.key.toLowerCase().includes(search)) return false;
    return true;
  });

  // 2. 分类展示栏
  const groups = [
    { title: "STAFF / GENERALS (统帅/指挥部)", filter: u => isStaffGeneral(u) },
    { title: "CAVALRY (骑兵部队)", filter: u => u.category === "cavalry" && !isStaffGeneral(u) },
    { title: "ARTILLERY (火炮阵地)", filter: u => u.category === "artillery" && !isStaffGeneral(u) },
    { title: "GRENADIERS & ELITE (掷弹与精锐步兵)", filter: u => !isStaffGeneral(u) && (isUnitOfClass(u, ClassMapping.GRENADIER) || isUnitOfClass(u, ClassMapping.ELITE)) },
    { title: "LIGHT & SKIRMISHERS (轻步兵与散兵)", filter: u => !isStaffGeneral(u) && (isUnitOfClass(u, ClassMapping.SKIRMISHER) || u.class_type === "infantry_light") },
    { title: "LINE & INFANTRY (线列步兵与其它步兵)", filter: u => !isStaffGeneral(u) && u.category === "infantry" && !isUnitOfClass(u, ClassMapping.GRENADIER) && !isUnitOfClass(u, ClassMapping.ELITE) && !isUnitOfClass(u, ClassMapping.SKIRMISHER) && u.class_type !== "infantry_light" }
  ];

  groups.forEach(g => {
    const groupUnits = filtered.filter(g.filter);
    if (groupUnits.length === 0) return;

    const groupSection = document.createElement('div');
    groupSection.className = "roster-group";
    groupSection.innerHTML = `<div class="group-header">${g.title} (${groupUnits.length})</div>`;

    const cardsWrap = document.createElement('div');
    cardsWrap.className = "group-cards";

    groupUnits.forEach(unit => {
      const badge = document.createElement('div');
      badge.className = "unit-badge";

      const isCom = isCombatGeneral(unit);
      if (isCom) badge.classList.add("combat-general-badge");

      const speedTag = extractSpeedTag(unit.name) || (unit.category === 'cavalry' ? 'CA' : 'INF');
      const menCount = getUnitPersonnel(unit);
      const currentCount = countUnitsOfKey(unit.key);
      const capDisplay = unit.cap > 0 ? `${currentCount}/${unit.cap}` : `${currentCount}/∞`;
      const isMaxed = unit.cap > 0 && currentCount >= unit.cap;
      const cleanName = unit.name.replace(/\s*\[.*?\]\s*/g, '');

      badge.innerHTML = `
        <div class="badge-frame">
          <div class="badge-pill pill-speed" title="机动/类型代码">${speedTag}</div>
          <div class="badge-pill pill-men" title="编制人数">${menCount}</div>
          <div class="badge-pill pill-cap ${isMaxed ? 'maxed' : ''}" title="已选/编制上限">${capDisplay}</div>

          <img class="badge-icon" src="${unit.icon}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'60\\' height=\\'80\\'><rect width=\\'60\\' height=\\'80\\' fill=\\'%23252d3a\\'/></svg>'">

          <div class="pill-cost">
            <span class="coin-icon"></span>
            <span>${unit.cost}</span>
          </div>
        </div>

        <div class="badge-name" title="${unit.name}">
          ${isCom ? '<span style="color:#e5c07b;">[战将] </span>' : ''}${cleanName}
        </div>
      `;

      badge.onclick = () => addUnitToArmy(unit);
      attachTooltip(badge, unit);
      cardsWrap.appendChild(badge);
    });

    groupSection.appendChild(cardsWrap);
    container.appendChild(groupSection);
  });
}

// 悬停属性面板 (Tooltip)
function attachTooltip(element, unit) {
  const tt = document.getElementById('unit-tooltip');
  element.onmouseenter = (e) => {
    const s = unit.stats || {};
    const isCom = isCombatGeneral(unit);
    const isStaff = isStaffGeneral(unit);

    tt.innerHTML = `
      <div class="tt-title">
        ${isCom ? '<span style="color:#e5c07b;">【战斗将军】</span>' : ''}
        ${isStaff ? '<span style="color:#58a6ff;">【统帅将军】</span>' : ''}
        ${unit.name}
      </div>
      <div class="tt-row"><span>招募价格:</span><span class="tt-val">${unit.cost} 金</span></div>
      <div class="tt-row"><span>编制配额:</span><span class="tt-val">${unit.cap > 0 ? unit.cap + ' 队' : '无限制'}</span></div>
      <div class="tt-row"><span>部队人数:</span><span class="tt-val">${s.men || '-'} 人</span></div>
      ${s.guns > 0 ? `<div class="tt-row"><span>火炮门数:</span><span class="tt-val">${s.guns} 门</span></div>` : ''}
      <div class="tt-row"><span>射击精度:</span><span class="tt-val">${s.accuracy || 0}</span></div>
      <div class="tt-row"><span>装填速度:</span><span class="tt-val">${s.reload || 0}</span></div>
      <div class="tt-row"><span>近战攻击:</span><span class="tt-val">${s.melee_attack || 0}</span></div>
      <div class="tt-row"><span>冲锋加成:</span><span class="tt-val">${s.charge_bonus || 0}</span></div>
      <div class="tt-row"><span>近战防御:</span><span class="tt-val">${s.defense || 0}</span></div>
      <div class="tt-row"><span>基础士气:</span><span class="tt-val">${s.morale || 0}</span></div>
    `;
    tt.style.display = 'block';
  };
  element.onmousemove = (e) => {
    tt.style.left = `${e.clientX + 16}px`;
    tt.style.top = `${e.clientY + 12}px`;
  };
  element.onmouseleave = () => {
    tt.style.display = 'none';
  };
}

// 初始化自定义派系选择下拉面板
function initCustomFactionSelector() {
  const trigger = document.getElementById('select-trigger');
  const optionsWrap = document.getElementById('select-options');
  optionsWrap.innerHTML = "";

  State.factions.forEach(fac => {
    const item = document.createElement('div');
    item.className = "option-item";
    item.innerHTML = `
      <img src="${fac.flag}" onerror="this.style.display='none'">
      <span>${fac.name}</span>
    `;
    item.onclick = (e) => {
      e.stopPropagation();
      switchFaction(fac.id);
      optionsWrap.classList.remove('open');
    };
    optionsWrap.appendChild(item);
  });

  trigger.onclick = (e) => {
    e.stopPropagation();
    optionsWrap.classList.toggle('open');
  };

  document.addEventListener('click', () => {
    optionsWrap.classList.remove('open');
  });

  if (State.factions.length > 0) {
    switchFaction(State.factions[0].id);
  }
}

// 切换派系
function switchFaction(facId) {
  State.currentFactionId = facId;
  State.army = [];

  const cur = State.factions.find(f => f.id === facId);
  if (cur) {
    document.getElementById('current-flag-img').src = cur.flag;
    document.getElementById('current-flag-img').style.display = 'inline-block';
    document.getElementById('current-faction-name').textContent = cur.name;
  }

  renderRoster();
  updateArmyUI();
}

// 初始化程序
async function initApp() {
  try {
    const res = await fetch('data/army_data.json');
    if (!res.ok) throw new Error("无法读取本地 army_data.json");
    const data = await res.json();
    State.factions = data.factions;
    State.rosters = data.rosters;
    initCustomFactionSelector();
  } catch (err) {
    console.error("加载数据文件失败:", err);
  }

  // 绑定事件
  document.getElementById('search-input').oninput = renderRoster;
  document.getElementById('cost-range').oninput = (e) => {
    document.getElementById('cost-range-val').textContent = `≤ ${e.target.value}`;
    renderRoster();
  };
  document.getElementById('input-cost-limit').onchange = (e) => {
    State.costLimit = parseInt(e.target.value) || 14000;
    updateArmyUI();
  };
  document.getElementById('btn-clear-army').onclick = () => {
    State.army = [];
    updateArmyUI();
    renderRoster();
  };

  // 分类 Tab 过滤
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderRoster();
    };
  });

  // 导出配置
  document.getElementById('btn-export').onclick = () => {
    const payload = {
      fac: State.currentFactionId,
      units: State.army.map(u => u.key)
    };
    navigator.clipboard.writeText(JSON.stringify(payload));
    showToast("配兵代码已复制到剪贴板！", true);
  };

  // 导入配置
  document.getElementById('btn-import').onclick = () => {
    const raw = prompt("请输入导出的 JSON 配兵代码：");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.fac && State.rosters[data.fac]) {
        switchFaction(data.fac);
        const pool = State.rosters[data.fac];
        data.units.forEach(key => {
          const match = pool.find(u => u.key === key);
          if (match) addUnitToArmy(match);
        });
      }
    } catch (e) {
      showToast("配置数据格式有误，导入失败！");
    }
  };

  renderBottomTray();
}

window.onload = initApp;
