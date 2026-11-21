const $ = selector => document.querySelector(selector);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const dialog = $('dialog');
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
const rows = 16;
const spacing = canvas.width / (rows + 1);
const stepY = 23;
const english = window.frameElement?.lang === 'en';
const text = (ru, en) => english ? en : ru;
const locale = english ? 'en-GB' : 'ru-RU';
const itemNames = {'skate-sharpening':'Skate sharpening','hockey-tape':'Hockey tape','hockey-stick-150':'Hockey stick worth up to $150'};
if (english) {
  document.documentElement.lang = 'en';
  document.title = 'Ice Drop';
  $('h1').firstChild.textContent = 'Ice Drop';
  $('#pilot-intro').textContent = 'We’re testing how points and prizes work. During the trial, points aren’t guaranteed for every goal or game.';
  $('#pilot summary').textContent = 'How we set points and prize prices';
  const [measurements, rules] = document.querySelectorAll('#pilot p');
  measurements.textContent = 'We look at how many points players earn on average, how many they keep after playing and how often they can afford a prize. We compare those results with predictions based on the odds for each goal on the rink.';
  rules.textContent = 'The trial will help us set the scoring rules. For example, a goal in a practice scrimmage may earn a different number of points than a goal in a league game. Shop prices are provisional too. We’re setting them so the prize budget covers the rewards without the organizer having to pay out of pocket.';
  $('.stake > span').textContent = 'Pucks · 1 point each';
  $('.quick [data-n="max"]').textContent = 'Max';
  $('#welcome .w-tag').textContent = 'Bonus';
  $('#drop').textContent = 'Shoot';
  $('#shop').textContent = 'Shop';
  $('canvas').setAttribute('aria-label','Hockey rink with 16 rows and 17 goals');
  const odds = $('#shot-odds'), proof = $('#shot-proof');
  odds.querySelector('summary').textContent = 'Shot odds';
  odds.querySelector('p').textContent = 'Each row has a 50/50 chance of sending the puck left or right. The goal multiplier includes the stake.';
  proof.querySelector('summary').textContent = 'Verify a shot';
  proof.querySelector('p').textContent = 'The server publishes its secret’s SHA-256 hash before the shot. Your browser adds a random nonce, then the server reveals its secret.';
  proof.querySelector('small').textContent = 'Next shot commitment';
  $('#verify').textContent = 'Verify last shot';
  $('#tab').setAttribute('aria-label','Open shop');
  $('dialog h2').textContent = 'Prize shop';
  $('#wallet-label').textContent = 'Your balance';
  $('#wallet-hint').textContent = 'You earn points for goals. Save up for the stick or style your name right now.';
  $('#terms-summary').textContent = 'How to collect a prize';
  $('#shop-budget').textContent = 'Shop prices are provisional. We use them to estimate how many prizes the budget can cover.';
  $('#shop-review').textContent = 'Ordering spends points from your wallet. The admin is notified right away and the prize shows up in your profile. The club may decline to issue it if a review confirms that hacking, point manipulation or abuse of a bug was used to obtain points or a prize.';
  $('dialog form button').setAttribute('aria-label','Close');
}
let state;
let busy = false;

async function request(path, data) {
  if (window.frameElement?.arcadeRequest) return window.frameElement.arcadeRequest(path, data);
  const response = await fetch(path, data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {});
  const body = await response.json();
  if (!response.ok) throw Error(body.error);
  return body;
}
// World coordinates stay fixed as the rink scales to the screen.
const launch = { x:360, y:118 };
const goalY = launch.y + rows * stepY;
const ice = document.createElement('canvas');
ice.width = canvas.width;
ice.height = canvas.height;

function line(c, points, width, color) {
  c.strokeStyle=color; c.lineWidth=width; c.lineCap='round'; c.lineJoin='round';
  c.beginPath(); c.moveTo(...points[0]);
  for (const point of points.slice(1)) c.lineTo(...point);
  c.stroke();
}
function paintIce() {
  const c = ice.getContext('2d');
  const wash = c.createLinearGradient(0,0,720,520);
  wash.addColorStop(0,'#f3faf9'); wash.addColorStop(.55,'#d9edef'); wash.addColorStop(1,'#bcdbdf');
  c.fillStyle=wash; c.fillRect(0,0,720,520);
  c.save(); c.strokeStyle='#719da321'; c.lineWidth=1;
  for(let i=0;i<66;i++) {
    const x=(i*89)%720, y=(i*53)%520;
    c.beginPath(); c.moveTo(x,y); c.quadraticCurveTo(x+13,y-9,x+32,y-11); c.stroke();
  }
  c.restore();
  line(c,[[0,123],[720,123]],3,'#568ca35c');
  line(c,[[0,300],[720,300]],3,'#c57a7654');
  for(const [x,y,r] of [[360,300,48],[125,160,34],[595,160,34]]) {
    c.strokeStyle='#b96b664d'; c.lineWidth=2;c.beginPath();c.arc(x,y,r,0,2*Math.PI);c.stroke();
  }
  for(let row=0;row<rows;row++) for(let col=0;col<=row;col++) {
    const x=360+(col-row/2)*spacing, y=launch.y+4+row*stepY;
    c.fillStyle='#6b949a';c.beginPath();c.arc(x,y+1.5,3.6,0,2*Math.PI);c.fill();
    c.fillStyle='#f7ffff';c.beginPath();c.arc(x-.6,y-.8,2.6,0,2*Math.PI);c.fill();
  }
}
function goalieNet(slot, factor, pulse=0) {
  const x=(slot+.5)*spacing, width=spacing-4;
  const deep=13+pulse*6;
  const color=factor>=100?'#ad512e':factor>=4?'#335a86':'#377e78';
  ctx.save();ctx.translate(x,goalY-2);
  ctx.fillStyle=pulse?'#f5d299':'#eff8f8';ctx.strokeStyle='#749398';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(-width/2,0);ctx.lineTo(width/2,0);ctx.lineTo(width/2-3,deep);
  ctx.lineTo(-width/2+3,deep);ctx.closePath();ctx.fill();ctx.stroke();
  for(let i=1;i<=5;i++) {
    const dx=(i/6-.5)*width;line(ctx,[[dx,0],[dx*.82,deep]],.8,'#89aaae');
  }
  for(const f of [.34,.67]) line(ctx,[[-width/2+2,deep*f],[width/2-2,deep*f]],.8,'#89aaae');
  line(ctx,[[-width/2,10],[-width/2,0],[width/2,0],[width/2,10]],2.8,color);
  if(factor>=100){line(ctx,[[-width/2+4,3],[width/2-4,3]],1.3,'#cb9a53');}
  ctx.restore();
}

// Side-on skater. The blade reaches (360,118) at the moment of contact.
function skater(swing=0, lean=0) {
  ctx.save();ctx.translate(301,61);
  ctx.fillStyle='#759a9b44';ctx.beginPath();ctx.ellipse(0,45,43,5,0,0,Math.PI*2);ctx.fill();
  for(const [hip,knee,foot] of [[[-6,3],[-20,24],[-33,33]],[[3,4],[18,18],[11,39]]]) {
    line(ctx,[hip,knee],13,'#142d40');line(ctx,[knee,foot],10,'#225359');
    line(ctx,[[knee[0],knee[1]+1],[knee[0]-2,knee[1]+5]],9,'#f0dcad');
    line(ctx,[foot,[foot[0]+11,foot[1]+2]],8,'#182936');
    line(ctx,[[foot[0]-4,foot[1]+6],[foot[0]+14,foot[1]+6],[foot[0]+17,foot[1]+4]],2,'#6d888c');
  }
  ctx.rotate(lean);
  ctx.fillStyle='#24746d';ctx.beginPath();ctx.moveTo(-13,-22);ctx.quadraticCurveTo(-6,-33,7,-27);
  ctx.lineTo(17,-15);ctx.lineTo(7,6);ctx.lineTo(-16,4);ctx.closePath();ctx.fill();
  line(ctx,[[-13,-1],[7,1]],4,'#edce90');
  ctx.fillStyle='#e6f4ec';ctx.font='bold 12px system-ui';ctx.fillText('7',-7,-9);
  ctx.fillStyle='#dba47d';ctx.beginPath();ctx.ellipse(5,-35,9,11,-.1,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#162e3f';ctx.beginPath();ctx.arc(3,-40,11,Math.PI,Math.PI*2);ctx.lineTo(18,-37);ctx.lineTo(-7,-36);ctx.fill();
  line(ctx,[[9,-38],[16,-37],[14,-30]],2,'#809ca4');
  ctx.save();ctx.translate(9,-13);ctx.rotate(swing);
  line(ctx,[[0,-5],[36,70],[50,70]],3.5,'#273542');
  line(ctx,[[36,70],[50,70]],5,'#172730');
  line(ctx,[[-10,-9],[-13,2],[0,1]],9,'#22645e');
  line(ctx,[[2,-8],[18,1],[12,17]],9,'#307e72');
  line(ctx,[[-1,0],[2,4]],7,'#192c3a');line(ctx,[[11,16],[14,20]],7,'#192c3a');
  ctx.restore();ctx.restore();
}
function drawPuck(x,y) {
  ctx.fillStyle='#142532';ctx.beginPath();ctx.ellipse(x,y,7,4.7,0,0,2*Math.PI);ctx.fill();
  line(ctx,[[x-3,y-2],[x+2,y-2]],1,'#a9c4cb');
}
function board(swing=0,lean=0,pulses=[]) {
  ctx.drawImage(ice,0,0);
  if(state) state.payouts.forEach((factor,slot)=>goalieNet(slot,factor,pulses[slot]));
  skater(swing,lean);
}
function puckPath(bits) {
  const points=[launch];
  for(const bit of bits){
    const prev=points.at(-1);
    points.push({x:prev.x+(bit==='1'?spacing/2:-spacing/2),y:prev.y+stepY});
  }
  return points;
}
function animate(pucks) {
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){board();return Promise.resolve();}
  const paths=pucks.map(puck=>puckPath(puck.bits));
  const gap=Math.min(125,2100/paths.length);
  const contact=440, flight=1460, settle=300;
  const finish=contact+(paths.length-1)*gap+flight+settle;
  return new Promise(resolve=>{
    const start=performance.now();
    function frame(now) {
      const elapsed=now-start;
      // Draw back, snap forward through the puck, then recover.
      const wind=Math.min(elapsed/300,1);
      const snap=Math.min(1,Math.max(0,(elapsed-300)/(contact-300)));
      const follow=Math.max(0,(elapsed-contact)/280);
      const swing=elapsed<contact?1.25*(wind-snap*snap):-.42*Math.sin(Math.min(1,follow)*Math.PI);
      const pulses=Array(17).fill(0);
      const moving=[];
      paths.forEach((points,index)=>{
        const age=elapsed-contact-gap*index;
        if(age<0)return;
        if(age>=flight){
          const pulse=Math.max(0,1-(age-flight)/settle);
          const slot=pucks[index].slot;
          pulses[slot]=Math.max(pulses[slot],pulse);
          return;
        }
        const progress=age/flight*rows,i=Math.floor(progress),f=progress-i;
        moving.push([points[i].x+(points[i+1].x-points[i].x)*f,points[i].y+stepY*f-4*Math.sin(Math.PI*f)]);
      });
      board(swing,-.08*swing,pulses);
      if(elapsed<contact)drawPuck(launch.x,launch.y);
      for(const [x,y] of moving)drawPuck(x,y);
      if(elapsed<finish)requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}
function renderBonus() {
  const b = state.bonus;
  const active = b.status === 'active';
  const ready = b.status === 'ready';
  $('#welcome').hidden = b.status === 'collected';
  $('#offer-title').textContent = b.status === 'available'
    ? text('100 бесплатных шайб', '100 free pucks')
    : text('Приветственный бонус', 'Welcome bonus');
  const terms = text(
    `Запусти ${b.target} бонусных шайб и забери весь остаток в магазин. Если до этого останется меньше 1 очка, бонус закончится.`,
    `Play ${b.target} bonus pucks to unlock the remaining balance for the shop. The bonus ends if less than 1 point remains before then.`);
  $('#terms').textContent = b.status === 'available' ? terms :
    text(`Отыгрыш: ${b.played}/${b.target}. Бонусный остаток: ${b.balance}. `, `Progress: ${b.played}/${b.target}. Bonus balance: ${b.balance}. `) +
    (active ? terms : ready ? text('Можно забрать остаток.', 'Ready to collect.') : text('Акция завершена.', 'Offer finished.'));
  const bar = $('#bonus-bar');
  bar.hidden = b.status === 'available';
  bar.firstElementChild.style.width = Math.min(100, (b.played / Math.max(1, b.target)) * 100).toFixed(1) + '%';
  $('#bonus-action').hidden = !ready && b.status !== 'available';
  $('#bonus-action').disabled = busy;
  $('#bonus-action').textContent = ready ? text('Забрать остаток', 'Collect balance') : text('Получить бесплатно', 'Claim free pucks');
  const bonusSelected = $('#source').value === 'bonus';
  $('#source-label').hidden = !active && !bonusSelected;
  $('#source-label span').textContent = text('Баланс для броска','Play from');
  $('#source').options[0].text = text('Основной', 'Wallet');
  $('#source').options[1].text = text('Бонусный', 'Bonus');
  $('#source').disabled = busy;
  $('#source').options[1].disabled = !active;
}
$('#source').onchange = updateStake;
$('#bonus-action').onclick = async () => {
  const activate = state.bonus.status === 'available';
  busy=true;render();
  try {
    state=(await request(activate ? '/welcome' : '/collect', {})).state;
    $('#source').value=activate ? 'bonus' : 'wallet';
    $('#status').textContent=activate ? text('Бонус активирован.','Bonus activated.') : text('Остаток переведён на основной баланс.','Balance collected.');
  } catch(e){$('#status').textContent=e.message;}
  finally{busy=false;render();}
};
function updateStake() {
  const input = $('#stake');
  const stake = input.valueAsNumber;
  const b = state.bonus;
  const available = $('#source').value === 'bonus' ? (b.status === 'active' ? Math.min(b.balance,b.target-b.played) : 0) : state.balance;
  input.max = Math.min(state.maxPucks, Math.floor(available));
  input.disabled = busy || available < 1;
  $('#drop').disabled = busy || !Number.isSafeInteger(stake) || stake < 1 || stake > Number(input.max);
  for (const b of document.querySelectorAll('#minus,#plus,.quick button')) b.disabled = input.disabled;
}
/* шайбы: −/+ и быстрый выбор */
function setStake(n) {
  const input = $('#stake');
  const max = Math.max(1, Number(input.max) || 1);
  input.value = String(Math.min(max, Math.max(1, Math.round(n))));
  updateStake();
}
$('#minus').onclick = () => setStake(($('#stake').valueAsNumber || 1) - 1);
$('#plus').onclick = () => setStake(($('#stake').valueAsNumber || 0) + 1);
for (const b of document.querySelectorAll('.quick button')) b.onclick = () => setStake(b.dataset.n === 'max' ? Number($('#stake').max) : Number(b.dataset.n));
$('#stake').oninput = updateStake;

function render() {
  renderBonus();
  $('#balance').textContent=state.balance.toLocaleString(locale)+text(' очк.',' pts');
  updateStake();
  $('#commit').textContent=state.commitment;
  $('#slots').replaceChildren(...state.payouts.map((n,i)=>{
    const b=document.createElement('b'); b.textContent=n.toLocaleString('ru-RU', {useGrouping:false});
    b.dataset.factor=n;
    if(state.last?.pucks?.some(puck => puck.slot===i)) b.className='hit';
    return b;
  }));
  $('#verify').hidden=!state.last;
  $('#receipt').textContent=state.last?JSON.stringify(state.last,null,2):text('Квитанция появится после броска.','Your receipt will appear after a shot.');
  renderShop();
}

/* ---------- витрина магазина ---------- */
const ART = {
  'hockey-stick-150': `<svg viewBox="0 0 240 150" aria-hidden="true"><defs><linearGradient id="shaft" x1="0" x2="1"><stop offset="0" stop-color="#f4f8fa"/><stop offset="1" stop-color="#b9cbd3"/></linearGradient><linearGradient id="gold" x1="0" x2="1"><stop offset="0" stop-color="#f6dc9c"/><stop offset="1" stop-color="#c8963e"/></linearGradient></defs>
    <ellipse cx="128" cy="134" rx="92" ry="7" fill="#000" opacity=".35"/>
    <path d="M44 14 L168 112" stroke="url(#shaft)" stroke-width="11" stroke-linecap="round"/>
    <path d="M44 14 L74 38" stroke="#14232c" stroke-width="12" stroke-linecap="round"/>
    <path d="M50 19 L56 24 M58 25 L64 30 M66 31 L72 36" stroke="#2c4552" stroke-width="3"/>
    <circle cx="42" cy="12" r="8" fill="#14232c"/>
    <path d="M97 56 L132 84" stroke="url(#gold)" stroke-width="4" stroke-linecap="round" opacity=".9"/>
    <path d="M166 110 C176 120 196 124 222 120 C228 119 230 112 224 110 C202 108 186 104 172 98 Z" fill="#14232c"/>
    <path d="M178 112 L182 104 M188 115 L191 106 M198 117 L200 108 M208 117 L209 109" stroke="#f4f8fa" stroke-width="3"/>
    <path d="M60 128 L64 124 M150 26 l6 -6 M196 36 l8 0 M200 32 l0 8" stroke="url(#gold)" stroke-width="3" stroke-linecap="round"/></svg>`,
  'skate-sharpening': `<svg viewBox="0 0 240 150" aria-hidden="true"><defs><linearGradient id="blade" x1="0" x2="1"><stop offset="0" stop-color="#e9f4f8"/><stop offset="1" stop-color="#8fb3c2"/></linearGradient></defs>
    <ellipse cx="118" cy="132" rx="84" ry="6" fill="#000" opacity=".35"/>
    <path d="M58 30 C70 22 96 22 106 30 L112 70 C138 72 168 78 182 92 C188 98 186 106 178 106 L52 106 C46 106 44 100 46 94 Z" fill="#e6eef2"/><path d="M112 70 C138 72 168 78 182 92 C188 98 186 106 178 106 L120 106 C132 96 128 80 112 70 Z" fill="#c4d4dc"/>
    <path d="M60 40 C74 34 92 34 102 40 M62 54 C76 48 92 48 104 54 M64 68 C78 62 94 62 106 68" stroke="#14232c" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M52 98 L180 98" stroke="#14232c" stroke-width="8"/>
    <path d="M56 106 L58 112 M168 106 L166 112" stroke="#5c7685" stroke-width="5"/>
    <path d="M40 114 L200 114 C204 114 206 118 202 120 L46 124 C40 124 36 118 40 114 Z" fill="url(#blade)"/>
    <path d="M206 102 l14 -10 M208 112 l18 -2 M204 92 l8 -16" stroke="#9df3ca" stroke-width="3" stroke-linecap="round"/></svg>`,
  'hockey-tape': `<svg viewBox="0 0 240 150" aria-hidden="true">
    <ellipse cx="120" cy="134" rx="70" ry="6" fill="#000" opacity=".35"/>
    <path d="M150 84 C172 92 196 104 214 124 L200 132 C184 114 164 102 144 96 Z" fill="#f4f8fa" opacity=".92"/>
    <circle cx="110" cy="72" r="54" fill="#f4f8fa"/>
    <circle cx="110" cy="72" r="54" fill="none" stroke="#c9d8de" stroke-width="2"/>
    <circle cx="110" cy="72" r="40" fill="none" stroke="#dfe9ed" stroke-width="2"/>
    <circle cx="110" cy="72" r="26" fill="#14232c"/>
    <circle cx="110" cy="72" r="26" fill="none" stroke="#9df3ca" stroke-width="3" opacity=".7"/></svg>`,
};
Object.assign(ART, {
  'nick-fire': `<div class="nick-art fire">${'ИМЯ'}</div>`,
  'nick-color': `<div class="nick-art palette"><i style="background:#ff5a5f"></i><i style="background:#ffd23f"></i><i style="background:#3ddc84"></i><i style="background:#2ec4ff"></i><i style="background:#7b61ff"></i></div>`,
  'nick-grad': `<div class="nick-art grad">ИМЯ</div>`,
  'frame-month': `<div class="nick-art frames"><span class="fr frame-neon">F</span><span class="fr frame-gold">F</span><span class="fr frame-ice">F</span></div>`,
  'frame-season': `<div class="nick-art frames"><span class="fr frame-rainbow">F</span><span class="fr frame-fire">F</span><span class="fr frame-falcons">F</span></div>`,
  'nick-emoji': `<div class="nick-art emoji">🦅</div>`,
  'shout-out': `<div class="nick-art shout">📣</div>`,
});
const META = {
  'hockey-stick-150': [['Клюшка','Любая на выбор — до $150'],['Hockey stick','Any stick you like — up to $150']],
  'skate-sharpening': [['Заточка коньков','Одна заточка у точильщика команды'],['Skate sharpening','One sharpening by the team sharpener']],
  'hockey-tape': [['Хоккейная лента','Рулон для крюка или рукоятки'],['Hockey tape','A roll for the blade or the handle']],
  'nick-fire': [['Огненный ник','Имя горит в составах и пятёрках · 30 дней'],['Fire nickname','Your name burns in rosters and lines · 30 days']],
  'nick-color': [['Цветной ник','Цвет на выбор · 30 дней'],['Colour nickname','Pick a colour · 30 days']],
  'nick-grad': [['Градиентный ник','Переливается в составах и пятёрках · 30 дней'],['Gradient nickname','Shimmers in rosters and lines · 30 days']],
  'frame-month': [['Особая рамка · месяц','Рамка аватарки на выбор · 30 дней'],['Special frame · month','Pick an avatar frame · 30 days']],
  'frame-season': [['Особая рамка · сезон','Рамка на выбор до конца сезона'],['Special frame · season','Pick a frame until the season ends']],
  'nick-emoji': [['Эмодзи у ника','Значок рядом с именем · 30 дней'],['Nickname emoji','A badge next to your name · 30 days']],
  'shout-out': [['Респект в чате','Бот поздравит тебя в командном чате'],['Shout-out','The bot cheers you in the team chat']],
};
const SAMPLE = text('Твой ник', 'Your name');
const GRAD_NAMES = { sunset: text('Закат', 'Sunset'), gold: text('Золото', 'Gold'), neon: text('Неон', 'Neon'), aurora: text('Сияние', 'Aurora'), blood: text('Кровь на льду', 'Blood on ice') };
const FRAME_NAMES = { torch: text('Грозный факел', 'Fierce torch'), gold: text('Золото', 'Gold'), ice: text('Лёд', 'Ice'), neon: text('Неон', 'Neon'), fire: text('Огонь', 'Fire'), falcons: 'Falcons', rainbow: text('Радуга', 'Rainbow') };
const pts = n => n.toLocaleString(locale) + text(' очк.', ' pts');
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

const picked = {};
function product(item, featured) {
  const [title, sub] = (META[item.id] ?? [[item.name, ''], [itemNames[item.id] ?? item.name, '']])[english ? 1 : 0];
  const times = state.bought?.[item.id] ?? 0;
  const enough = state.balance >= item.price;
  const card = el('article', 'prize' + (featured ? ' hero' : '') + (enough ? ' ready' : '') + ` k-${item.kind ?? 'physical'}`);
  card.append(el('div', 'art', ART[item.id] ?? `<span class="glyph">${item.icon ?? '★'}</span>`));
  const body = el('div', 'meta');
  if (featured) body.append(el('span', 'tag', text('Главный приз', 'Grand prize')));
  const h = el('h3'); h.textContent = title; body.append(h);
  if (sub) { const p = el('p', 'sub'); p.textContent = sub; body.append(p); }
  // выбор цвета / эмодзи прямо в карточке + превью ника
  if (item.options) {
    picked[item.id] ??= item.options[0];
    const preview = el('div', 'preview');
    const paint = () => {
      const o = picked[item.id];
      if (item.id.startsWith('frame-')) { preview.innerHTML = `<span class="fr big frame-${o}">F</span> <b>${FRAME_NAMES[o] ?? o}</b>`; return; }
      preview.textContent = item.id === 'nick-emoji' ? `${SAMPLE} ${o}` : SAMPLE;
      preview.style.color = item.id === 'nick-color' ? o : '';
      preview.className = 'preview' + (item.id === 'nick-grad' ? ` g-text g-${o}` : '');
    };
    const opts = el('div', 'opts' + (item.id === 'nick-color' || item.id === 'nick-grad' ? ' colors' : item.id.startsWith('frame-') ? ' frames' : ' emojis'));
    for (const o of item.options) {
      const b = el('button', 'opt' + (picked[item.id] === o ? ' on' : ''));
      b.type = 'button';
      if (item.id === 'nick-color') { b.style.background = o; b.setAttribute('aria-label', o); }
      else if (item.id === 'nick-grad') { b.className += ' g-' + o; b.setAttribute('aria-label', GRAD_NAMES[o] ?? o); }
      else if (item.id.startsWith('frame-')) { b.className += ' fopt'; b.innerHTML = `<span class="fr frame-${o}">F</span>`; b.setAttribute('aria-label', FRAME_NAMES[o] ?? o); }
      else b.textContent = o;
      b.onclick = () => { picked[item.id] = o; for (const x of opts.children) x.classList.toggle('on', x === b); paint(); };
      opts.append(b);
    }
    paint();
    body.append(preview, opts);
  } else if (item.id === 'nick-fire') {
    const preview = el('div', 'preview fire'); preview.textContent = SAMPLE; body.append(preview);
  }
  const price = el('div', 'price'); price.textContent = item.hidden ? text('??? очк.', '??? pts') : pts(item.price); body.append(price);
  if (item.hidden) {
    const note = el('small', 'left'); note.textContent = text('Цена откроется, когда возьмёшь', 'The price shows up when you claim'); body.append(note);
  } else if (!enough) {
    const pct = Math.min(100, (state.balance / item.price) * 100);
    const bar = el('div', 'bar'); const fill = el('i'); fill.style.width = pct.toFixed(1) + '%'; bar.append(fill); body.append(bar);
    const note = el('small', 'left'); note.textContent = text(`Ещё ${pts(Math.ceil(item.price - state.balance))}`, `${pts(Math.ceil(item.price - state.balance))} to go`); body.append(note);
  } else if (times) {
    const note = el('small', 'left'); note.textContent = text(`Уже брал: ${times}`, `Claimed before: ${times}`); body.append(note);
  }
  const btn = el('button', 'buy');
  btn.textContent = enough || item.hidden ? (times ? text('Взять ещё', 'Claim again') : text('Взять', 'Claim')) : text('Копим', 'Saving up');
  btn.disabled = busy || (!enough && !item.hidden);
  const doBuy = async (term) => {
    busy = true; render();
    try {
      state = (await request('/buy', { id: item.id, option: picked[item.id], ...(term ? { term } : {}) })).state;
      const k = item.kind;
      $('#shopmsg').textContent =
        k === 'cosmetic' ? text(`Готово! «${title}» уже действует — смотри в профиле.`, `Done! “${title}” is live — check your profile.`)
        : k === 'shout' ? text('Готово! Бот уже поздравил тебя в чате 📣', 'Done! The bot cheered you in the chat 📣')
        : k === 'voucher' ? text('Готово! Заточка лежит в профиле — потрать её во вкладке «Заточка».', 'Done! The sharpening is in your profile — use it on the Sharpening tab.')
        : text(`Готово! Админ получил заказ «${title}». Приз — в профиле.`, `Done! The admin got your order “${title}”. It’s in your profile.`);
    }
    catch (e) { $('#shopmsg').textContent = e.message; }
    finally { busy = false; render(); }
  };
  // скрытая цена: открываем её прямо в карточке и просим подтвердить
  btn.onclick = () => {
    if (!item.hidden) return doBuy();
    const box = el('div', 'reveal');
    const ok = enough;
    box.innerHTML = '<p>' + (ok
      ? text(`Цена — <b>${pts(item.price)}</b>. Берём?`, `It costs <b>${pts(item.price)}</b>. Claim it?`)
      : text(`Цена — <b>${pts(item.price)}</b>. Пока не хватает очков.`, `It costs <b>${pts(item.price)}</b>. Not enough points yet.`)) + '</p>';
    const row = el('div', 'reveal-row');
    if (ok) { const yes = el('button', 'buy'); yes.textContent = text('Да, беру', 'Yes'); yes.onclick = () => doBuy(); row.append(yes); }
    const no = el('button', 'buy ghost'); no.textContent = ok ? text('Нет', 'No') : text('Ок', 'OK'); no.onclick = () => { box.replaceWith(btn); };
    row.append(no); box.append(row);
    btn.replaceWith(box);
  };
  // ачивка на неделю — дешевле: отдельная кнопка рядом с «месяцем»
  if (item.weekPrice && !item.hidden) {
    const row = el('div', 'terms');
    const wk = el('button', 'buy ghost');
    wk.textContent = text(`Неделя · ${pts(item.weekPrice)}`, `Week · ${pts(item.weekPrice)}`);
    wk.disabled = busy || state.balance < item.weekPrice;
    wk.onclick = () => doBuy('week');
    btn.textContent = text(`Месяц · ${pts(item.price)}`, `Month · ${pts(item.price)}`);
    row.append(wk, btn);
    body.append(row);
  } else body.append(btn);
  card.append(body);
  return card;
}

function renderShop() {
  $('#shop-balance').textContent = pts(state.balance);
  const items = [...state.items];
  const hero = items.filter((i) => i.kind === 'physical').sort((a, b) => b.price - a.price)[0];
  const group = (title, note, list, extra = []) => {
    if (!list.length && !extra.length) return [];
    const h = el('div', 'shop-sec'); h.textContent = title;
    const out = [h];
    if (note) { const n = el('p', 'shop-note'); n.textContent = note; out.push(n); }
    const grid = el('div', 'grid'); grid.append(...list.map((i) => product(i, false)), ...extra); out.push(grid);
    return out;
  };
  const nicks = items.filter((i) => i.id.startsWith('nick-') || i.kind === 'shout');
  const frames = items.filter((i) => i.id.startsWith('frame-'));
  const gear = items.filter((i) => i !== hero && (i.kind === 'physical' || i.kind === 'voucher'));
  // рамка навсегда — за деньги, оформляется в приложении (скрин перевода)
  const forever = el('article', 'prize forever');
  forever.innerHTML = `<div class="art"><div class="nick-art frames"><span class="fr frame-rainbow">F</span><span class="fr frame-gold">F</span><span class="fr frame-neon">F</span></div></div>`;
  const fm = el('div', 'meta');
  fm.innerHTML = `<span class="tag">${text('Навсегда', 'Forever')}</span><h3>${text('Особая рамка навсегда', 'Special frame forever')}</h3><p class="sub">${text('Любая рамка — твоя насовсем', 'Any frame, yours for good')}</p><div class="price">X ₾</div>`;
  const fb = el('button', 'buy'); fb.textContent = text('Оформить', 'Get it');
  fb.onclick = () => (window.frameElement?.arcadeOpen ? window.frameElement.arcadeOpen('/frame-forever') : null);
  fm.append(fb); forever.append(fm);
  $('#items').replaceChildren(
    ...(hero ? [product(hero, true)] : []),
    ...group(text('Ачивки', 'Achievements'), text('Ачивки меняются с разной периодичностью: одни уходят через неделю, другие держатся сезон. Цены — секрет, пока не возьмёшь.', 'Achievements rotate at different paces: some leave in a week, some stay all season. Prices are a secret until you claim.'), nicks),
    ...group(text('Особые рамки', 'Special frames'), text('Рамка аватарки на выбор: месяц, до конца сезона или навсегда.', 'Pick an avatar frame: a month, the rest of the season, or forever.'), frames, [forever]),
    ...group(text('Экипировка', 'Gear'), '', gear),
  );
}
$('#drop').onclick=async()=>{
  busy=true;render();$('#status').textContent=text('Шайба в игре…','Pucks in play…');
  try {
    const commitment=state.commitment;
    const nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
    const stake=$('#stake').valueAsNumber;
    const source=$('#source').value;
    const result=await request('/drop',{commitment,nonce,stake,rows,source});
    if(result.receipt.commitment!==commitment || result.receipt.nonce!==nonce || result.receipt.stake!==stake) throw Error('Квитанция не соответствует запросу.');
    await animate(result.receipt.pucks);
    state=result.state;
    $('#status').textContent=text(`Шайб: ${stake} · Общая выплата: ${result.receipt.payout.toLocaleString(locale)} очк.`,`Pucks: ${stake} · Total payout: ${result.receipt.payout} pts`);
  } catch(e){$('#status').textContent=e.message;state=await request('/state');}
  finally{busy=false;render();}
};
$('#verify').onclick=async()=>{
  const r=state.last, encode=s=>new TextEncoder().encode(s);
  const hash=hex(await crypto.subtle.digest('SHA-256',encode(r.seed)));
  const key=await crypto.subtle.importKey('raw',encode(r.seed),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const batch = Array.isArray(r.pucks);
  const entries = batch ? r.pucks : [r];
  const stake = r.stake ?? 1;
  let ok = hash === r.commitment && (!batch || entries.length === stake);
  let totalUnits = 0;
  for (const [index, puck] of entries.entries()) {
    const message = batch ? r.nonce + ':' + index : r.nonce;
    const digest = new DataView(await crypto.subtle.sign('HMAC',key,encode(message)));
    const legacy = !batch && puck.bits.length === 8;
    const table = legacy ? [10,3,1,1,0,1,1,3,10] : state.payouts;
    const path = legacy ? digest.getUint8(0) : digest.getUint16(0);
    const bits = path.toString(2).padStart(legacy ? 8 : rows,'0');
    const slot = [...bits].filter(b => b === '1').length;
    ok &&= bits === puck.bits && slot === puck.slot && (puck.multiplier ?? table[slot]) === table[slot];
    totalUnits += (batch ? 1 : stake) * Math.round(5 * table[slot]);
  }
  ok &&= totalUnits / 5 === r.payout;
  $('#receipt').textContent=JSON.stringify(r,null,2)+'\n'+(ok?text('Проверено: путь и выплата совпали.','Verified: paths and payout match.'):text('Ошибка проверки.','Verification failed.'));
};
$('#shop').onclick=$('#tab').onclick=()=>dialog.showModal();
paintIce();
try{
  state=await request('/state');
  if(state.bonus.status==='active') $('#source').value='bonus';
  render();board();drawPuck(launch.x, launch.y);
  $('#odds').textContent='Из 65 536 равновероятных путей: 0,2× — 51 766; 2× — 8736; 4× — 3640; 10× — 1120; 20× — 240; 100× — 32; 1000× — 2. Средний возврат — 97,02%.';
  if(english) $('#odds').textContent='Out of 65,536 paths: 0.2× — 51,766; 2× — 8,736; 4× — 3,640; 10× — 1,120; 20× — 240; 100× — 32; 1000× — 2. Average return: 97.02%.';
  if(!state.balance && state.bonus.status==='spent') $('#status').textContent=text('Основной баланс пока пуст.','Your wallet is currently empty.');
}catch(e){$('#status').textContent=e.message;}
