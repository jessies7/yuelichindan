const STORAGE_KEY = 'starBeastPrototypeStateV2';
const LEGACY_STORAGE_KEY = 'starBeastPrototypeState';
const PLANNER_STORAGE_KEY = 'mobileCalendarPlannerItemsV1';
const PLANNER_MONTH_KEY = 'mobileCalendarPlannerMonthV1';
const TEAM_LIMIT = 7;
const PITY_LIMIT = 40;
const TEST_MODE = true;

const defaultPlannerItems = [
  { id: 'plan-1', title: '早上整理今日重点', date: '2026-06-15', note: '先把当天必须完成的事写清楚。' },
  { id: 'plan-2', title: '给朋友回消息', date: '2026-06-15', note: '不要拖到晚上。' },
  { id: 'plan-3', title: '预约体检', date: '2026-06-18', note: '确认可预约时间。' },
  { id: 'plan-4', title: '整理照片备份', date: '2026-06-22', note: '手机相册和电脑同步一次。' },
  { id: 'plan-5', title: '买新的便签纸', date: null, note: '路过文具店再买。' },
  { id: 'plan-6', title: '想一个小组件名字', date: '', note: '先记着，不急着安排。' }
];

let plannerItems = loadPlannerItems();
let plannerMonthKey = loadPlannerMonthKey();
let plannerFormOpen = false;
let editingPlannerId = null;
let selectedPlannerId = null;
let plannerDetailReturnPanel = null;
let pendingDeletePlannerId = null;
let plannerCompletedOpen = false;
let plannerMonthPanelOpen = false;
let plannerDraftTitle = '';
let plannerDraftNote = '';
let plannerDraftDate = '';
let plannerDraftHistory = [];
let plannerDraftHistoryIndex = -1;
let plannerDraftHistoryById = {};
let plannerDraftHistoryKey = '';
let plannerDayViewDate = null;
let plannerIdeaPopoverId = null;
let plannerIdeaPopoverPoint = { x: 18, y: 86 };
let plannerIdeaClickTimer = null;
let plannerIdeaTouchLock = null;
let plannerSelectedDateKey = null;
let plannerDraggedDayItemId = null;
let plannerDragTargetDayItemId = null;
let plannerDragInsertAfter = false;
let plannerSwipeOpenId = null;
let plannerSwipeTouch = null;
let plannerSwipeSuppressClickId = null;
let plannerRecentSavedId = null;
let plannerRecentSavedTimer = null;

function loadPlannerMonthKey() {
  try {
    const saved = localStorage.getItem(PLANNER_MONTH_KEY);
    return /^\d{4}-\d{2}$/.test(saved || '') ? saved : formatPlannerMonthKey(new Date());
  } catch (error) {
    return formatPlannerMonthKey(new Date());
  }
}

function savePlannerMonthKey() {
  localStorage.setItem(PLANNER_MONTH_KEY, plannerMonthKey);
}

function formatPlannerMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatPlannerMonthLabel(value) {
  if (!/^\d{4}-\d{2}$/.test(value || '')) return formatPlannerMonthKey(new Date()).replace('-', '.');
  const [year, month] = value.split('-').map(Number);
  return `${year}.${month}`;
}

function parsePlannerMonthKey(value) {
  if (!/^\d{4}-\d{2}$/.test(value || '')) return new Date();
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function normalizePlannerItem(item, index) {
  const title = String(item?.title || '').trim();
  return {
    id: String(item?.id || `plan-default-${index}`),
    title: title || '未命名日程',
    date: isValidPlannerDateKey(item?.date) ? item.date : '',
    note: String(item?.note || '').trim() || '未填写备注。',
    order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
    completed: item?.completed === true
  };
}

function loadPlannerItems() {
  try {
    const saved = localStorage.getItem(PLANNER_STORAGE_KEY);
    if (!saved) return clone(defaultPlannerItems).map(normalizePlannerItem);
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map(normalizePlannerItem) : clone(defaultPlannerItems).map(normalizePlannerItem);
  } catch (error) {
    return clone(defaultPlannerItems).map(normalizePlannerItem);
  }
}

function savePlannerItems() {
  localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(plannerItems));
}

function escapePlannerValue(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function currentPlannerDraftSnapshot() {
  return { title: plannerDraftTitle, note: plannerDraftNote, date: plannerDraftDate };
}

function applyPlannerDraftSnapshot(snapshot) {
  plannerDraftTitle = snapshot?.title || '';
  plannerDraftNote = snapshot?.note || '';
  plannerDraftDate = snapshot?.date || '';
}

function saveCurrentPlannerDraftHistory() {
  if (!plannerDraftHistoryKey) return;
  plannerDraftHistoryById[plannerDraftHistoryKey] = {
    history: plannerDraftHistory,
    index: plannerDraftHistoryIndex
  };
}

function resetPlannerDraftHistory(key = editingPlannerId || 'new-planner-item') {
  plannerDraftHistoryKey = key;
  const stored = plannerDraftHistoryById[key];
  if (stored?.history?.length) {
    plannerDraftHistory = stored.history;
    plannerDraftHistoryIndex = Math.min(stored.index, plannerDraftHistory.length - 1);
    applyPlannerDraftSnapshot(plannerDraftHistory[plannerDraftHistoryIndex]);
    return;
  }
  plannerDraftHistory = [currentPlannerDraftSnapshot()];
  plannerDraftHistoryIndex = 0;
  saveCurrentPlannerDraftHistory();
}

function recordPlannerDraftHistory() {
  const snapshot = currentPlannerDraftSnapshot();
  const current = plannerDraftHistory[plannerDraftHistoryIndex];
  if (current && current.title === snapshot.title && current.note === snapshot.note && current.date === snapshot.date) return;
  plannerDraftHistory = plannerDraftHistory.slice(0, plannerDraftHistoryIndex + 1);
  plannerDraftHistory.push(snapshot);
  plannerDraftHistoryIndex = plannerDraftHistory.length - 1;
  saveCurrentPlannerDraftHistory();
}

function movePlannerDraftHistory(oldKey, newKey) {
  if (!oldKey || !newKey || oldKey === newKey || !plannerDraftHistoryById[oldKey]) return;
  plannerDraftHistoryById[newKey] = plannerDraftHistoryById[oldKey];
  delete plannerDraftHistoryById[oldKey];
  plannerDraftHistoryKey = newKey;
}

function undoPlannerDraft() {
  if (plannerDraftHistoryIndex <= 0) return;
  plannerDraftHistoryIndex -= 1;
  applyPlannerDraftSnapshot(plannerDraftHistory[plannerDraftHistoryIndex]);
  saveCurrentPlannerDraftHistory();
  render();
}

function redoPlannerDraft() {
  if (plannerDraftHistoryIndex >= plannerDraftHistory.length - 1) return;
  plannerDraftHistoryIndex += 1;
  applyPlannerDraftSnapshot(plannerDraftHistory[plannerDraftHistoryIndex]);
  saveCurrentPlannerDraftHistory();
  render();
}

function plannerTextFallback(text) {
  return String(text || '').trim().slice(0, 14) || '未命名事项';
}

function comparePlannerItems(a, b) {
  const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
  if (dateCompare !== 0) return dateCompare;
  return (Number(a.order) || 0) - (Number(b.order) || 0);
}

function nextPlannerOrderForDate(dateKey) {
  const sameDayOrders = plannerItems
    .filter((item) => item.date === dateKey)
    .map((item) => Number(item.order) || 0);
  return sameDayOrders.length ? Math.max(...sameDayOrders) + 1 : 0;
}

function reorderPlannerDayItems(sourceId, targetId, insertAfter = false) {
  if (!plannerDayViewDate || !sourceId || !targetId || sourceId === targetId) return;
  const dayItems = plannerItems
    .filter((item) => item.date === plannerDayViewDate)
    .sort(comparePlannerItems);
  const sourceIndex = dayItems.findIndex((item) => item.id === sourceId);
  const targetIndex = dayItems.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [movedItem] = dayItems.splice(sourceIndex, 1);
  const adjustedTargetIndex = dayItems.findIndex((item) => item.id === targetId);
  const insertIndex = adjustedTargetIndex + (insertAfter ? 1 : 0);
  dayItems.splice(insertIndex, 0, movedItem);
  const orderById = new Map(dayItems.map((item, index) => [item.id, index]));
  plannerItems = plannerItems.map((item) => item.date === plannerDayViewDate && orderById.has(item.id)
    ? { ...item, order: orderById.get(item.id) }
    : item);
  savePlannerItems();
  render();
}

function savePlannerDraft(options = {}) {
  const { close = true, silent = false } = options;
  const title = String(plannerDraftTitle || '').trim() || plannerTextFallback(plannerDraftNote);
  const note = String(plannerDraftNote || '').trim();
  if (!String(plannerDraftTitle || '').trim() && !note) {
    if (close) {
      plannerFormOpen = false;
      editingPlannerId = null;
      pendingDeletePlannerId = null;
    }
    if (!silent) render('先写标题或正文。');
    return false;
  }
  const wasNewItem = !editingPlannerId;
  const nextItem = {
    id: editingPlannerId || `plan-${Date.now()}`,
    title,
    date: isValidPlannerDateKey(plannerDraftDate) ? plannerDraftDate : '',
    note: note || '未填写具体内容。',
    order: editingPlannerId
      ? Number(plannerItems.find((item) => item.id === editingPlannerId)?.order) || 0
      : nextPlannerOrderForDate(isValidPlannerDateKey(plannerDraftDate) ? plannerDraftDate : ''),
    completed: editingPlannerId ? plannerItems.find((item) => item.id === editingPlannerId)?.completed === true : false
  };
  plannerItems = editingPlannerId
    ? plannerItems.map((item) => item.id === editingPlannerId ? nextItem : item)
    : [...plannerItems, nextItem];
  if (wasNewItem) movePlannerDraftHistory('new-planner-item', nextItem.id);
  plannerRecentSavedId = nextItem.date ? nextItem.id : null;
  savePlannerItems();
  if (close) {
    plannerFormOpen = false;
    editingPlannerId = null;
    selectedPlannerId = null;
    pendingDeletePlannerId = null;
  }
  if (!silent) render(nextItem.date ? '日程已保存，并同步日历。' : '日程已保存到想法。');
  clearTimeout(plannerRecentSavedTimer);
  if (plannerRecentSavedId) {
    plannerRecentSavedTimer = setTimeout(() => {
      plannerRecentSavedId = null;
      render();
    }, 1600);
  }
  return true;
}

function addPlannerItem(form) {
  const formData = new FormData(form);
  plannerDraftTitle = String(formData.get('title') || '');
  plannerDraftNote = String(formData.get('note') || '');
  plannerDraftDate = String(formData.get('date') || '');
  savePlannerDraft();
}

function openPlannerEditor(itemId) {
  const item = plannerItems.find((plannerItem) => plannerItem.id === itemId);
  editingPlannerId = itemId;
  selectedPlannerId = itemId;
  plannerDetailReturnPanel = null;
  pendingDeletePlannerId = null;
  plannerDraftTitle = item?.title || '';
  plannerDraftNote = item?.note === '未填写具体内容。' || item?.note === '未填写备注。' ? '' : item?.note || '';
  plannerDraftDate = item?.date || '';
  resetPlannerDraftHistory(itemId);
  plannerFormOpen = true;
  render();
}

function requestDeletePlannerItem(itemId) {
  pendingDeletePlannerId = itemId;
  selectedPlannerId = itemId;
  plannerDetailReturnPanel = null;
  render();
}

function cancelDeletePlannerItem() {
  pendingDeletePlannerId = null;
  render();
}

function deletePlannerItem(itemId) {
  plannerItems = plannerItems.filter((item) => item.id !== itemId);
  if (editingPlannerId === itemId) editingPlannerId = null;
  if (selectedPlannerId === itemId) selectedPlannerId = null;
  plannerDetailReturnPanel = null;
  pendingDeletePlannerId = null;
  if (plannerSelectedDateKey && !plannerItems.some((item) => item.date === plannerSelectedDateKey)) plannerSelectedDateKey = null;
  plannerFormOpen = false;
  savePlannerItems();
  render('日程已删除。');
}

function completePlannerItem(itemId) {
  plannerItems = plannerItems.map((item) => item.id === itemId ? { ...item, completed: true } : item);
  selectedPlannerId = null;
  plannerDetailReturnPanel = null;
  pendingDeletePlannerId = null;
  savePlannerItems();
  render('安排已收纳。');
}

function restorePlannerItem(itemId) {
  plannerItems = plannerItems.map((item) => item.id === itemId ? { ...item, completed: false } : item);
  if (selectedPlannerId === itemId) selectedPlannerId = null;
  plannerDetailReturnPanel = null;
  if (!plannerItems.some((item) => item.completed)) plannerCompletedOpen = false;
  savePlannerItems();
  render('安排已移出。');
}

function closePlannerForm() {
  if (plannerFormOpen) {
    savePlannerDraft({ silent: true });
    render();
    return;
  }
  plannerFormOpen = false;
  editingPlannerId = null;
  selectedPlannerId = null;
  plannerDetailReturnPanel = null;
  pendingDeletePlannerId = null;
  render();
}

function clearPlannerDraft() {
  plannerDraftTitle = '';
  plannerDraftNote = '';
  render();
}

const ELEMENTS = {
  金: { key: 'metal', name: '金', vibe: '锋锐守护' },
  木: { key: 'wood', name: '木', vibe: '生长治愈' },
  水: { key: 'water', name: '水', vibe: '潮汐控制' },
  火: { key: 'fire', name: '火', vibe: '爆发灼烧' },
  土: { key: 'earth', name: '土', vibe: '厚重防御' },
  光: { key: 'light', name: '光', vibe: '净化祝福' },
  暗: { key: 'dark', name: '暗', vibe: '影袭诅咒' },
  风: { key: 'wind', name: '风', vibe: '迅捷扰动' },
  雷: { key: 'thunder', name: '雷', vibe: '连锁爆鸣' }
};
const NORMAL_ELEMENTS = ['金', '木', '水', '火', '土'];
const MUTATION_ELEMENTS = ['光', '暗', '风', '雷'];
const ALL_ELEMENTS = [...NORMAL_ELEMENTS, ...MUTATION_ELEMENTS];
const TALENTS = ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F'];
const TALENT_RATES = [
  { talent: 'SSS', owner: 6 },
  { talent: 'SS', owner: 10 },
  { talent: 'S', owner: 16 },
  { talent: 'A', owner: 18 },
  { talent: 'B', owner: 16 },
  { talent: 'C', owner: 14 },
  { talent: 'D', owner: 10 },
  { talent: 'E', owner: 6 },
  { talent: 'F', owner: 4 }
];

const BEAST_NAMES = {
  金: ['鎏金角狮', '星铠麟驹', '白金冠隼', '琉璃剑尾狐', '辉纹小麒麟', '金铃晶鹿'],
  木: ['森语鹿灵', '青藤花豹', '翠羽芽雀', '眠叶小鹿', '灵蔓狐仙', '碧枝绒兔'],
  水: ['潮汐鳞兽', '镜湖月鲤', '雾泉水灵', '蓝湾鲸歌兽', '冰绡海狐', '澄露贝狸'],
  火: ['余烬幼龙', '绯焰灵狐', '赤羽焰雀', '暖炉绒狮', '烛心小龙', '霞火尾猫'],
  土: ['岩壳龟', '砂脊角兽', '琥珀岩羊', '泥金小熊', '山眠厚甲犀', '砾星团狸'],
  光: ['曦光圣鹿', '白昼羽龙', '晨星辉蝶', '银冕光狐', '耀羽星马', '琉光祈愿兽'],
  暗: ['月影灵狐', '幽夜蝠兽', '黑曜梦貘', '暮纱影猫', '星渊渡鸦', '夜铃冥鹿'],
  风: ['岚翼云隼', '风铃猫妖', '青岚羽狐', '流云踏燕兽', '晴风绒龙', '旋羽小狮'],
  雷: ['雷纹幼虎', '霆角兽', '紫电云豹', '鸣雷晶狼', '闪弧羽蛇', '雷铃迅狐']
};
const EGG_FEATURES = {
  金: ['鎏金壳纹', '星砂硬壳', '辉冠浮雕', '镜金光泽'],
  木: ['青藤缠纹', '眠叶软壳', '翠芽凸纹', '春露斑点'],
  水: ['潮汐波纹', '镜湖蓝壳', '雾蓝珠光', '雨痕水线'],
  火: ['绯焰壳纹', '余烬暖壳', '烛心红光', '霞火斑纹'],
  土: ['琥珀厚纹', '岩晶硬壳', '砂星颗粒', '山纹壳脊'],
  光: ['曦光圣纹', '晨星透壳', '白昼辉环', '银辉流线'],
  暗: ['月影暗纹', '黑曜镜壳', '幽夜雾痕', '星渊雾环'],
  风: ['流岚羽纹', '云羽薄壳', '风铃弧线', '晴岚旋纹'],
  雷: ['雷弧刻纹', '紫霆晶壳', '鸣闪流线', '电纹亮斑']
};
const TRAITS = ['灵敏', '贪睡', '护主', '好奇', '勇敢', '温顺', '高傲', '黏人', '机警', '爱发光'];
const MATRI_CLANS = ['旧巢亲缘', '月谷支系', '根脉巢群', '岩窝长辈群', '雾谷育幼群', '星痕蛋守一支'];
const HABITAT_NOTES = {
  金: ['矿脉断崖', '古旧矿洞边缘', '含金属盐的高山石坡'],
  木: ['雾林根网', '古树腹地', '长满苔花的溪谷'],
  水: ['镜湖浅湾', '潮湿石滩', '雨季漫水林'],
  火: ['余烬坡地', '温热岩穴', '火山灰草原'],
  土: ['风化岩台', '化石砂丘', '厚土洞群'],
  光: ['晨辉照落的圣白草场', '星光沉积的高原', '日出前发亮的浅谷'],
  暗: ['月谷阴坡', '梦影洞穴', '夜露凝重的黑草地'],
  风: ['高岭风道', '云巢崖壁', '长年有回旋气流的草坡'],
  雷: ['雷雨后的磁石林', '紫电击中过的山脊', '带静电的风暴洼地']
};
const BODY_MARKS = {
  金: ['角冠会听见矿层深处的轻响', '肩侧生着薄而坚韧的矿质鳞片', '脚掌能在碎石上留下细金色擦痕'],
  木: ['毛尖常挂着未落的晨露', '角枝会随季节长出不同嫩芽', '脊背有像根脉一样的浅绿纹路'],
  水: ['呼吸时喉侧泛起细小水纹', '尾端常凝着一圈雾珠', '鳞片在阴天会变得接近湖色'],
  火: ['胸口有不灼人的温热火核', '尾尖偶尔落下细小余烬', '耳后绒毛像被晚霞染过'],
  土: ['背甲嵌着细碎砂晶', '爪缝里常带着同族巢穴的土息', '行走时几乎没有多余声响'],
  光: ['羽缘会在黎明前先亮起', '瞳孔里像藏着一粒晨星', '身侧纹路随日照慢慢浮现'],
  暗: ['尾毛边缘会散成薄雾', '脚步声常比影子更晚出现', '眼侧月纹在安静时最清楚'],
  风: ['颈羽会提前感到气压变化', '奔跑时身后留下一线浅浅风痕', '骨架轻得像能被山风托起'],
  雷: ['毛根偶尔跳出紫色微弧', '耳尖能听见远处云层的摩擦声', '奔跑前爪下会先亮一下']
};
const SOCIAL_NOTES = {
  金: ['矿路记忆会从熟悉崖道的长辈传给幼兽', '巢群常沿着旧爪痕和气味点辨认安全崖路'],
  木: ['幼兽常由整个根巢共同照看', '年长个体会记住每片林地的花期和安全路径'],
  水: ['巢群会按雨季迁徙，年幼个体跟随会辨潮的长辈', '湖湾里的蛋室由几支亲缘水脉轮流守护'],
  火: ['育幼期会围绕稳定温岩分配巢穴', '火核稳定的长辈常带幼兽穿过冷灰地带'],
  土: ['洞群由记得地层变化的老兽维护', '幼兽会在长辈挖出的浅坑里学习辨认震动'],
  光: ['晨辉巢群会由能预知日照变化的长辈守护蛋室', '幼兽会先学会跟随亲缘个体身上的光纹'],
  暗: ['月谷支系通过亲缘尾纹识别彼此', '幼兽的梦路由年长个体在夜里慢慢引导'],
  风: ['迁徙路线通常由记风的长辈决定', '云巢幼兽会被几位亲近长辈轮流带到低风坡练习'],
  雷: ['雷雨季由最会判断云声的长辈决定是否迁巢', '幼兽在亲缘巢群边缘学习控制第一缕电弧']
};
const SOURCE_NOTES = {
  summon: ['它回应召唤时并不像被收服，更像暂时认可了一段同行关系', '星辉契约只打开门，真正的亲近仍要靠日常相处', '它来到御兽师身边时，仍保留着原本族群的气味和习惯'],
  hatch: ['从蛋中醒来的个体会先记住第一枚金币的魔力温度', '孵化后的几天里，它仍会寻找蛋壳残留的气息', '它对御兽师的信任，往往从金币敲响蛋壳的那一刻开始']
};
const SKILL_NAMES = {
  金: ['星金护阵', '辉刃回旋', '鎏金壁垒'],
  木: ['藤芽复苏', '森语缠绕', '翠冠祝生'],
  水: ['镜湖潮涌', '雾泉回响', '蓝湾涟击'],
  火: ['余烬爆燃', '绯焰扑击', '烛心灼光'],
  土: ['岩脊守势', '琥珀震踏', '砂星护甲'],
  光: ['曦光赐福', '白昼净羽', '晨星裁决'],
  暗: ['月影伏袭', '幽夜低语', '黑曜梦咒'],
  风: ['岚翼疾行', '风铃乱舞', '流云闪步'],
  雷: ['紫霆连闪', '雷纹突袭', '鸣闪过载']
};
const SKILL_EFFECTS = {
  金: ['凝成金色护盾，像矿脉在皮毛下短暂回声。', '挥出锋锐辉光，动作来自它们清理崖道碎石的本能。'],
  木: ['释放藤芽生机，周围草叶会顺着它的呼吸轻轻抬起。', '召来森风缠绕，像在雾林里标记一条只有同族能懂的路径。'],
  水: ['引动潮汐水纹，水面会短暂映出它真正想去的方向。', '以雾泉包裹自身，像把雨季清晨披在身上。'],
  火: ['喷出余烬火星，那是幼兽在温岩边练习控温时留下的动作。', '点燃烛心火环，火光更像呼吸而不是单纯攻击。'],
  土: ['踏出岩脊冲击，地下细砂会回应它的步伐。', '唤起砂星护甲，像把巢穴深处的土息暂时覆在身上。'],
  光: ['洒下曦光羽尘，晨辉会沿着毛羽纹路慢慢展开。', '凝成晨星光束，像它抬头确认日出方向时的本能反应。'],
  暗: ['潜入月影，尾雾会先替它试探道路。', '释放幽夜低语，那声音更像月谷深处的回声。'],
  风: ['踏风闪身，颈羽会先于身体感到气压变化。', '掀起流岚羽刃，像幼兽在高岭风道里练习转向。'],
  雷: ['跃动紫电连锁，毛根间的电弧像远雷提前醒来。', '蓄起鸣闪电弧，爪下会亮起一瞬风暴前的白光。']
};

const BEAST_ASSETS = {
  '鎏金角狮': 'assets/beast-metal-liujin-jiaoshi-v1.png',
  '森语鹿灵': 'assets/beast-wood-senyu-luling-v1.png',
  '月影灵狐': 'assets/beast-dark-yueying-linghu-v4-hero.png'
};

const EGG_ASSETS = {
  金: ['assets/egg-metal-liujin-shell-v2.png'],
  木: ['assets/egg-wood-senyu-vine-shell-v2.png'],
  暗: ['assets/egg-dark-yueying-moonmist-intact-v5.png']
};

const BEAST_CODEX = {
  '鎏金角狮': {
    species: '矿脉角狮',
    discoveredAt: '矿脉断崖',
    eggName: '鎏金壳纹宠兽蛋',
    eggAsset: 'assets/egg-metal-liujin-shell-v2.png',
    eggNote: '蛋壳像金属盐与星砂压成的硬壳，表面有角冠般的浮雕和矿层回声纹。它保持完整时会在碎石间低低共鸣，只有真正破壳前才会出现裂痕。',
    forms: [
      { title: '正视', asset: 'assets/beast-metal-liujin-jiaoshi-v3-front.png', note: '正视图展示角冠、前爪和肩侧矿质鳞片；角冠是感知矿层回声的器官，不是王冠。', required: true },
      { title: '侧视', asset: 'assets/beast-metal-liujin-jiaoshi-v3-side.png', note: '侧视图能看出它厚实但不笨重的崖地体态，适合在碎石坡和断崖边移动。', required: true },
      { title: '背视', asset: 'assets/beast-metal-liujin-jiaoshi-v3-back.png', note: '背视图展示肩背矿质鳞片如何沿身体分布，像自然长出的护层。', required: true }
    ],
    features: [
      { title: '角冠矿纹', asset: 'assets/beast-metal-liujin-jiaoshi-v2-horn-detail.png', note: '代表性细节之一：角冠内的矿纹用于听见断崖和矿层深处的轻响。', required: true },
      { title: '肩侧矿鳞', asset: 'assets/beast-metal-liujin-jiaoshi-v2-shoulder-scale-detail.png', note: '代表性细节之一：肩侧矿质鳞片能挡住落石碎屑，却不像外加盔甲。', required: true },
      { title: '崖地脚掌', asset: 'assets/beast-metal-liujin-jiaoshi-v3-paw-pad-detail.png', note: '代表性细节之一：脚掌有厚实垫面、弯爪和细金擦痕，适合抓住粗糙矿岩，不再作为抓拍临时图。', required: true }
    ],
    ecology: {
      diet: { value: '会舔食矿脉断崖上的金属盐和晨露，也会在旧矿洞边缘吸收微弱矿息。', explain: '它们不靠吞食金属成长，真正重要的是矿盐、晨露和地层回声共同形成的属性流。' },
      habit: [
        { label: '矿脉共鸣', explain: '角冠能听见岩层深处的轻响，因此它们常在落石前先离开危险崖道。' },
        { label: '崖路记忆', explain: '幼兽会沿着长辈留下的气味和爪痕学习断崖路线，久而久之能记住哪些碎石能踩、哪些会塌。' }
      ],
      weakness: { value: '潮湿泥地会削弱爪垫与矿岩的摩擦，也会让角冠回声变钝。', explain: '鎏金角狮最适合干燥、含矿盐的崖地；进入泥地后，它的感知和移动优势都会下降。' }
    }
  },
  '森语鹿灵': {
    species: '雾林鹿灵',
    discoveredAt: '雾林根网',
    eggName: '青藤缠纹宠兽蛋',
    eggAsset: 'assets/egg-wood-senyu-vine-shell-v2.png',
    eggNote: '蛋壳像柔韧叶壳与细藤交叠而成，表面覆着晨露和根脉微光。完整蛋壳会在古树根旁轻轻起伏，像听见地下根路的呼吸。',
    forms: [
      { title: '正视', asset: 'assets/beast-wood-senyu-luling-v2-front.png', note: '正视图展示嫩芽鹿角、胸前根脉纹和轻步站姿，整体像能无声穿过雾林。', required: true },
      { title: '侧视', asset: 'assets/beast-wood-senyu-luling-v2-side.png', note: '侧视图展示细长肢体、脊背根纹和不折枝叶的移动方式。', required: true },
      { title: '背视', asset: 'assets/beast-wood-senyu-luling-v2-back.png', note: '背视图展示背部根路纹和角枝轮廓，像把雾林旧路记在身上。', required: true },
      { title: '眠叶守径态', asset: 'assets/beast-wood-senyu-luling-v2-sleepingleaf-path.png', note: '自然特殊状态：它在标记安全根路时低头贴近地面，角枝嫩芽微亮，脚下细藤显出旧路。', required: false }
    ],
    features: [
      { title: '嫩芽鹿角', note: '这张细节需要重生：当前生成图过于真实照片感，暂不接入为完成资产。', required: true, pendingAsset: true },
      { title: '根脉背纹', asset: 'assets/beast-wood-senyu-luling-v2-rootline-detail.png', note: '代表性细节之一：背纹像浅浅根路，用来与古树交换季节讯息。', required: true },
      { title: '晨露毛尖', asset: 'assets/beast-wood-senyu-luling-v2-dewfur-detail.png', note: '代表性细节之一：毛尖常挂晨露，经过雾林时很少折断枝叶。', required: true }
    ],
    ecology: {
      diet: { value: '主要吸收雾林晨露、苔花微息和古树根网散出的木属性气息。', explain: '森语鹿灵并不大量啃食树叶；它们更依赖雾林清晨的湿润属性流，因此常在日出前后活动。' },
      habit: [
        { label: '根路引导', explain: '它会用角枝和蹄边细藤显出旧路，让幼兽或迷路的小型宠兽避开潮湿陷根。' },
        { label: '季节讯息', explain: '角枝嫩芽会随花期和雨季变化，像与古树交换一段很慢的讯息。' }
      ],
      weakness: { value: '离开雾林太久时，角枝嫩芽会暂时收拢，根路感知也会变慢。', explain: '它的属性流依赖湿润根网和晨露；干燥空旷地带会让它难以判断安全路径。' }
    }
  },
  '月影灵狐': {
    species: '暗影灵狐',
    discoveredAt: '月谷深处',
    eggName: '月影暗纹宠兽蛋',
    eggAsset: 'assets/egg-dark-yueying-moonmist-intact-v5.png',
    codexSheet: 'assets/beast-dark-yueying-linghu-v4-codex-sheet.png',
    eggNote: '只产自月谷最深处。完整蛋壳像吸收过整夜月雾的暗蓝石质，月相暗纹和尾雾状壳纹会随梦息缓慢移动；只有真正临近破壳时才会出现细裂。',
    forms: [
      { title: '正视', asset: 'assets/beast-dark-yueying-linghu-v5-front.png', note: '正视图展示脸部比例、眼侧月纹、胸前毛流和前肢站姿。', required: true },
      { title: '侧视', asset: 'assets/beast-dark-yueying-linghu-v5-side.png', note: '侧视图展示长肢、背线和尾雾长度，能看出它绕过视线死角的行动方式。', required: true },
      { title: '背视', asset: 'assets/beast-dark-yueying-linghu-v5-back.png', note: '背视图展示背纹、尾根、亲缘尾纹与尾雾散开结构。', required: true },
      { title: '月雾潜行态', asset: 'assets/beast-dark-yueying-linghu-v5-moonmist-prowl.png', note: '自然特殊状态：它在守巢或引导幼兽时会压低身体并散开尾雾。', required: false }
    ],
    features: [
      { title: '月纹眼部', asset: 'assets/beast-dark-yueying-linghu-v5-eye-detail.png', note: '代表性细节之一：眼侧弧纹辅助分辨梦息和月光边界。', required: true },
      { title: '尾雾纹路', asset: 'assets/beast-dark-yueying-linghu-v5-tailmist-detail.png', note: '代表性细节之一：尾雾用于遮蔽巢穴气息和引导幼兽回巢。', required: true },
      { title: '紫垫脚掌', asset: 'assets/beast-dark-yueying-linghu-v5-paw-detail.png', note: '可选细节：脚垫带淡紫色微光，落地声常比影子更晚出现。', required: false }
    ],
    ecology: {
      diet: { value: '以月光和梦境残影为主，也会舔食夜露中沉积的暗属性微尘。', explain: '这类食性让月影灵狐很少主动猎杀大型生物，它们更依赖夜间环境中的微弱能量，因此月谷深夜比白天更适合它们活动。' },
      habit: [
        { label: '月影潜行', explain: '月影潜行是月影灵狐在夜间避开强光、绕过视线死角的移动方式。它不是为了恐吓猎物，而是为了减少巢路暴露。' },
        { label: '巢路守护', explain: '巢路守护来自育幼与返巢习性。尾雾会遮住幼兽气味，同时留下只有同族能辨认的回巢路径。' }
      ],
      weakness: { value: '强光会冲散尾雾，使它短时间内难以遮蔽幼兽气息。', explain: '尾雾需要稳定的暗月环境维持层次，强光会让雾痕变薄，所以月影灵狐在明亮地带通常会减少移动。' }
    }
  }
};

const SHOWCASE_LORE = {
  '鎏金角狮': {
    description: '矿脉断崖入夜后会发出很轻的金属回声，鎏金角狮的幼兽就是循着这种声音学会辨路的。它们并不由最强壮的个体统领，崖穴路线和安全饮露点多由熟悉崖道的长辈记忆并传给下一代；角冠只是它们听见矿层的器官，不是炫耀力量的王冠。',
    skill: {
      name: '星金崖阵',
      effect: '鎏金角狮以前爪震击岩面，角冠引动矿脉共鸣，形成短暂的金色护阵。这个动作来自它们在崖穴入口感知落石、保护巢路的本能。',
      tendency: '矿脉共鸣 / 巢路守护'
    }
  },
  '森语鹿灵': {
    description: '森语鹿灵经过雾林时，很少折断枝叶。它们的根巢会共同照看幼兽，年长个体记得每片花期、每条安全根路，也会把迷路的小型宠兽带回低雾地带。鹿角上的嫩芽不是装饰，而是它们与古树交换季节讯息的方式。',
    skill: {
      name: '眠叶归径',
      effect: '森语鹿灵低头触碰地面，让细藤沿着幼兽走过的旧路生长，短暂显出雾林中安全的根径。技能来源于它们护送幼兽穿越雾林的习性。',
      tendency: '森林引路 / 根巢记忆'
    }
  },
  '月影灵狐': {
    description: '月影灵狐从不把黑暗当作恐吓猎物的工具。月谷支系会用尾纹记录亲缘，幼兽孵化后先学习分辨梦息和月光的边界，再学习奔跑。它们的尾毛散成夜雾，是为了遮住巢穴气息，也为了让年幼同族在回巢时能沿着雾痕找到路。',
    skill: {
      name: '月痕潜步',
      effect: '月影灵狐让身体边缘融入月影，沿敌人视线死角迅速变换位置。它并不依靠恐惧取胜，而是依靠夜行种族对光线和梦息的敏锐判断。',
      tendency: '月影潜行 / 变异扰动'
    }
  }
};

const defaultState = {
  diamonds: 1500,
  gold: 30,
  pulls: 0,
  pity: 0,
  page: 'planner',
  selectedBeastUid: null,
  beasts: [],
  eggs: [],
  team: [],
  lastResults: [],
  hatchReveal: null,
  animationEggUid: null,
  showcaseSeeded: false
};

let state = loadState();
seedShowcaseIfNeeded();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!saved) return clone(defaultState);
    const parsed = JSON.parse(saved);
    return migrateState(parsed);
  } catch (error) {
    return clone(defaultState);
  }
}

function migrateState(saved) {
  const migrated = { ...clone(defaultState), ...saved };
  migrated.gold = Number.isFinite(migrated.gold) ? Math.min(Math.max(Math.round(migrated.gold), 0), 99) : 30;
  migrated.team = Array.isArray(migrated.team) ? migrated.team.slice(0, TEAM_LIMIT) : [];
  migrated.beasts = Array.isArray(migrated.beasts) ? migrated.beasts.map(normalizeBeast) : [];
  migrated.eggs = Array.isArray(migrated.eggs) ? migrated.eggs.map(normalizeEgg) : [];
  migrated.lastResults = [];
  return migrated;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createShowcaseState() {
  const showcase = clone(defaultState);
  showcase.beasts = [
    createBeast({ talent: 'S', element: '金', source: 'summon', name: '鎏金角狮' }),
    createBeast({ talent: 'A', element: '木', source: 'summon', name: '森语鹿灵' }),
    createBeast({ talent: 'SS', element: '暗', source: 'hatch', name: '月影灵狐' })
  ];
  showcase.eggs = [
    createEgg({ talent: 'S', element: '金' }),
    createEgg({ talent: 'A', element: '木' }),
    createEgg({ talent: 'SS', element: '暗' })
  ];
  showcase.team = showcase.beasts.map((beast) => beast.uid);
  showcase.showcaseSeeded = true;
  return showcase;
}

function seedShowcaseIfNeeded() {
  const hasShowcase = state.beasts.some((beast) => BEAST_ASSETS[beast.name]) && state.eggs.some((egg) => Object.values(EGG_ASSETS).flat().includes(egg.asset));
  if (state.showcaseSeeded && hasShowcase) return;
  const showcase = createShowcaseState();
  const existingBeasts = state.beasts.filter((beast) => !BEAST_ASSETS[beast.name]);
  const existingEggs = state.eggs.filter((egg) => !Object.values(EGG_ASSETS).flat().includes(egg.asset));
  state.beasts = [...showcase.beasts, ...existingBeasts];
  state.eggs = [...showcase.eggs, ...existingEggs];
  state.team = showcase.team;
  state.showcaseSeeded = true;
  state.page = 'home';
  saveState();
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function isMutation(element) {
  return MUTATION_ELEMENTS.includes(element);
}

function assetPath(type, element) {
  return `assets/${type}-${ELEMENTS[element].key}.svg`;
}

function rollTalent(forceTop = false) {
  if (forceTop) return randomFrom(['SSS', 'SS', 'S']);
  const roll = Math.random() * 100;
  let cursor = 0;
  for (const rate of TALENT_RATES) {
    cursor += rate.owner;
    if (roll <= cursor) return rate.talent;
  }
  return 'F';
}

function rollElement(allowMutation) {
  return randomFrom(allowMutation ? ALL_ELEMENTS : NORMAL_ELEMENTS);
}

function createSkill(element, name) {
  const skillName = randomFrom(SKILL_NAMES[element]);
  const effect = randomFrom(SKILL_EFFECTS[element]);
  return {
    name: skillName,
    effect: `${name} ${effect}`,
    tendency: ELEMENTS[element].vibe
  };
}

function beastDescription({ name, element, talent, trait, source }) {
  const habitat = randomFrom(HABITAT_NOTES[element]);
  const mark = randomFrom(BODY_MARKS[element]);
  const social = randomFrom(SOCIAL_NOTES[element]);
  const sourceNote = randomFrom(SOURCE_NOTES[source] || SOURCE_NOTES.summon);
  const clan = randomFrom(MATRI_CLANS);
  const templates = [
    `${habitat}里很少安静太久。${name}${mark}，天赋 ${talent} 的个体通常会被${clan}记入迁徙或守巢的谱系；它性情${trait}，但这种性情更多来自栖息地，而不是简单的种族标签。${sourceNote}。`,
    `${name}并不是人们想象中那类固定性格的${element}属性宠兽。${social}；${mark}。御兽师记录里说，${trait}的个体更容易在${habitat}附近停留，天赋 ${talent} 只代表它体内属性流更稳定，不代表它一定更凶猛。`,
    `先听见的是${habitat}里的细响，然后才会看见${name}。它${mark}，身上有${element}属性的${ELEMENTS[element].vibe}气息。${social}。${sourceNote}，所以它与御兽师的关系更接近同行，而不是所有物。`,
    `在${clan}的巢群记忆里，${name}常被描述为“${trait}但不驯顺”的一支。它们会在${habitat}留下幼兽能辨认的气味路标；${mark}。这只个体天赋为 ${talent}，表现出来的是属性流的清澈程度，而非现实动物刻板印象里的强弱。`,
    `${name}的故事通常不是从战斗开始，而是从一枚蛋、一段巢路，或${habitat}的一次季节变化开始。${social}；${mark}。${sourceNote}。`
  ];
  return randomFrom(templates);
}

function eggDescription({ name, element, talent, requiredCoins }) {
  const feature = randomFrom(['壳面纹路会缓慢游动', '壳内传出轻微心跳', '边缘浮着星点光尘', '握近时会轻轻发热', '会随着呼吸般忽明忽暗']);
  return `${name}${feature}，完整蛋壳里蕴着 ${talent} 天赋的${element}属性幼兽，需要 ${requiredCoins} 枚高纯金币完全唤醒。`;
}

function createBeast({ talent = rollTalent(), element = rollElement(false), source = 'summon', name = null } = {}) {
  const actualName = name || randomFrom(BEAST_NAMES[element]);
  const trait = randomFrom(TRAITS);
  const beast = {
    uid: uid('beast'),
    name: actualName,
    talent,
    element,
    trait,
    source,
    mutated: isMutation(element),
    asset: BEAST_ASSETS[actualName] || assetPath('beast', element),
    obtainedAt: new Date().toISOString()
  };
  beast.skill = SHOWCASE_LORE[actualName]?.skill || createSkill(element, actualName);
  beast.description = SHOWCASE_LORE[actualName]?.description || beastDescription(beast);
  return beast;
}

function createEgg({ talent = rollTalent(), element = rollElement(true) } = {}) {
  const requiredCoins = Math.floor(Math.random() * 10) + 6;
  const name = `${randomFrom(EGG_FEATURES[element])}宠兽蛋`;
  const egg = {
    uid: uid('egg'),
    name,
    talent,
    element,
    requiredCoins,
    investedCoins: 0,
    mutated: isMutation(element),
    asset: randomFrom(EGG_ASSETS[element] || [assetPath('egg', element)]),
    obtainedAt: new Date().toISOString()
  };
  egg.description = eggDescription(egg);
  return egg;
}

function normalizeBeast(beast) {
  const element = ALL_ELEMENTS.includes(beast.element) ? beast.element : rollElement(false);
  const talent = TALENTS.includes(beast.talent) ? beast.talent : rollTalent();
  const normalized = { ...beast, element, talent };
  normalized.uid = normalized.uid || uid('beast');
  normalized.name = normalized.name || randomFrom(BEAST_NAMES[element]);
  normalized.trait = normalized.trait || randomFrom(TRAITS);
  normalized.source = normalized.source || 'summon';
  normalized.mutated = isMutation(element);
  normalized.asset = BEAST_ASSETS[normalized.name] || normalized.asset || assetPath('beast', element);
  normalized.skill = normalized.skill || createSkill(element, normalized.name);
  normalized.description = normalized.description || beastDescription(normalized);
  return normalized;
}

function normalizeEgg(egg) {
  const element = ALL_ELEMENTS.includes(egg.element) ? egg.element : rollElement(true);
  const talent = TALENTS.includes(egg.talent) ? egg.talent : rollTalent();
  const normalized = { ...egg, element, talent };
  normalized.uid = normalized.uid || uid('egg');
  normalized.requiredCoins = Math.min(Math.max(normalized.requiredCoins || Math.floor(Math.random() * 10) + 6, 1), 15);
  normalized.investedCoins = Math.min(Math.max(normalized.investedCoins || 0, 0), normalized.requiredCoins);
  normalized.name = normalized.name || `${randomFrom(EGG_FEATURES[element])}宠兽蛋`;
  normalized.mutated = isMutation(element);
  normalized.asset = normalized.asset || assetPath('egg', element);
  normalized.description = normalized.description || eggDescription(normalized);
  return normalized;
}

function grantResources(diamonds, gold, message) {
  state.diamonds += diamonds;
  state.gold += gold;
  saveState();
  render(message);
}

function resetSave() {
  state = createShowcaseState();
  saveState();
  render('展示存档已重置：已放入三只新立绘宠兽和三枚宠兽蛋。');
}

function goPage(page, selectedBeastUid = null) {
  state.page = page;
  state.selectedBeastUid = selectedBeastUid;
  state.hatchReveal = null;
  saveState();
  render();
}

function generatePullResult(forceGuarantee = false) {
  const talent = rollTalent(forceGuarantee);
  const getEgg = forceGuarantee || Math.random() < 0.42;
  if (getEgg) {
    const egg = createEgg({ talent, element: rollElement(true) });
    state.eggs.push(egg);
    return { type: 'egg', item: egg };
  }
  const beast = createBeast({ talent, element: rollElement(false), source: 'summon' });
  state.beasts.push(beast);
  return { type: 'beast', item: beast };
}

function pull(count) {
  const cost = count * 100;
  if (!TEST_MODE && state.diamonds < cost) return render(`钻石不足，${count === 1 ? '单抽' : '五连抽'}需要 ${cost} 钻。`);
  const results = [];
  if (!TEST_MODE) state.diamonds -= cost;
  for (let index = 0; index < count; index += 1) {
    const guarantee = state.pity + 1 >= PITY_LIMIT;
    results.push(generatePullResult(guarantee));
    state.pulls += 1;
    state.pity = guarantee ? 0 : state.pity + 1;
  }
  state.lastResults = results;
  saveState();
  render(`召唤完成，获得 ${results.length} 个新伙伴/宠兽蛋。测试号资源不消耗。`);
}

function smashCoin(eggUid) {
  const eggIndex = state.eggs.findIndex((egg) => egg.uid === eggUid);
  if (eggIndex < 0) return render('这枚宠兽蛋已经不在背包里了。');
  const egg = state.eggs[eggIndex];
  if (!TEST_MODE && state.gold < 1) return render('金币不足：每次蕴养需要 1 枚高纯金币。');

  if (!TEST_MODE) state.gold -= 1;
  egg.investedCoins += 1;
  state.animationEggUid = eggUid;

  if (egg.investedCoins >= egg.requiredCoins) {
    state.eggs.splice(eggIndex, 1);
    const beast = createBeast({ talent: egg.talent, element: egg.element, source: 'hatch' });
    state.beasts.push(beast);
    state.lastResults = [{ type: 'beast', item: beast }];
    state.hatchReveal = beast.uid;
    saveState();
    render(`${egg.name} 被金币魔力唤醒，${beast.name} 孵化成功！`);
    return;
  }

  saveState();
  render(`${egg.name} 吸收了 1 枚金币，壳纹里的魔力更稳定了。`);
}

function addToTeam(beastUid) {
  if (state.team.includes(beastUid)) return render('这只宠兽已经上阵了。');
  if (state.team.length >= TEAM_LIMIT) return render(`编队最多上阵 ${TEAM_LIMIT} 只宠兽。`);
  const beast = state.beasts.find((item) => item.uid === beastUid);
  if (!beast) return render('没有找到这只宠兽。');
  state.team.push(beastUid);
  saveState();
  render(`${beast.name} 已加入七兽编队。`);
}

function removeFromTeam(beastUid) {
  const beast = state.beasts.find((item) => item.uid === beastUid);
  state.team = state.team.filter((uidValue) => uidValue !== beastUid);
  saveState();
  render(`${beast ? beast.name : '宠兽'} 已下阵。`);
}

function elementClass(item) {
  return `element-${ELEMENTS[item.element].key} ${item.mutated ? 'mutated' : ''}`;
}

function imageTag(item, className = 'portrait') {
  return `<img class="${className}" src="${item.asset}" alt="${item.name}">`;
}

function codexFor(beast) {
  return BEAST_CODEX[beast.name] || {
    species: `${beast.element}属性宠兽`,
    discoveredAt: randomFrom(HABITAT_NOTES[beast.element]),
    eggName: `${randomFrom(EGG_FEATURES[beast.element])}宠兽蛋`,
    eggNote: `${beast.element}属性蛋壳会随环境微光改变纹路，孵化前常出现与成体习性对应的细响。`,
    forms: [
      { title: '正视', note: `${beast.name}正面最容易观察到${randomFrom(BODY_MARKS[beast.element])}。`, position: '50% 32%' },
      { title: '侧视', note: `侧身时能看出它适应${randomFrom(HABITAT_NOTES[beast.element])}的移动方式。`, position: '56% 48%' },
      { title: '背视', note: `背部纹路常被亲缘巢群用来识别个体来源。`, position: '62% 54%' },
      { title: '行动状态', note: `${beast.skill.name}发动前，属性气息会先沿身体边缘流动。`, position: '48% 62%' }
    ],
    features: [
      { title: '眼部', note: `瞳色会随${beast.element}属性流稳定程度变化。`, position: '44% 24%' },
      { title: '体表', note: randomFrom(BODY_MARKS[beast.element]), position: '52% 46%' },
      { title: '足迹', note: `足迹会短暂残留${ELEMENTS[beast.element].vibe}气息。`, position: '48% 76%' }
    ],
    ecology: {
      diet: `主要吸收${randomFrom(HABITAT_NOTES[beast.element])}中的属性微息。`,
      habit: beast.skill.tendency,
      weakness: `离开熟悉栖息地太久时，${beast.element}属性流会变得迟缓。`
    }
  };
}

function beastByUid(uidValue) {
  return state.beasts.find((beast) => beast.uid === uidValue);
}

function formatPlannerDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidPlannerDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && formatPlannerDateKey(date) === value;
}

function formatPlannerDisplayDate(value) {
  if (!isValidPlannerDateKey(value)) return '时间';
  const [, month, day] = value.split('-').map(Number);
  return `${month}.${day}`;
}

function formatPlannerDetailDate(value) {
  if (!isValidPlannerDateKey(value)) return '';
  const [, month, day] = value.split('-').map(Number);
  return `${month} 月 ${day} 日`;
}

function renderMonthCalendar(year, month, activeDateSet) {
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const todayKey = formatPlannerDateKey(new Date());
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const blanks = Array.from({ length: firstDay }, () => '<span class="calendar-day is-blank" aria-hidden="true"></span>').join('');
  const days = Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1;
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const classes = ['calendar-day'];
    if (activeDateSet.has(dateKey)) classes.push('is-active');
    if (dateKey === plannerSelectedDateKey) classes.push('is-selected');
    if (dateKey === todayKey) classes.push('is-today');
    const className = classes.join(' ');
    const dayLabel = dateKey === todayKey ? '今天' : day;
    return activeDateSet.has(dateKey)
      ? `<button class="${className}" type="button" data-action="show-day-planner-items" data-date="${dateKey}"><strong>${dayLabel}</strong></button>`
      : `<span class="${className}"><strong>${dayLabel}</strong></span>`;
  }).join('');
  const headers = weekDays.map((day) => `<span class="calendar-weekday">${day}</span>`).join('');
  return `<div class="calendar-grid">${headers}${blanks}${days}</div>`;
}

function renderPlannerItem(item, compact = false) {
  const dateText = isValidPlannerDateKey(item.date) ? item.date.slice(5).replace('-', '/') : '';
  const action = compact ? 'edit-floating-planner-item' : 'select-planner-item';
  const recentClass = item.id === plannerRecentSavedId ? 'is-recent-saved' : '';
  const itemMarkup = `
    <article class="planner-item ${compact ? 'is-compact' : ''} ${recentClass}" data-action="${action}" data-id="${item.id}">
      ${dateText ? `<time>${dateText}</time>` : ''}
      <div>
        <strong>${item.title}</strong>
        ${compact ? '' : `<p>${item.note}</p>`}
      </div>
    </article>
  `;
  if (compact || !isValidPlannerDateKey(item.date) || item.completed) return itemMarkup;
  return `
    <div class="planner-swipe-item ${plannerSwipeOpenId === item.id ? 'is-swipe-open' : ''}" data-swipe-id="${item.id}">
      <button class="planner-swipe-action" type="button" data-action="complete-planner-item" data-id="${item.id}" aria-label="标记已完成">已完成</button>
      <div class="planner-swipe-content">
        ${itemMarkup}
      </div>
    </div>
  `;
}

function renderPlannerDetailCard() {
  const item = plannerItems.find((plannerItem) => plannerItem.id === selectedPlannerId);
  if (!item || plannerFormOpen) return '';
  const dateText = isValidPlannerDateKey(item.date) ? formatPlannerDetailDate(item.date) : '';
  const hasNote = item.note && item.note !== '未填写具体内容。' && item.note !== '未填写备注。';
  const confirming = pendingDeletePlannerId === item.id;
  const actions = confirming
    ? `<div class="planner-confirm-delete"><span>确认删除？</span><button type="button" data-action="confirm-delete-planner-item" data-id="${item.id}">确认</button><button type="button" data-action="cancel-delete-planner-item">取消</button></div>`
    : `<div class="planner-item-actions planner-detail-actions"><button type="button" data-action="edit-planner-item" data-id="${item.id}">编辑</button><button class="planner-detail-delete" type="button" data-action="request-delete-planner-item" data-id="${item.id}">删除</button></div>`;
  return `
    <section class="planner-detail-panel" data-action="close-planner-detail" aria-label="日程详情">
      <article class="planner-detail-card" data-planner-panel="detail">
        <div class="planner-detail-head">
          <strong>${item.title}</strong>
          <div class="planner-detail-meta">
            ${dateText ? `<time>${dateText}</time>` : ''}
          </div>
        </div>
        ${hasNote ? `<p class="planner-detail-note">${item.note}</p>` : ''}
        ${actions}
      </article>
    </section>
  `;
}

function getBoundedIdeaPopoverPoint(event) {
  const shell = document.querySelector('.planner-app-shell') || document.querySelector('#contentPanel');
  const bounds = shell?.getBoundingClientRect();
  const margin = 10;
  const width = Math.min(238, Math.max(180, (bounds?.width || window.innerWidth) - margin * 2));
  const height = 136;
  const containerWidth = bounds?.width || window.innerWidth;
  const containerHeight = bounds?.height || window.innerHeight;
  const pointerX = (event?.clientX || margin) - (bounds?.left || 0);
  const pointerY = (event?.clientY || margin) - (bounds?.top || 0);
  const rawLeft = pointerX;
  const rawTop = pointerY + 12;
  const left = Math.max(margin, Math.min(rawLeft, containerWidth - width - margin));
  const top = rawTop + height > containerHeight - margin
    ? Math.max(margin, pointerY - height - 12)
    : Math.max(margin, rawTop);
  return { x: Math.round(left), y: Math.round(Math.min(top, containerHeight - height - margin)) };
}

function openPickerInput(input) {
  if (!input) return;
  if (typeof input.showPicker === 'function') input.showPicker();
  else input.focus();
}

function renderPlannerDayView() {
  if (!plannerDayViewDate || plannerFormOpen) return '';
  const items = plannerItems.filter((item) => item.date === plannerDayViewDate).sort(comparePlannerItems);
  if (!items.length) return '';
  return `
    <section class="planner-day-panel" data-action="close-day-planner-items" aria-label="当天安排">
      <article class="planner-day-card" data-planner-panel="day-view">
        <header class="planner-day-head"><time>${formatPlannerDayViewDate(plannerDayViewDate)}</time></header>
        <div class="planner-day-list">
          ${items.map((item) => {
            const dragClass = item.id === plannerDragTargetDayItemId ? (plannerDragInsertAfter ? 'is-drag-after' : 'is-drag-before') : '';
            return `<button type="button" class="planner-day-item ${dragClass}" draggable="true" data-action="open-day-planner-item" data-drag-action="sort-day-planner-item" data-id="${item.id}"><strong>${item.title}</strong><span>${item.note}</span></button>`;
          }).join('')}
        </div>
      </article>
    </section>
  `;
}

function formatPlannerDayViewDate(value) {
  if (!isValidPlannerDateKey(value)) return '';
  const [, month, day] = value.split('-').map(Number);
  return `${month}月${day}日`;
}

function renderPlannerMonthPanel() {
  if (!plannerMonthPanelOpen || plannerFormOpen) return '';
  const current = parsePlannerMonthKey(plannerMonthKey);
  const year = current.getFullYear();
  const currentMonth = current.getMonth() + 1;
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const value = `${year}-${String(month).padStart(2, '0')}`;
    return `<button type="button" class="${month === currentMonth ? 'is-current' : ''}" data-action="select-planner-month" data-month="${value}">${month}月</button>`;
  }).join('');
  return `
    <section class="planner-month-panel" data-action="close-planner-month-panel" aria-label="选择月份">
      <article class="planner-month-card" data-planner-panel="month">
        <header><button type="button" data-action="shift-planner-month-year" data-year="${year - 1}">上一年</button><strong>${year}</strong><button type="button" data-action="shift-planner-month-year" data-year="${year + 1}">下一年</button></header>
        <div class="planner-month-grid">${months}</div>
      </article>
    </section>
  `;
}

function renderPlannerCompletedPanel(completedItems) {
  if (!plannerCompletedOpen || plannerFormOpen || !completedItems.length) return '';
  return `
    <section class="planner-completed-panel" data-action="close-completed-planner-items" aria-label="已完成安排">
      <article class="planner-completed-card" data-planner-panel="completed">
        <header><strong>已完成</strong><span>${completedItems.length}</span></header>
        <div class="planner-completed-list">
          ${completedItems.map((item) => `<button type="button" class="planner-completed-item" data-action="open-completed-planner-item" data-id="${item.id}"><time>${item.date.slice(5).replace('-', '/')}</time><strong>${item.title}</strong><span class="planner-completed-restore" data-action="restore-planner-item" data-id="${item.id}">移出</span></button>`).join('')}
        </div>
      </article>
    </section>
  `;
}

function renderPlannerIdeaPopover() {
  const item = plannerItems.find((plannerItem) => plannerItem.id === plannerIdeaPopoverId);
  if (!item || plannerFormOpen) return '';
  const note = item.note && item.note !== '未填写具体内容。' && item.note !== '未填写备注。' ? item.note : '';
  const generatedTitle = note && item.title === plannerTextFallback(note);
  return `
    <aside class="planner-idea-popover" data-action="edit-idea-popover" data-id="${item.id}" style="left: ${plannerIdeaPopoverPoint.x}px; top: ${plannerIdeaPopoverPoint.y}px;">
      ${generatedTitle ? `<p>${note}</p>` : `<strong>${item.title}</strong>${note ? `<p>${note}</p>` : ''}`}
    </aside>
  `;
}

function renderPlannerApp() {
  const selectedMonth = parsePlannerMonthKey(plannerMonthKey);
  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth();
  const datedItems = plannerItems
    .filter((item) => isValidPlannerDateKey(item.date) && !item.completed)
    .sort(comparePlannerItems);
  const completedItems = plannerItems
    .filter((item) => isValidPlannerDateKey(item.date) && item.completed)
    .sort(comparePlannerItems);
  const floatingItems = plannerItems.filter((item) => !isValidPlannerDateKey(item.date));
  const activeDateSet = new Set(datedItems.map((item) => item.date));
  const datedList = datedItems.length ? datedItems.map((item) => renderPlannerItem(item)).join('') : '<div class="planner-empty">这个月还没有标注日期的事项。</div>';
  const completedStack = completedItems.length ? `<button class="planner-completed-stack" type="button" data-action="toggle-completed-planner-items" aria-label="已完成安排"><span>${completedItems.length}</span></button>` : '';
  const floatingList = floatingItems.length ? floatingItems.map((item) => renderPlannerItem(item, true)).join('') : '<div class="planner-empty is-small">没有未排期事项。</div>';
  const editingItem = plannerItems.find((item) => item.id === editingPlannerId);
  const panelTitle = '事项编辑';
  const draftDateValue = isValidPlannerDateKey(plannerDraftDate) ? plannerDraftDate : '';
  const draftDateText = formatPlannerDisplayDate(draftDateValue);
  const monthLabel = formatPlannerMonthLabel(plannerMonthKey);
  const formPanel = plannerFormOpen ? `
    <section class="planner-add-panel" aria-label="${panelTitle}" data-action="close-planner-form">
      <div class="planner-panel-card" data-planner-panel="editor">
        <div class="planner-editor-topline">
          <label class="planner-date-pill planner-date-bubble" data-action="pick-planner-date"><span>${draftDateText}</span><input name="date" form="plannerEditorForm" type="date" value="${draftDateValue}" aria-label="选择日期" data-action="update-planner-draft-date"></label>
          <div class="planner-editor-actions">
            <button class="planner-close-button planner-history-button" type="button" data-action="undo-planner-draft" aria-label="上一步">↶</button>
            <button class="planner-close-button planner-history-button" type="button" data-action="redo-planner-draft" aria-label="后一步">↷</button>
            <button class="planner-close-button" type="button" data-action="clear-planner-draft">清除内容</button>
          </div>
        </div>
        <form id="plannerEditorForm" class="planner-form" data-action="add-planner-item">
          <input class="planner-title-input" name="title" type="text" placeholder="标题" value="${escapePlannerValue(plannerDraftTitle)}" data-action="update-planner-draft-title">
          <textarea class="planner-note-input" name="note" placeholder="正文内容" data-action="update-planner-draft-note">${escapePlannerValue(plannerDraftNote)}</textarea>
          <button type="submit">保存</button>
        </form>
      </div>
    </section>
  ` : '';

  return `
    <section class="planner-app-shell">
      <header class="planner-hero">
        <div>
          <h1>月历清单</h1>
        </div>
        <button class="planner-month-picker" type="button" data-action="pick-planner-month" aria-label="选择月份"><span>${monthLabel}</span></button>
      </header>
      <section class="planner-calendar-card">
        ${renderMonthCalendar(year, month, activeDateSet)}
        <button class="planner-fab" type="button" data-action="toggle-planner-form" aria-label="添加日程">＋</button>
      </section>
      <section class="planner-body">
        <section class="planner-lists">
          <div class="planner-list-column dated-list">
            <div class="planner-section-head"><div class="planner-title-with-stack"><h2>安排</h2>${completedStack}</div><p>按日期排序</p></div>
            <div class="planner-list-scroll dated-list-scroll">
              ${datedList}
            </div>
          </div>
          <aside class="planner-list-column floating-list">
            <div class="planner-section-head idea-head"><h2>想法💡</h2></div>
            <div class="planner-list-scroll floating-list-scroll">
              ${floatingList}
            </div>
          </aside>
        </section>
      </section>
      ${formPanel}
      ${renderPlannerDayView()}
      ${renderPlannerMonthPanel()}
      ${renderPlannerDetailCard()}
      ${renderPlannerCompletedPanel(completedItems)}
      ${renderPlannerIdeaPopover()}
    </section>
  `;
}

function renderHome() {
  const team = state.team.map(beastByUid).filter(Boolean);
  const showcase = team[0] || state.beasts.find((beast) => BEAST_ASSETS[beast.name]) || state.beasts[0];
  const preview = team.length ? team.map((beast) => `
    <button class="team-mini ${elementClass(beast)}" data-action="detail" data-uid="${beast.uid}">
      ${imageTag(beast, 'mini-portrait')}
      <span>${beast.name}</span>
    </button>
  `).join('') : '<div class="empty-party">七兽席位尚未点亮，先去召唤或蕴蛋。</div>';
  const showcaseArt = showcase ? previewImage(showcase.asset || BEAST_ASSETS[showcase.name] || assetPath('beast', showcase.element), showcase.name, 'hall-showcase') : '';
  const showcaseLine = showcase ? `契约台当前记录：${showcase.name}。${showcase.skill.name} 的属性流已稳定，可进入生物志查看形态与习性。` : '契约台仍在等待第一只同行宠兽。';
  const actionCards = [
    { page: 'summon', title: '星辉召唤', tag: 'Summon', desc: '点亮星门，呼唤愿意同行的宠兽与完整宠兽蛋。' },
    { page: 'eggs', title: '金币蕴蛋', tag: 'Hatch', desc: '把高纯金币的魔力蕴入蛋壳，让壳纹逐渐稳定。' },
    { page: 'team', title: '七兽编队', tag: 'Team', desc: '七个席位组成御兽阵列，先看伙伴，再定站位。' },
    { page: 'beasts', title: '宠兽生物志', tag: 'Codex', desc: '查看主图、形态、细节、蛋与生态习性。' }
  ].map((item) => `<button class="hall-action-card" data-page="${item.page}"><small>${item.tag}</small><strong>${item.title}</strong><span>${item.desc}</span></button>`).join('');

  return `
    <section class="hall-cover">
      <div class="hall-orbit" aria-hidden="true"></div>
      <div class="hall-command-panel">
        <p class="eyebrow">Starlit Contract Hall</p>
        <h1 class="hall-title">星辉御兽大厅</h1>
        <p class="hall-lead">星辉大厅已点亮。这里不是菜单页，而是御兽师整理契约、蛋室、编队与生物志的主厅。</p>
        <p class="hall-world-note">${showcaseLine}</p>
        <div class="hall-actions-v2">${actionCards}</div>
        <div class="hall-utility-row"><button data-action="supply">领取试玩补给</button><button data-action="reset" class="quiet-button">重置展示存档</button></div>
      </div>
      <div class="hall-beast-stage ${showcase ? elementClass(showcase) : ''}">
        <span class="stage-ring"></span>
        ${showcaseArt}
        <div class="stage-caption"><small>当前同行</small><strong>${showcase ? showcase.name : '未记录'}</strong></div>
      </div>
      <aside class="hall-ledger">
        <section class="hall-panel resource-ledger">
          <p class="eyebrow">御兽师手札</p>
          <h2>资源匣</h2>
          <div class="hall-stat-grid">
            <div class="hall-stat">钻石<strong>${TEST_MODE ? '∞' : state.diamonds}</strong></div>
            <div class="hall-stat">金币<strong>${TEST_MODE ? '∞' : state.gold}</strong></div>
            <div class="hall-stat">召唤<strong>${state.pulls}</strong></div>
            <div class="hall-stat">保底<strong>${state.pity}/${PITY_LIMIT}</strong></div>
          </div>
        </section>
        <section class="hall-panel team-ledger">
          <h2>七兽席位</h2>
          <div class="team-preview-grid">${preview}</div>
        </section>
      </aside>
    </section>
  `;
}

function resultCard(result) {
  const item = result.item;
  const isEgg = result.type === 'egg';
  return `
    <article class="game-card ${elementClass(item)} ${isEgg ? 'egg-card' : ''}">
      ${previewImage(item.asset, item.name)}
      <h3>${item.name}</h3>
      <div class="badge-row"><span>${item.element}</span><span>${item.talent}</span><span>${isEgg ? '宠兽蛋' : item.skill.name}</span></div>
      <p>${isEgg ? item.description : item.skill.effect}</p>
      ${!isEgg ? `<button data-action="detail" data-uid="${item.uid}">查看生物志</button>` : '<button data-page="eggs">前往蛋室</button>'}
    </article>
  `;
}

function renderSummon() {
  const results = state.lastResults.length ? state.lastResults.map(resultCard).join('') : '<div class="empty-panel">召唤结果会以立绘展示在这里。单抽和五连都会保留最新结果。</div>';
  return `
    <div class="page-head"><button data-page="home">返回大厅</button><h2>星辉召唤池</h2><p>普通池，后续限定池规则一致但不会歪卡。</p></div>
    <section class="summon-stage">
      <aside class="summon-circle">
        <div class="summon-ring"></div>
        <div class="summon-orb" aria-hidden="true"></div>
        <div class="summon-copy">
          <p class="eyebrow">Summon Gate</p>
          <h3>星门已开启</h3>
          <p>宠兽蛋概率提高，40 抽保底。单抽 100 钻，五连 500 钻；测试号资源不消耗。</p>
          <div class="summon-actions"><button data-action="pull" data-count="1">单抽召唤</button><button data-action="pull" data-count="5">五连召唤</button></div>
        </div>
      </aside>
      <section>
        <div class="summon-banner">
          <div><h3>召唤回响</h3><p>星辉聚合后，结果卡会依次浮现。宠兽蛋可进入蛋室用金币蕴养。</p></div>
        </div>
        <div class="result-grid summon-results">${results}</div>
      </section>
    </section>
  `;
}

function beastTile(beast, withTeamButton = true) {
  const inTeam = state.team.includes(beast.uid);
  return `
    <article class="game-card beast-tile ${elementClass(beast)}">
      ${previewImage(beast.asset, beast.name)}
      <h3>${beast.name}</h3>
      <div class="badge-row"><span>${beast.element}</span><span>${beast.talent}</span><span>${beast.skill.name}</span></div>
      <p>${beast.description}</p>
      <div class="card-actions">
        <button data-action="detail" data-uid="${beast.uid}">查看生物志</button>
        ${withTeamButton ? `<button data-action="${inTeam ? 'remove-team' : 'add-team'}" data-uid="${beast.uid}">${inTeam ? '下阵' : '上阵'}</button>` : ''}
      </div>
    </article>
  `;
}

function renderBeasts() {
  const cards = state.beasts.length ? state.beasts.map((beast) => beastTile(beast)).join('') : '<div class="empty-panel">还没有宠兽，去召唤或孵蛋吧。</div>';
  return `<div class="page-head"><button data-page="home">返回大厅</button><h2>宠兽图鉴</h2><p>同名宠兽也可能拥有不同属性、天赋、技能与说明。</p></div><div class="beast-grid">${cards}</div>`;
}

function previewImage(src, title, className = 'portrait', position = '50% 50%') {
  return `<button class="preview-button" data-action="preview-image" data-src="${src}" data-title="${title}"><img class="${className} previewable-image" src="${src}" alt="${title}" style="object-position:${position}"><span class="preview-hint">点击放大</span></button>`;
}

function codexThumb(item, title, note, className = '') {
  if (note.pendingAsset) {
    return `
      <article class="codex-thumb ${className} pending-thumb">
        <div class="pending-art"><span>${note.required ? '必需资产' : '可选资产'}</span></div>
        <strong>${title}</strong>
        <span>${note.note}</span>
      </article>
    `;
  }
  const source = note.asset || item.asset;
  return `
    <article class="codex-thumb ${className}">
      ${previewImage(source, title, '', note.position || '50% 50%')}
      <strong>${title}</strong>
      <span>${note.note}</span>
    </article>
  `;
}

function ecologyItem(label, entry) {
  const entries = Array.isArray(entry) ? entry : [entry];
  const content = entries.map((item) => {
    if (typeof item === 'string') return `<span class="ecology-text">${item}</span>`;
    const value = item.label || item.value;
    const explain = item.explain || '';
    return `<span class="ecology-tag" tabindex="0" ${explain ? `data-explain="${explain}"` : ''}>${value}</span>`;
  }).join('');
  return `<li class="ecology-item"><strong>${label}</strong><span class="ecology-content">${content}</span></li>`;
}

function renderDetail() {
  const beast = beastByUid(state.selectedBeastUid) || state.beasts[0];
  if (!beast) return `<div class="page-head"><button data-page="beasts">返回图鉴</button><h2>宠兽养成</h2></div><div class="empty-panel">还没有宠兽。</div>`;
  const inTeam = state.team.includes(beast.uid);
  const codex = codexFor(beast);
  const forms = codex.forms.map((form) => codexThumb(beast, form.title, form, 'form-thumb')).join('');
  const features = codex.features.map((feature) => codexThumb(beast, feature.title, feature, 'feature-thumb')).join('');
  const eggAsset = codex.eggAsset || (EGG_ASSETS[beast.element] || [assetPath('egg', beast.element)])[0];
  const ecology = [
    ecologyItem('食性', codex.ecology.diet),
    ecologyItem('习性倾向', codex.ecology.habit),
    ecologyItem('弱点', codex.ecology.weakness)
  ].join('');
  return `
    <div class="page-head"><button data-page="beasts">返回图鉴</button><h2>宠兽生物志</h2><p>先看身份与主图，再看蛋、形态、细节和生态；图片均可点击放大。</p></div>
    <section class="codex-layout-v2 ${elementClass(beast)}">
      <section class="codex-identity">
        <div class="codex-title"><small>${codex.species}</small><h1>${beast.name}</h1></div>
        <div class="codex-main-art">${previewImage(beast.asset || BEAST_ASSETS[beast.name] || assetPath('beast', beast.element), beast.name, 'codex-portrait')}</div>
        <p class="codex-desc">${beast.description}</p>
        <button data-action="${inTeam ? 'remove-team' : 'add-team'}" data-uid="${beast.uid}">${inTeam ? '移出编队' : '加入编队'}</button>
      </section>
      <section class="codex-file-grid">
        <article class="codex-file-card"><span>属性</span><strong>${beast.element}</strong><small>${ELEMENTS[beast.element].vibe}</small></article>
        <article class="codex-file-card"><span>天赋</span><strong>${beast.talent}</strong><small>属性流稳定度</small></article>
        <article class="codex-file-card"><span>发现地</span><strong>${codex.discoveredAt}</strong><small>首次观察记录</small></article>
        <article class="codex-file-card"><span>来源</span><strong>${beast.source === 'hatch' ? '蛋室孵化' : '星辉召唤'}</strong><small>契约记录</small></article>
      </section>
      <article class="codex-egg-card">
        ${previewImage(eggAsset, codex.eggName, 'codex-egg-image')}
        <div><p class="eyebrow">Egg Record</p><h3>${codex.eggName}</h3><p>${codex.eggNote}</p></div>
      </article>
      <section class="codex-section codex-observation-grid"><div class="section-line"><h3>观察图集</h3></div><div class="observation-columns"><div><h4>形态展示</h4><div class="form-grid">${forms}</div></div><div><h4>特征细节</h4><div class="feature-grid">${features}</div></div></div></section>
      <section class="codex-section codex-lore-panel"><div class="section-line"><h3>生态与习性</h3></div><ul class="ecology-list">${ecology}</ul></section>
      <section class="codex-section skill-codex"><div class="section-line"><h3>技能种子</h3></div><div class="skill-copy"><h4>${beast.skill.name}</h4><p>${beast.skill.effect}</p><small>习性来源：${beast.skill.tendency}</small><small>属性：${beast.element}系</small></div></section>
    </section>
  `;
}

function eggCard(egg) {
  const percent = Math.round((egg.investedCoins / egg.requiredCoins) * 100);
  const animating = state.animationEggUid === egg.uid ? 'coin-impact' : '';
  const remaining = egg.requiredCoins - egg.investedCoins;
  return `
    <article class="game-card egg-tile ${elementClass(egg)} ${animating}">
      <div class="egg-wrap">${previewImage(egg.asset || assetPath('egg', egg.element), egg.name)}<span class="coin-fly">金币</span></div>
      <h3>${egg.name}</h3>
      <div class="badge-row"><span>${egg.element}</span><span>${egg.talent}</span><span>${egg.investedCoins}/${egg.requiredCoins} 金币</span></div>
      <div class="progress" aria-label="孵化进度 ${percent}%"><i style="width:${percent}%"></i></div>
      <p>${egg.description}</p>
      <p class="egg-hint">还需 ${remaining} 枚高纯金币，蛋壳光纹会随魔力逐步稳定。</p>
      <button data-action="smash" data-uid="${egg.uid}">蕴入 1 枚金币</button>
    </article>
  `;
}

function renderEggs() {
  const reveal = state.hatchReveal ? beastByUid(state.hatchReveal) : null;
  const revealHtml = reveal ? `<section class="hatch-reveal ${elementClass(reveal)}"><p class="eyebrow">Hatch Reveal</p><h2>孵化成功</h2>${previewImage(reveal.asset || BEAST_ASSETS[reveal.name] || assetPath('beast', reveal.element), reveal.name, 'large-portrait')}<h3>${reveal.name}</h3><p>${reveal.skill.name}：${reveal.skill.effect}</p><button data-action="detail" data-uid="${reveal.uid}">查看生物志</button></section>` : '';
  const cards = state.eggs.length ? state.eggs.map(eggCard).join('') : '<div class="empty-panel">暂无宠兽蛋，去召唤池碰碰运气。</div>';
  return `<div class="page-head"><button data-page="home">返回大厅</button><h2>宠兽蛋室</h2><p>金币不是砸碎蛋壳，而是把魔力蕴入完整蛋壳；每枚蛋最多 15 枚金币孵化。</p></div>${revealHtml}<div class="egg-chamber">${cards}</div>`;
}

function renderTeam() {
  const slots = Array.from({ length: TEAM_LIMIT }, (_, index) => {
    const beast = beastByUid(state.team[index]);
    const slotLabel = `#${index + 1}`;
    return beast ? `<article class="team-slot filled ${elementClass(beast)}" data-slot="${slotLabel}">${previewImage(beast.asset, beast.name, 'team-portrait')}<span>${beast.name}</span><small>${slotLabel} / ${beast.skill.name}</small><button data-action="remove-team" data-uid="${beast.uid}">下阵</button></article>` : `<div class="team-slot" data-slot="${slotLabel}"><span>${slotLabel}</span><small>等待上阵</small></div>`;
  }).join('');
  const candidates = state.beasts.length ? state.beasts.map((beast) => beastTile(beast)).join('') : '<div class="empty-panel">先获得宠兽，才能组成七兽编队。</div>';
  return `<div class="page-head"><button data-page="home">返回大厅</button><h2>七兽编队</h2><p>七个队位会完整显示；点击候选宠兽上阵，点击已上阵队位下阵。</p></div><section class="formation-board">${slots}</section><h3>候选宠兽</h3><div class="beast-grid">${candidates}</div>`;
}

function render(message = '') {
  const diamondCount = document.querySelector('#diamondCount');
  const goldCount = document.querySelector('#goldCount');
  const pullCount = document.querySelector('#pullCount');
  const pityCount = document.querySelector('#pityCount');
  if (diamondCount) diamondCount.textContent = TEST_MODE ? '∞' : state.diamonds;
  if (goldCount) goldCount.textContent = TEST_MODE ? '∞' : state.gold;
  if (pullCount) pullCount.textContent = state.pulls;
  if (pityCount) pityCount.textContent = `${state.pity}/${PITY_LIMIT}`;
  const msgBox = document.querySelector('#messageBox');
  if (msgBox) msgBox.textContent = message;
  const pages = { home: renderPlannerApp, planner: renderPlannerApp, hall: renderHome, summon: renderSummon, beasts: renderBeasts, detail: renderDetail, eggs: renderEggs, team: renderTeam };
  document.querySelector('#contentPanel').innerHTML = (pages[state.page] || renderPlannerApp)();
  setTimeout(() => {
    if (state.animationEggUid) {
      state.animationEggUid = null;
      saveState();
    }
  }, 700);
}

function openImagePreview(src, title) {
  const modal = document.querySelector('#imagePreviewModal');
  modal.innerHTML = `<div class="image-preview-backdrop" data-action="close-preview"></div><div class="image-preview-panel"><button class="image-preview-close" data-action="close-preview">关闭</button><img class="image-preview-img" src="${src}" alt="${title}"><strong>${title}</strong></div>`;
  modal.classList.add('active');
}

function closeImagePreview() {
  const modal = document.querySelector('#imagePreviewModal');
  modal.classList.remove('active');
  modal.innerHTML = '';
}

function bindEvents() {
  const homeButton = document.querySelector('#homeButton');
  const showcaseButton = document.querySelector('#showcaseButton');
  if (homeButton) homeButton.addEventListener('click', () => goPage('home'));
  if (showcaseButton) showcaseButton.addEventListener('click', () => goPage('beasts'));
  document.querySelector('#contentPanel').addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-action="add-planner-item"]');
    if (!form) return;
    event.preventDefault();
    addPlannerItem(form);
  });
  document.querySelector('#contentPanel').addEventListener('change', (event) => {
    const draftDateInput = event.target.closest('input[data-action="update-planner-draft-date"]');
    if (draftDateInput) {
      plannerDraftDate = draftDateInput.value;
      recordPlannerDraftHistory();
      render();
      return;
    }
    const input = event.target.closest('input[data-action="change-planner-month"]');
    if (!input) return;
    plannerMonthKey = /^\d{4}-\d{2}$/.test(input.value) ? input.value : formatPlannerMonthKey(new Date());
    savePlannerMonthKey();
    render();
  });
  document.querySelector('#contentPanel').addEventListener('input', (event) => {
    const draftTitleInput = event.target.closest('input[data-action="update-planner-draft-title"]');
    if (draftTitleInput) {
      plannerDraftTitle = draftTitleInput.value;
      recordPlannerDraftHistory();
      return;
    }
    const draftNoteInput = event.target.closest('textarea[data-action="update-planner-draft-note"]');
    if (!draftNoteInput) return;
    plannerDraftNote = draftNoteInput.value;
    recordPlannerDraftHistory();
  });
  document.querySelector('#contentPanel').addEventListener('touchstart', (event) => {
    const ideaList = event.target.closest('.floating-list-scroll');
    if (!ideaList || event.touches.length !== 1) return;
    const touch = event.touches[0];
    plannerIdeaTouchLock = {
      list: ideaList,
      x: touch.clientX,
      y: touch.clientY,
      scrollLeft: ideaList.scrollLeft,
      scrollTop: ideaList.scrollTop,
      axis: null
    };
  }, { passive: true });
  document.querySelector('#contentPanel').addEventListener('touchmove', (event) => {
    if (!plannerIdeaTouchLock || event.touches.length !== 1) return;
    const ideaList = event.target.closest('.floating-list-scroll');
    if (!ideaList || ideaList !== plannerIdeaTouchLock.list) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - plannerIdeaTouchLock.x;
    const deltaY = touch.clientY - plannerIdeaTouchLock.y;
    if (!plannerIdeaTouchLock.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 6) {
      plannerIdeaTouchLock.axis = Math.abs(deltaX) >= Math.abs(deltaY) ? 'x' : 'y';
    }
    if (plannerIdeaTouchLock.axis === 'x') {
      ideaList.scrollTop = plannerIdeaTouchLock.scrollTop;
    }
    if (plannerIdeaTouchLock.axis === 'y') {
      ideaList.scrollLeft = plannerIdeaTouchLock.scrollLeft;
    }
  }, { passive: true });
  document.querySelector('#contentPanel').addEventListener('touchend', () => {
    plannerIdeaTouchLock = null;
  }, { passive: true });
  document.querySelector('#contentPanel').addEventListener('touchcancel', () => {
    plannerIdeaTouchLock = null;
  }, { passive: true });
  document.querySelector('#contentPanel').addEventListener('pointerdown', (event) => {
    const swipeItem = event.target.closest('.planner-swipe-item');
    if (!swipeItem) return;
    plannerSwipeTouch = {
      id: swipeItem.dataset.swipeId,
      x: event.clientX,
      y: event.clientY,
      dragging: false
    };
  });
  document.querySelector('#contentPanel').addEventListener('pointermove', (event) => {
    if (!plannerSwipeTouch) return;
    const deltaX = event.clientX - plannerSwipeTouch.x;
    const deltaY = event.clientY - plannerSwipeTouch.y;
    if (!plannerSwipeTouch.dragging && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 8) {
      plannerSwipeTouch.dragging = Math.abs(deltaX) > Math.abs(deltaY) * 1.15;
    }
    if (!plannerSwipeTouch.dragging) return;
    if (deltaX > 30 && plannerSwipeOpenId !== plannerSwipeTouch.id) {
      plannerSwipeOpenId = plannerSwipeTouch.id;
      plannerSwipeSuppressClickId = plannerSwipeTouch.id;
      render();
      return;
    }
    if (deltaX < -24 && plannerSwipeOpenId === plannerSwipeTouch.id) {
      plannerSwipeOpenId = null;
      plannerSwipeSuppressClickId = plannerSwipeTouch.id;
      render();
    }
  });
  document.querySelector('#contentPanel').addEventListener('pointerup', () => {
    plannerSwipeTouch = null;
  });
  document.querySelector('#contentPanel').addEventListener('pointercancel', () => {
    plannerSwipeTouch = null;
  });
  document.querySelector('#contentPanel').addEventListener('dblclick', (event) => {
    const ideaCard = event.target.closest('[data-action="edit-floating-planner-item"]');
    if (!ideaCard) return;
    event.preventDefault();
    clearTimeout(plannerIdeaClickTimer);
    plannerIdeaClickTimer = null;
    plannerIdeaPopoverId = ideaCard.dataset.id;
    plannerIdeaPopoverPoint = getBoundedIdeaPopoverPoint(event);
    render();
  });
  document.querySelector('#contentPanel').addEventListener('dragstart', (event) => {
    const dayItem = event.target.closest('[data-drag-action="sort-day-planner-item"]');
    if (!dayItem) return;
    plannerDraggedDayItemId = dayItem.dataset.id;
    plannerDragTargetDayItemId = null;
    plannerDragInsertAfter = false;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', plannerDraggedDayItemId);
    const dragGhost = document.createElement('span');
    dragGhost.style.cssText = 'width:1px;height:1px;opacity:0;position:fixed;top:-2px';
    document.body.appendChild(dragGhost);
    event.dataTransfer.setDragImage(dragGhost, 0, 0);
    setTimeout(() => dragGhost.remove(), 0);
  });
  document.querySelector('#contentPanel').addEventListener('dragover', (event) => {
    const dayItem = event.target.closest('[data-drag-action="sort-day-planner-item"]');
    if (!dayItem) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = dayItem.getBoundingClientRect();
    const insertAfter = event.clientY > rect.top + rect.height / 2;
    if (plannerDragTargetDayItemId !== dayItem.dataset.id || plannerDragInsertAfter !== insertAfter) {
      plannerDragTargetDayItemId = dayItem.dataset.id;
      plannerDragInsertAfter = insertAfter;
      render();
    }
  });
  document.querySelector('#contentPanel').addEventListener('drop', (event) => {
    const dayItem = event.target.closest('[data-drag-action="sort-day-planner-item"]');
    if (!dayItem) return;
    event.preventDefault();
    const sourceId = plannerDraggedDayItemId || event.dataTransfer.getData('text/plain');
    const targetId = plannerDragTargetDayItemId || dayItem.dataset.id;
    const insertAfter = plannerDragTargetDayItemId ? plannerDragInsertAfter : false;
    plannerDraggedDayItemId = null;
    plannerDragTargetDayItemId = null;
    plannerDragInsertAfter = false;
    reorderPlannerDayItems(sourceId, targetId, insertAfter);
  });
  document.querySelector('#contentPanel').addEventListener('dragend', () => {
    plannerDraggedDayItemId = null;
    plannerDragTargetDayItemId = null;
    plannerDragInsertAfter = false;
    render();
  });
  document.querySelector('#contentPanel').addEventListener('click', (event) => {
    const ideaPopover = event.target.closest('[data-action="edit-idea-popover"]');
    if (ideaPopover) {
      const itemId = ideaPopover.dataset.id;
      plannerIdeaPopoverId = null;
      openPlannerEditor(itemId);
      return;
    }
    if (plannerIdeaPopoverId && !event.target.closest('[data-action="edit-floating-planner-item"]')) {
      plannerIdeaPopoverId = null;
      render();
      return;
    }
    if (plannerIdeaPopoverId && event.target.closest('[data-action="edit-floating-planner-item"]')) {
      return;
    }
    const target = event.target.closest('button');
    if (target?.dataset.action === 'close-planner-form') {
      closePlannerForm();
      return;
    }
    if (target?.dataset.action === 'clear-planner-draft') {
      clearPlannerDraft();
      recordPlannerDraftHistory();
      return;
    }
    if (target?.dataset.action === 'undo-planner-draft') {
      undoPlannerDraft();
      return;
    }
    if (target?.dataset.action === 'redo-planner-draft') {
      redoPlannerDraft();
      return;
    }
    const datePicker = event.target.closest('[data-action="pick-planner-date"]');
    if (datePicker) {
      openPickerInput(datePicker.querySelector('input[type="date"]'));
      return;
    }
    const monthPicker = event.target.closest('[data-action="pick-planner-month"]');
    if (monthPicker) {
      monthPicker.blur();
      plannerMonthPanelOpen = true;
      render();
      return;
    }
    const monthPanel = event.target.closest('[data-planner-panel="month"]');
    const monthOverlay = event.target.closest('[data-action="close-planner-month-panel"]');
    if (monthOverlay && !monthPanel) {
      plannerMonthPanelOpen = false;
      render();
      return;
    }
    if (target?.dataset.action === 'shift-planner-month-year') {
      const current = parsePlannerMonthKey(plannerMonthKey);
      plannerMonthKey = `${target.dataset.year}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      savePlannerMonthKey();
      render();
      return;
    }
    if (target?.dataset.action === 'select-planner-month') {
      plannerMonthKey = target.dataset.month;
      savePlannerMonthKey();
      plannerMonthPanelOpen = false;
      render();
      return;
    }
    const dayButton = event.target.closest('[data-action="show-day-planner-items"]');
    if (dayButton) {
      plannerDayViewDate = dayButton.dataset.date;
      plannerSelectedDateKey = dayButton.dataset.date;
      selectedPlannerId = null;
      plannerDetailReturnPanel = null;
      pendingDeletePlannerId = null;
      render();
      return;
    }
    const dayPanel = event.target.closest('[data-planner-panel="day-view"]');
    const dayOverlay = event.target.closest('[data-action="close-day-planner-items"]');
    if (dayOverlay && !dayPanel) {
      plannerDayViewDate = null;
      plannerSelectedDateKey = null;
      render();
      return;
    }
    const dayItem = event.target.closest('[data-action="open-day-planner-item"]');
    if (dayItem) {
      const item = plannerItems.find((plannerItem) => plannerItem.id === dayItem.dataset.id);
      selectedPlannerId = dayItem.dataset.id;
      plannerDetailReturnPanel = 'day-view';
      plannerDayViewDate = item?.date || plannerDayViewDate;
      pendingDeletePlannerId = null;
      render();
      return;
    }
    const detailPanel = event.target.closest('[data-planner-panel="detail"]');
    if (detailPanel && !target) return;
    const completedPanel = event.target.closest('[data-planner-panel="completed"]');
    const completedOverlay = event.target.closest('[data-action="close-completed-planner-items"]');
    if (completedOverlay && !completedPanel) {
      plannerCompletedOpen = false;
      plannerMonthPanelOpen = false;
      render();
      return;
    }
    const restoreAction = event.target.closest('[data-action="restore-planner-item"]');
    if (restoreAction) {
      restorePlannerItem(restoreAction.dataset.id);
      return;
    }
    const completeAction = event.target.closest('[data-action="complete-planner-item"]');
    if (completeAction) {
      plannerSwipeOpenId = null;
      plannerSwipeSuppressClickId = completeAction.dataset.id;
      completePlannerItem(completeAction.dataset.id);
      return;
    }
    const completedItem = event.target.closest('[data-action="open-completed-planner-item"]');
    if (completedItem) {
      plannerCompletedOpen = false;
      plannerDetailReturnPanel = 'completed';
      selectedPlannerId = completedItem.dataset.id;
      pendingDeletePlannerId = null;
      render();
      return;
    }
    const detailOverlay = event.target.closest('[data-action="close-planner-detail"]');
    if (detailOverlay && !detailPanel) {
      const shouldReturnCompleted = plannerDetailReturnPanel === 'completed' && plannerItems.some((item) => item.completed);
      const shouldReturnDayView = plannerDetailReturnPanel === 'day-view'
        && isValidPlannerDateKey(plannerDayViewDate)
        && plannerItems.some((item) => item.date === plannerDayViewDate && !item.completed);
      selectedPlannerId = null;
      plannerDetailReturnPanel = null;
      plannerSelectedDateKey = shouldReturnDayView ? plannerDayViewDate : null;
      pendingDeletePlannerId = null;
      plannerCompletedOpen = shouldReturnCompleted;
      if (!shouldReturnDayView) plannerDayViewDate = null;
      render();
      return;
    }
    const editorPanel = event.target.closest('[data-planner-panel="editor"]');
    if (plannerFormOpen && !editorPanel) {
      closePlannerForm();
      return;
    }
    if (editorPanel) return;
    const floatingItemCard = event.target.closest('[data-action="edit-floating-planner-item"]');
    if (floatingItemCard && !event.target.closest('button')) {
      clearTimeout(plannerIdeaClickTimer);
      plannerIdeaClickTimer = setTimeout(() => {
        plannerIdeaClickTimer = null;
        openPlannerEditor(floatingItemCard.dataset.id);
      }, 220);
      return;
    }
    const itemCard = event.target.closest('[data-action="select-planner-item"]');
    if (itemCard && !event.target.closest('button')) {
      if (plannerSwipeSuppressClickId === itemCard.dataset.id) {
        plannerSwipeSuppressClickId = null;
        return;
      }
      if (plannerSwipeOpenId && plannerSwipeOpenId !== itemCard.dataset.id) {
        plannerSwipeOpenId = null;
        render();
        return;
      }
      const item = plannerItems.find((plannerItem) => plannerItem.id === itemCard.dataset.id);
      selectedPlannerId = selectedPlannerId === itemCard.dataset.id ? null : itemCard.dataset.id;
      plannerDetailReturnPanel = null;
      plannerSwipeOpenId = null;
      pendingDeletePlannerId = null;
      render();
      return;
    }
    if (!target) {
      if (plannerSelectedDateKey) {
        plannerSelectedDateKey = null;
        render();
      }
      return;
    }
    if (target.dataset.action === 'preview-image') {
      openImagePreview(target.dataset.src, target.dataset.title || '图像预览');
      return;
    }
    if (target.dataset.page) goPage(target.dataset.page);
    if (target.dataset.action === 'toggle-planner-form') {
      if (plannerFormOpen) {
        closePlannerForm();
      } else {
        editingPlannerId = null;
        selectedPlannerId = null;
        plannerDetailReturnPanel = null;
        pendingDeletePlannerId = null;
        plannerDraftTitle = '';
        plannerDraftNote = '';
        plannerDraftDate = '';
        resetPlannerDraftHistory();
        plannerFormOpen = true;
        render();
      }
    }
    if (target.dataset.action === 'toggle-completed-planner-items') {
      plannerCompletedOpen = !plannerCompletedOpen;
      render();
    }
    if (target.dataset.action === 'complete-planner-item') completePlannerItem(target.dataset.id);
    if (target.dataset.action === 'edit-planner-item') openPlannerEditor(target.dataset.id);
    if (target.dataset.action === 'request-delete-planner-item') requestDeletePlannerItem(target.dataset.id);
    if (target.dataset.action === 'confirm-delete-planner-item') deletePlannerItem(target.dataset.id);
    if (target.dataset.action === 'cancel-delete-planner-item') cancelDeletePlannerItem();
    if (target.dataset.action === 'pull') pull(Number(target.dataset.count));
    if (target.dataset.action === 'add-team') addToTeam(target.dataset.uid);
    if (target.dataset.action === 'remove-team') removeFromTeam(target.dataset.uid);
    if (target.dataset.action === 'smash') smashCoin(target.dataset.uid);
    if (target.dataset.action === 'detail') goPage('detail', target.dataset.uid);
    if (target.dataset.action === 'supply') grantResources(500, 12, '领取试玩补给：500 钻石与 12 枚高纯金币。');
    if (target.dataset.action === 'reset') resetSave();
  });
  document.querySelector('#imagePreviewModal').addEventListener('click', (event) => {
    if (event.target.closest('[data-action="close-preview"]')) closeImagePreview();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeImagePreview();
  });
}

bindEvents();
render();
