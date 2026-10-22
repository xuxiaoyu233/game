/* UI-only interactions. No game model, simulation, network, storage or save writes. */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const shell = $('.game-shell');
const card = $('.object-card');
const dialog = $('#review-dialog');
const content = $('#dialog-content');
const toast = $('.toast');
let toastTimer;
let selectedPlace = 'farm';
let returnFocus = null;

const places = {
  farm: {
    name: '农田',
    category: '生产设施',
    output: '原粮产出',
    effect: '自动产出',
    artPosition: '69% 62%',
    icon: 'grain',
  },
  workshop: {
    name: '木工坊',
    category: '加工设施',
    output: '板材产出',
    effect: '加工产出',
    artPosition: '19% 42%',
    icon: 'hammer',
  },
  well: {
    name: '水井',
    category: '民生设施',
    output: '饮水产出',
    effect: '自动产出',
    artPosition: '48% 43%',
    icon: 'water',
  },
};

function emit(type, payload = {}) {
  // Integration seam: CodeBuddy maps these intents to existing commands/navigation.
  document.dispatchEvent(new CustomEvent('ui-preview:action', { detail: { type, ...payload } }));
}
function tell(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2200);
}
function setPlace(id) {
  const place = places[id];
  if (!place) return;
  selectedPlace = id;
  card.classList.remove('compact');
  $('#object-name').textContent = place.name;
  $('.eyebrow').textContent = place.category;
  $('#output-label').textContent = place.output;
  $('#upgrade-label').textContent = place.effect;
  $('.object-art').style.backgroundPosition = place.artPosition;
  $('.object-seal').innerHTML = icon(place.icon);
  $$('.place-marker').forEach((marker) =>
    marker.classList.toggle('selected', marker.dataset.place === id),
  );
  emit('select', { place: id });
  if (dialog.open && dialog.dataset.kind === 'objects') closeDialog();
}
function heading(kicker, title, subtitle = '') {
  return `<p class="dialog-kicker">${kicker}</p><h2 class="dialog-title">${title}</h2>${subtitle ? `<p class="dialog-subtitle">${subtitle}</p>` : ''}`;
}
function plainCard(name, symbol, rows, action = '') {
  return `<section class="plain-card"><h3>${icon(symbol)}${name}</h3>${rows.map(([key, value]) => `<p><span>${key}</span><strong>${value}</strong></p>`).join('')}${action ? `<button class="main-button" data-preview-action="${action}">${action}${icon('arrow')}</button>` : ''}</section>`;
}
const resources = [
  ['原粮', 'grain'],
  ['木材', 'wood'],
  ['石材', 'stone'],
  ['板材', 'board'],
  ['饮水', 'water'],
  ['口粮', 'bread'],
];
function renderDialog(kind) {
  if (kind === 'objects') {
    return (
      heading('定位设施', '选择建筑') +
      `<div class="plain-grid">${Object.entries(places)
        .map(
          ([id, place]) =>
            `<button class="plain-card" data-place="${id}"><h3>${icon(place.icon)}${place.name}</h3><p>${place.category}</p></button>`,
        )
        .join('')}</div>`
    );
  }
  if (kind === 'inspiration') {
    const choices = [
      {
        route: '农事 · 持续供给',
        name: '丰收接力',
        symbol: 'grain',
        text: '每完成若干次农田生产，额外获得一批原粮。',
        target: '作用于农田',
      },
      {
        route: '木工 · 材料循环',
        name: '边角再用',
        symbol: 'wood',
        text: '加工积累后返还部分木材，支持下一次建设。',
        target: '作用于木工坊',
      },
      {
        route: '仓储 · 长期积累',
        name: '扩容整理',
        symbol: 'store',
        text: '增加集中仓容，为持续经营留出更多余量。',
        target: '作用于集中仓容',
      },
    ];
    return (
      heading('发展机遇', '选择一项发展方案') +
      `<div class="choice-grid">${choices.map((choice, index) => `<button class="choice-card" data-choice="${index}" aria-pressed="false"><span class="choice-symbol">${icon(choice.symbol)}</span><small>${choice.route}</small><h3>${choice.name}</h3><p>${choice.text}</p><strong>${choice.target}${icon('arrow')}</strong></button>`).join('')}</div><p class="dialog-footnote">成长方案视觉预览 · 具体倍率与触发次数尚待确定</p>`
    );
  }
  if (kind === 'resources') {
    return (
      heading('仓储账本', '资源总览') +
      `<div class="resource-list">${resources.map(([name, symbol]) => `<div>${icon(symbol, symbol)}<span>${name}</span><strong>--</strong><small>-- / 秒</small></div>`).join('')}</div><p class="dialog-footnote">库存与收支待接入实际营地数据</p>`
    );
  }
  if (kind === 'skills') {
    return (
      heading('专注与成长', '技能', '选择一项专注，设施照常自动生产。') +
      `<div class="plain-grid">${[
        ['农事', 'grain'],
        ['伐木', 'wood'],
        ['采矿', 'stone'],
        ['木工', 'hammer'],
      ]
        .map(([name, symbol]) =>
          plainCard(
            name,
            symbol,
            [
              ['等级', '--'],
              ['经验', '-- / --'],
            ],
            '查看作业',
          ),
        )
        .join('')}</div>`
    );
  }
  if (kind === 'research') {
    return (
      heading('小镇研究', '下一份改变', '研究开放设施与改造能力，已建成长继续保留。') +
      `<div class="plain-grid">${[
        ['田地灌溉', 'grain', '改善农田产出'],
        ['木材加工', 'hammer', '开放木工坊与板材加工'],
        ['仓储组织', 'store', '开放后续仓储成长'],
        ['轮作', 'grain', '开放农田2星'],
        ['标准工具', 'hammer', '开放生产设施2星'],
        ['模块仓储', 'store', '开放仓库2星'],
      ]
        .map(([name, symbol, effect]) =>
          plainCard(
            name,
            symbol,
            [
              ['效果', effect],
              ['费用 / 状态', '--'],
            ],
            '查看研究',
          ),
        )
        .join('')}</div>`
    );
  }
  if (kind === 'population') {
    return (
      heading('小镇生活', '民生') +
      `<div class="plain-grid">${plainCard('居民与住房', 'people', [
        ['人口 / 床位', '-- / --'],
        ['可用劳动力', '--'],
      ])}${plainCard('食物与饮水', 'water', [
        ['口粮收支', '-- / 秒'],
        ['饮水收支', '-- / 秒'],
      ])}</div>`
    );
  }
  if (kind === 'settings') {
    return (
      heading('我的小镇', '设置') +
      `<div class="plain-grid">${plainCard('进度', 'book', [
        ['保存范围', '当前浏览器'],
        ['保存状态', '--'],
      ])}${plainCard('显示', 'home', [
        ['动效', '跟随系统'],
        ['场景', '全景 / 放大'],
      ])}</div><div class="dialog-buttons"><button class="main-button" disabled>保存进度</button><button class="detail-button" disabled>导出存档</button></div><p class="dialog-footnote">当前为独立界面原型，保存与导出按钮未连接真实存档。</p>`
    );
  }
  if (kind === 'courtyard') {
    return (
      heading('继续建设', '整修院落', '在同一处小镇开放更多可建位置。') +
      `<div class="plain-grid">${plainCard('本次整修', 'home', [
        ['可建位置', '--'],
        ['所需材料', '--'],
        ['开放条件', '--'],
      ])}</div><div class="dialog-buttons"><button class="main-button" disabled>整修院落</button></div>`
    );
  }
  if (kind === 'upgrade') {
    return (
      heading(
        '下一次成长',
        `${places[selectedPlace].name}升级`,
        '费用与效果将在接入真实状态后显示。',
      ) +
      `<div class="plain-grid">${plainCard('升级前后', places[selectedPlace].icon, [
        ['设施等级', '-- → --'],
        ['有效产出', '-- → --'],
      ])}${plainCard('建设材料', 'hammer', [
        ['本次费用', '--'],
        ['供料状态', '--'],
      ])}</div><div class="dialog-buttons"><button class="main-button" disabled>确认升级</button><button class="detail-button" data-close-dialog>返回小镇</button></div>`
    );
  }
  return '';
}
function openDialog(kind) {
  returnFocus = document.activeElement;
  content.innerHTML = renderDialog(kind);
  dialog.dataset.kind = kind;
  if (!dialog.open) dialog.showModal();
  $('.dialog-close').focus();
  emit('open', { panel: kind });
}
function closeDialog() {
  dialog.close();
}
dialog.addEventListener('close', () => {
  $$('.nav-item').forEach((button) => {
    const isCamp = button.dataset.tab === 'camp';
    button.classList.toggle('active', isCamp);
    button.setAttribute('aria-selected', String(isCamp));
    button.tabIndex = isCamp ? 0 : -1;
  });
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
});
$('.dialog-close').addEventListener('click', closeDialog);
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) closeDialog();
});
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const placeButton = event.target.closest('[data-place]');
  if (placeButton) {
    setPlace(placeButton.dataset.place);
    return;
  }
  const opener = event.target.closest('[data-dialog]');
  if (opener) {
    openDialog(opener.dataset.dialog);
    return;
  }
  const tab = event.target.closest('[data-tab]');
  if (tab) {
    const kind = tab.dataset.tab;
    $$('.nav-item').forEach((button) => {
      const selected = button === tab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    if (kind === 'camp') {
      if (dialog.open) closeDialog();
      return;
    }
    openDialog(kind);
    return;
  }
  const choice = event.target.closest('[data-choice]');
  if (choice) {
    $$('.choice-card').forEach((button) => {
      button.classList.toggle('chosen', button === choice);
      button.setAttribute('aria-pressed', String(button === choice));
    });
    emit('choose-preview', { choice: choice.dataset.choice });
    return;
  }
  if (event.target.closest('[data-close-dialog]')) {
    closeDialog();
    return;
  }
  if (event.target.closest('[data-preview-action]')) {
    tell('操作样式预览；实际条件与数值待接入');
    return;
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'upgrade') openDialog('upgrade');
  if (action === 'fit') {
    shell.classList.remove('zoomed');
    shell.classList.add('world-fit');
    positionMarkers();
    emit('fit');
  }
  if (action === 'zoom') {
    shell.classList.remove('world-fit');
    shell.classList.toggle('zoomed');
    positionMarkers();
    emit('zoom');
  }
});
$('.detail-button').addEventListener('click', (event) => {
  const expanded = card.classList.toggle('expanded');
  $('.object-details').hidden = !expanded;
  event.currentTarget.setAttribute('aria-expanded', String(expanded));
  event.currentTarget.textContent = expanded ? '收起' : '详情';
});
$('.card-close').addEventListener('click', () => {
  if (matchMedia('(max-width: 700px)').matches) {
    card.classList.remove('expanded');
    $('.object-details').hidden = true;
    $('.detail-button').textContent = '详情';
    $('.detail-button').setAttribute('aria-expanded', 'false');
  } else {
    card.classList.toggle('compact');
  }
});
$('.object-main').addEventListener('click', () => {
  if (card.classList.contains('compact')) card.classList.remove('compact');
});
$('.navigation').addEventListener('keydown', (event) => {
  const tabs = $$('.nav-item');
  const active = tabs.indexOf(document.activeElement);
  let next = active;
  if (event.key === 'ArrowRight') next = (active + 1) % tabs.length;
  if (event.key === 'ArrowLeft') next = (active + tabs.length - 1) % tabs.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = tabs.length - 1;
  if (next !== active) {
    event.preventDefault();
    tabs[next].focus();
  }
});

function positionMarkers() {
  const world = $('.world-art');
  const width = world.clientWidth;
  const height = world.clientHeight;
  const fit = shell.classList.contains('world-fit') && matchMedia('(max-width: 700px)').matches;
  const scale = (fit ? Math.min : Math.max)(width / 1586, height / 992);
  const imageWidth = 1586 * scale;
  const imageHeight = 992 * scale;
  $$('.place-marker').forEach((marker) => {
    const x = parseFloat(marker.style.getPropertyValue('--x')) / 100;
    const y = parseFloat(marker.style.getPropertyValue('--y')) / 100;
    const left = x * imageWidth - (imageWidth - width) / 2;
    const top = y * imageHeight - (imageHeight - height) / 2;
    marker.style.left = `${left}px`;
    marker.style.top = `${top}px`;
    marker.hidden = left < 35 || left > width - 35 || top < 35 || top > height - 35;
  });
}
new ResizeObserver(positionMarkers).observe($('.world-art'));
positionMarkers();
