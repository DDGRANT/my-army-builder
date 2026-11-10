// 全局状态管理
const State = {
  factions: [],
  rosters: {},
  currentFactionId: null,
  army: [], // 最大 30 队
  costLimit: 14000,
  maxTotalUnits: 30,     // 对应 max_units_all = 30
  maxArtillery: 3,      // 对应 max_artillery = 3
  maxMob: 3,            // 对应 max_mob = 3 (战斗将军固定上限3)
  maxHeavyCavArt: 7     // 对应 max_heavy_cav_art = 7 (重骑兵+火炮联合上限)
};

// 严格对齐新 Lua 代码中的 Class 判定集合[cite: 2]
const ClassGroup = {
  // CountLineInfantry: "线列步兵" | "轻步兵" | "非正规步兵"[cite: 2]
  LINE: ["线列步兵", "轻步兵", "非正规步兵"],
  // CountSkirmishers: "散兵"[cite: 2]
  SKIRMISHER: ["散兵"],
  // CountGrenadiers: "掷弹兵"[cite: 2]
  GRENADIER: ["掷弹兵"],
  // CountEliteInfantry: "精锐步兵"[cite: 2]
  ELITE: ["精锐步兵"],
  // CountArtillery / UnitsArtilleryMaxed: "步兵炮" | "骑乘炮兵"[cite: 2]
  ARTILLERY: ["步兵炮", "骑乘炮兵"],
  // CountHeavyCavalry: "重骑兵"[cite: 2]
  HEAVY_CAV: ["重骑兵"],
  // CountmobInfantry / UnitsmobMaxed: "战斗将军"[cite: 2]
  MOB: ["战斗将军"]
};

// 统计特定 Key 的单位数量（对齐新 Lua 的 UnitsOfType）[cite: 2]
function countUnitsOfKey(key) {
  return State.army.filter(u => u.key === key).length;
}

// 统计特定 Class 类别的单位总数
function countUnitsByClasses(classList) {
  return State.army.filter(u => classList.includes(u.class_type)).length;
}

// 对应新版 Lua 的 AddUnit 前置判定条件[cite: 2]
function validateAddUnit(unit) {
  const currentCost = State.army.reduce((sum, u) => sum + u.cost, 0);

  // 1. 金额预算检查: TotalCost + cost <= cost_limit[cite: 2]
  if (currentCost + unit.cost > State.costLimit) {
    alert("超出军费预算上限！");
    return false;
  }

  // 2. 总单位数上限检查: TotalCards < max_units_all (30)[cite: 2]
  if (State.army.length >= State.maxTotalUnits) {
    alert(`全军编制已满（最大容量 ${State.maxTotalUnits} 队）！`);
    return false;
  }

  // 3. 单位自身 Cap 检查: details.Cap == 0 or UnitsOfType(details.Key) < details.Cap[cite: 2]
  if (unit.cap > 0 && countUnitsOfKey(unit.key) >= unit.cap) {
    alert(`该单位已达到招募上限（编制上限: ${unit.cap} 队）！`);
    return false;
  }

  // 4. 战斗将军上限检查: max_mob = 3[cite: 2]
  const currentMob = countUnitsByClasses(ClassGroup.MOB);
  if (ClassGroup.MOB.includes(unit.class_type) && currentMob >= State.maxMob) {
    alert("战斗将军已达到全军招募上限（最多 3 队）！");
    return false;
  }

  // 5. 火炮上限检查: max_artillery = 3[cite: 2]
  const currentArt = countUnitsByClasses(ClassGroup.ARTILLERY);
  if (ClassGroup.ARTILLERY.includes(unit.class_type) && currentArt >= State.maxArtillery) {
    alert("火炮（步兵炮/骑乘炮兵）已达上限（最多 3 门）！");
    return false;
  }

  // 6. 重骑兵与火炮联合上限检查: current_heavy_cav + current_artillery <= 7[cite: 2]
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

  // 7. 线列步兵联动上限计算[cite: 2]
  const lineCount = countUnitsByClasses(ClassGroup.LINE);
  const maxSkirmisher = Math.floor(lineCount * 2);        // line * 2[cite: 2]
  const maxGrenadier = Math.floor(lineCount / 1.5);       // line / 1.5[cite: 2]
  const maxElite = Math.floor(lineCount / 2);             // line / 2[cite: 2]

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

// 添加单位到配置中
function addUnitToArmy(unit) {
  if (validateAddUnit(unit)) {
    State.army.push(unit);
    updateArmyState();
  }
}

// 移除单位 (对应 Lua 的 OnDivorceChild)[cite: 2]
function removeUnitFromArmy(index) {
  State.army.splice(index, 1);
  // 移除线列步兵时触发联级超额检查与自动剔除[cite: 2]
  cullExcessUnits();
  updateArmyState();
}

// 对应 Lua 的 RemoveExcessUnits 自动剔除逻辑[cite: 2]
function cullExcessUnits() {
  const lineCount = countUnitsByClasses(ClassGroup.LINE);
  const maxSkirmisher = Math.floor(lineCount * 2);
  const maxGrenadier = Math.floor(lineCount / 1.5);
  const maxElite = Math.floor(lineCount / 2);

  // 倒序检查并剔除超出限额的散兵、掷弹兵、精锐步兵[cite: 2]
  removeExcessByClass(ClassGroup.SKIRMISHER, maxSkirmisher);
  removeExcessByClass(ClassGroup.GRENADIER, maxGrenadier);
  removeExcessByClass(ClassGroup.ELITE, maxElite);
  
  // 检查战斗将军超额 (固定上限 3)[cite: 2]
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

// 刷新界面仪表盘数字
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

  // 联动配额标签
  document.getElementById('pill-line').textContent = `线列步兵: ${lineCount}`;
  document.getElementById('pill-skirmisher').textContent = `散兵: ${currentSkirmisher} / ${Math.floor(lineCount * 2)}`;
  document.getElementById('pill-grenadier').textContent = `掷弹兵: ${currentGrenadier} / ${Math.floor(lineCount / 1.5)}`;
  document.getElementById('pill-elite').textContent = `精锐步兵: ${currentElite} / ${Math.floor(lineCount / 2)}`;

  renderArmyGrid();
}
