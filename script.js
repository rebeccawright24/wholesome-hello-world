// ---------------------------------------------------------------------------
// Catch the Flies!
// Each spider is a pendulum: a weight on a thread hanging from a web.
// ◀ ▶ pushes the swing (like pumping your legs on a swing). ▲ ▼ climbs the thread.
// Catch all three flies to finish a level. Each level the spiders get heavier
// and the flies get faster and more erratic. Every 5 flies gets a celebration.
//
// Online play uses PeerJS to connect two browsers. The host's browser is the
// "referee": it runs the flies and scores and sends updates to the guest.
// The guest sends which buttons they're pressing back to the host.
// ---------------------------------------------------------------------------

const playfield = document.getElementById("playfield");
const hud = document.getElementById("hud");
const banner = document.getElementById("banner");
const statusText = document.getElementById("status");
const codeInput = document.getElementById("code");
const menuButtons = document.querySelectorAll("#menu button, #menu input");

// Settings you can play with
const GRAVITY = 2000;      // how strongly the spider is pulled down
const AIR = 0.35;          // air resistance: how quickly the swinging dies down
const SWING_PUSH = 1200;   // how hard ◀ ▶ push the swing (at level 1)
const CLIMB_SPEED = 160;   // how fast the spider climbs up and down
const DROP_SPEED = 420;    // how fast the spider drops when the game starts
const TUCKED_UP = 75;      // thread length before the game starts (just under the web)
const DROP_TO = 220;       // thread length after the drop
const SHORTEST = 40;       // shortest the thread can get
const FLIES_PER_LEVEL = 3;
const FLY_SPEED = 90;      // how fast flies fly at level 1
const CATCH_DISTANCE = 30; // how close a spider has to get to catch a fly
const CELEBRATE_EVERY = 5; // celebrate every this many flies

// Online settings
const ONLINE_WIDTH = 1000;  // online games use a fixed-size arena, so both screens match
const ONLINE_HEIGHT = 700;
const SEND_EVERY = 0.05;    // the host sends updates 20 times a second
const ROOM_PREFIX = "catch-the-flies-";
const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I, which look alike

const SPIDER_PICTURES = ["images/spider.svg", "images/spider-blue.svg"];

// How each level gets harder
function spiderWeight() { return Math.min(1 + 0.2 * (level - 1), 3); }     // heavier = harder to push
function spiderSize()   { return Math.min(1 + 0.06 * (level - 1), 1.6); }  // grows a little, so you can see it
function flySpeed()     { return Math.min(FLY_SPEED * (1 + 0.15 * (level - 1)), 260); }
function flyWobble()    { return Math.min(5 * (1 + 0.35 * (level - 1)), 22); }  // how much they wander
function flyDarts()     { return Math.min(0.35 * (level - 1), 2.5); }      // sudden turns per second

// The state of the game
let mode = "solo";     // "solo", "host" or "guest"
let myIndex = 0;       // which spider is mine: 0 (green-ish) or 1 (blue)
let playing = false;
let betweenLevels = false;
let level = 1;
let spiders = [];
let flies = [];
let nextFlyId = 1;
let peer = null;       // our PeerJS connection to the "receptionist"
let conn = null;       // the connection to the other player
let sendTimer = 0;

// Which directions I'm holding down (by keyboard or buttons)
const myHeld = { left: false, right: false, up: false, down: false };

// ----- The size of the game area -----

const world = { w: window.innerWidth, h: window.innerHeight, fixed: false };

function fitWorld() {
  let scale = 1;
  let left = 0;
  if (world.fixed) {
    scale = Math.min(window.innerWidth / world.w, window.innerHeight / world.h);
    left = (window.innerWidth - world.w * scale) / 2;
  } else {
    world.w = window.innerWidth;
    world.h = window.innerHeight;
  }
  playfield.style.width = world.w + "px";
  playfield.style.height = world.h + "px";
  playfield.style.transform = "translate(" + left + "px, 0) scale(" + scale + ")";
}
window.addEventListener("resize", fitWorld);

function longest() {
  return Math.max(SHORTEST + 20, world.h - 70);
}

function create(tag, className) {
  const element = document.createElement(tag);
  element.className = className;
  playfield.appendChild(element);
  return element;
}

// ----- Spiders -----

function setUpSpiders(anchors) {
  spiders.forEach(function (sp) {
    sp.web.remove(); sp.thread.remove(); sp.body.remove(); sp.label.remove();
  });

  spiders = anchors.map(function (anchor, i) {
    const web = create("img", "web");
    web.src = "images/web.svg";
    web.alt = "";
    const thread = create("div", "thread");
    const body = create("img", "spider");
    body.src = SPIDER_PICTURES[i];
    body.alt = "A cute smiling spider swinging on a thread";
    const label = create("div", "you-label");
    label.textContent = "you";
    label.style.display = mode !== "solo" && i === myIndex ? "block" : "none";

    return {
      anchor: anchor,  // where its web is, as a fraction of the width
      length: TUCKED_UP,
      angle: 0,        // 0 means hanging straight down; positive means swung to the right
      swing: 0,        // how fast it's swinging
      dropping: false,
      held: i === myIndex ? myHeld : { left: false, right: false, up: false, down: false },
      score: 0,
      web: web, thread: thread, body: body, label: label,
    };
  });
}

function anchorX(sp) {
  return sp.anchor * world.w;
}

function spiderPosition(sp) {
  return {
    x: anchorX(sp) + sp.length * Math.sin(sp.angle),
    y: sp.length * Math.cos(sp.angle),
  };
}

// Move a spider forward by a tiny slice of time (dt, in seconds).
function updateSpider(sp, dt) {
  // 1. Climbing (or dropping at the start of the game).
  let newLength = sp.length;
  if (sp.dropping) {
    newLength = sp.length + DROP_SPEED * dt;
    if (newLength >= DROP_TO) {
      newLength = DROP_TO;
      sp.dropping = false;
      sp.swing = 0.9; // a gentle swing once it lands
    }
  } else if (playing) {
    newLength = sp.length + (sp.held.down - sp.held.up) * CLIMB_SPEED * dt;
  }
  newLength = Math.min(Math.max(newLength, SHORTEST), longest());
  const lengthChange = (newLength - sp.length) / dt;
  sp.length = newLength;

  // 2. Pendulum physics: gravity pulls the spider back to the middle,
  //    ◀ ▶ push it sideways (a heavier spider moves less for the same push),
  //    climbing up makes it swing faster (like a figure skater pulling their arms in),
  //    and air resistance calms it down.
  const pushing = playing && !sp.dropping ? (sp.held.right - sp.held.left) : 0;
  const sidewaysPush = pushing * SWING_PUSH / spiderWeight();
  const swingChange =
    -(GRAVITY / sp.length) * Math.sin(sp.angle)
    + (sidewaysPush / sp.length) * Math.cos(sp.angle)
    - (2 * lengthChange / sp.length) * sp.swing
    - AIR * sp.swing;

  sp.swing += swingChange * dt;
  sp.angle += sp.swing * dt;

  // A thread can't swing up over the top of the web, so stop it just past sideways.
  const limit = 1.7;
  if (sp.angle > limit) { sp.angle = limit; sp.swing = Math.min(sp.swing, 0); }
  if (sp.angle < -limit) { sp.angle = -limit; sp.swing = Math.max(sp.swing, 0); }
}

// ----- Flies -----

// Flies stay where a spider can reach them: below the webs, above the bottom,
// and within reach of a spider's longest thread.
function insideReach(x, y) {
  const reach = longest() * 0.9;
  return y > 70 && y < world.h - 40 && x > 20 && x < world.w - 20 &&
    spiders.some(function (sp) { return Math.hypot(x - anchorX(sp), y) < reach; });
}

function createFly(id, x, y) {
  const element = create("div", "fly");
  element.innerHTML = '<img src="images/fly.svg" alt="A little fly">';
  const fly = { id: id, x: x, y: y, heading: Math.random() * Math.PI * 2, element: element };
  flies.push(fly);
  return fly;
}

function removeFly(fly) {
  flies.splice(flies.indexOf(fly), 1);
  fly.element.remove();
}

function addFly() {
  let x, y, tries = 0;
  do {
    x = Math.random() * world.w;
    y = Math.random() * world.h;
    tries++;
  } while ((!insideReach(x, y) || spiders.some(function (sp) {
    const s = spiderPosition(sp);
    return Math.hypot(x - s.x, y - s.y) < 150;
  })) && tries < 200);
  createFly(nextFlyId++, x, y);
}

function startLevel() {
  betweenLevels = false;
  for (let i = 0; i < FLIES_PER_LEVEL; i++) addFly();
  updateHud();
}

function updateFlies(dt) {
  const middleX = world.w / 2;
  const middleY = longest() * 0.5;

  flies.forEach(function (fly) {
    // Wander about, changing direction a little at random.
    fly.heading += (Math.random() * 2 - 1) * flyWobble() * dt;

    // At higher levels, flies sometimes dart off in a new direction.
    if (Math.random() < flyDarts() * dt) {
      const sharpTurn = (Math.PI / 3) + Math.random() * (Math.PI / 2);
      fly.heading += Math.random() < 0.5 ? sharpTurn : -sharpTurn;
    }

    // If a fly wanders out of reach, turn it back towards the middle.
    if (!insideReach(fly.x, fly.y)) {
      const towardsMiddle = Math.atan2(middleY - fly.y, middleX - fly.x);
      let turn = towardsMiddle - fly.heading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn)); // the shortest way round
      fly.heading += turn * Math.min(1, 6 * dt);
    }

    fly.x += Math.cos(fly.heading) * flySpeed() * dt;
    fly.y += Math.sin(fly.heading) * flySpeed() * dt;

    // Fast flies bounce off the edges instead of escaping.
    const left = 20, right = world.w - 20, top = 60, bottom = world.h - 30;
    if (fly.x < left || fly.x > right) {
      fly.x = Math.min(Math.max(fly.x, left), right);
      fly.heading = Math.PI - fly.heading;
    }
    if (fly.y < top || fly.y > bottom) {
      fly.y = Math.min(Math.max(fly.y, top), bottom);
      fly.heading = -fly.heading;
    }
  });
}

// Check whether any spider has caught any flies. (Only solo games and the host do this.)
function catchFlies() {
  let cheer = null;

  spiders.forEach(function (sp, i) {
    const s = spiderPosition(sp);
    const reach = CATCH_DISTANCE * spiderSize();
    const caught = flies.filter(function (fly) {
      return Math.hypot(fly.x - s.x, fly.y - s.y) <= reach;
    });
    if (caught.length === 0) return;

    const scoreBefore = sp.score;
    caught.forEach(function (fly) {
      removeFly(fly);
      sp.score++;
      happen({ t: "pop", x: fly.x, y: fly.y });
    });

    // Did this spider just reach 5, 10, 15...?
    if (Math.floor(sp.score / CELEBRATE_EVERY) > Math.floor(scoreBefore / CELEBRATE_EVERY)) {
      happen({ t: "confetti", x: s.x, y: s.y });
      cheer = { t: "cheer", player: i, score: sp.score, level: 0 };
    }
    updateHud();
  });

  // Did that clear the level?
  if (flies.length === 0 && !betweenLevels && playing) {
    betweenLevels = true;
    level++;
    cheer = cheer || { t: "cheer", player: 0, score: 0 };
    cheer.level = level;
    setTimeout(startLevel, 1500);
  }

  if (cheer) happen(cheer);
}

// ----- Celebrations -----

// Something happened: show it here, and tell the other player if we're the host.
function happen(event) {
  showEvent(event);
  if (mode === "host" && conn && conn.open) conn.send(event);
}

function showEvent(event) {
  if (event.t === "pop") showPop(event.x, event.y);
  if (event.t === "confetti") confetti(event.x, event.y);
  if (event.t === "cheer") showCheer(event);
}

function showCheer(event) {
  const who = mode === "solo" ? "" : (event.player === myIndex ? "You: " : "Your friend: ");
  const heavier = mode === "solo" ? "heavier spider" : "heavier spiders";
  if (event.score && event.level) {
    showBanner("🎉 " + who + event.score + " flies! 🎉", "Level " + event.level + ": faster flies, " + heavier);
  } else if (event.level) {
    showBanner("Level " + event.level + "!", "Faster flies, " + heavier);
  } else {
    showBanner("🎉 " + who + event.score + " flies! 🎉");
  }
}

function showPop(x, y) {
  const pop = create("div", "pop");
  pop.textContent = "+1";
  pop.style.left = x + "px";
  pop.style.top = y + "px";
  setTimeout(function () { pop.remove(); }, 800);
}

let bannerTimer;
function showBanner(message, smallPrint, stayFor) {
  banner.innerHTML = message + (smallPrint ? "<small>" + smallPrint + "</small>" : "");
  banner.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(function () { banner.classList.remove("show"); }, stayFor || 1400);
}

function confetti(x, y) {
  const colours = ["#f7cc6b", "#f2a1b3", "#7fb07f", "#8fc3e0", "#c9a3e6"];
  for (let i = 0; i < 40; i++) {
    const piece = create("div", "confetti");
    const direction = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 140;
    piece.style.left = x + "px";
    piece.style.top = y + "px";
    piece.style.background = colours[i % colours.length];
    piece.style.setProperty("--dx", Math.cos(direction) * distance + "px");
    piece.style.setProperty("--dy", Math.sin(direction) * distance + 60 + "px"); // a little fall
    piece.style.setProperty("--spin", (Math.random() * 720 - 360) + "deg");
    setTimeout(function () { piece.remove(); }, 1200);
  }
}

// The level and score display in the top-left corner.
let lastHud = "";
function updateHud() {
  let html = "Level " + level;
  if (mode === "solo") {
    html += " &nbsp;·&nbsp; 🪰 " + (spiders[0] ? spiders[0].score : 0);
  } else {
    spiders.forEach(function (sp, i) {
      html += ' &nbsp;·&nbsp; <img class="hud-icon" src="' + SPIDER_PICTURES[i] + '" alt=""> ' +
        (i === myIndex ? "You " : "Friend ") + sp.score;
    });
  }
  if (html !== lastHud) {
    hud.innerHTML = html;
    lastHud = html;
  }
}

// ----- Drawing and the animation loop -----

function draw() {
  spiders.forEach(function (sp) {
    const ax = anchorX(sp);
    const s = spiderPosition(sp);
    sp.web.style.transform = "translateX(" + (ax - 60) + "px)";
    sp.label.style.transform = "translate(" + (ax + 64) + "px, 6px)";
    sp.thread.style.height = sp.length + "px";
    sp.thread.style.transform = "translateX(" + (ax - 0.75) + "px) rotate(" + (-sp.angle) + "rad)";
    sp.body.style.transform =
      "translate(" + s.x + "px, " + s.y + "px) translate(-50%, -40.6%) rotate(" + (-sp.angle) + "rad) scale(" + spiderSize() + ")";
  });

  flies.forEach(function (fly) {
    fly.element.style.transform = "translate(" + fly.x + "px, " + fly.y + "px) translate(-50%, -50%)";
  });
}

// Solo games and the host run the real game.
function runGame(dt) {
  const slices = 4; // small slices keep the physics smooth and steady
  for (let i = 0; i < slices; i++) {
    spiders.forEach(function (sp) { updateSpider(sp, dt / slices); });
  }
  if (!playing) return;
  updateFlies(dt);
  catchFlies();

  // The host sends the latest positions to the guest.
  sendTimer += dt;
  if (mode === "host" && conn && conn.open && sendTimer >= SEND_EVERY) {
    sendTimer = 0;
    conn.send(snapshot());
  }
}

// The guest just glides everything smoothly towards the latest positions from the host.
function followHost(dt) {
  const glide = 1 - Math.exp(-dt * 15);
  spiders.forEach(function (sp) {
    if (sp.targetAngle === undefined) return;
    sp.angle += (sp.targetAngle - sp.angle) * glide;
    sp.length += (sp.targetLength - sp.length) * glide;
  });
  flies.forEach(function (fly) {
    fly.x += (fly.targetX - fly.x) * glide;
    fly.y += (fly.targetY - fly.y) * glide;
  });
}

function step(dt) {
  if (dt <= 0) return;
  if (mode === "guest") followHost(dt);
  else runGame(dt);
}

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;
  step(dt);
  draw();
  requestAnimationFrame(frame);
}

// ----- Starting a game -----

function beginPlay() {
  playing = true;
  level = 1;
  document.body.classList.add("playing");
  spiders.forEach(function (sp) { sp.dropping = true; });
  if (mode === "guest") updateHud();
  else startLevel();
}

function startSolo() {
  mode = "solo";
  myIndex = 0;
  world.fixed = false;
  fitWorld();
  setUpSpiders([0.5]);
  beginPlay();
}

function startOnline() {
  world.fixed = true;
  world.w = ONLINE_WIDTH;
  world.h = ONLINE_HEIGHT;
  fitWorld();
  setUpSpiders([1 / 3, 2 / 3]);
  document.body.classList.add("online");
  beginPlay();
}

// ----- Online play -----

function setStatus(html) {
  statusText.innerHTML = html;
}

function setMenuEnabled(enabled) {
  menuButtons.forEach(function (item) { item.disabled = !enabled; });
}

function onlineAvailable() {
  if (typeof Peer === "undefined") {
    setStatus("Online play couldn't load. Check your internet connection, then refresh the page.");
    return false;
  }
  return true;
}

function makeCode() {
  let code = "";
  for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return code;
}

// Something went wrong before the game started: go back to the menu.
function backToMenu(message) {
  const oldPeer = peer;
  peer = null;
  conn = null;
  mode = "solo";
  myIndex = 0;
  if (oldPeer) oldPeer.destroy();
  setMenuEnabled(true);
  setStatus(message);
}

function friendLeft() {
  if (mode === "solo") return; // we've already gone back to the menu
  if (!playing) {
    backToMenu("The connection closed. Try again?");
    return;
  }
  playing = false;
  showBanner("Your friend left the game", "Going back to the menu…", 3000);
  setTimeout(function () { location.reload(); }, 3000);
}

function hostGame() {
  if (!onlineAvailable()) return;
  mode = "host";
  myIndex = 0;
  setMenuEnabled(false);
  setStatus("Setting up a room…");

  const code = makeCode();
  peer = new Peer(ROOM_PREFIX + code);

  peer.on("open", function () {
    setStatus("Your room code is <strong>" + code + "</strong><br>Send it to a friend. Keep this page open and on screen while you wait for them to join…");
  });

  // If our link to the PeerJS "receptionist" drops while waiting, reconnect.
  peer.on("disconnected", function () {
    if (!playing && peer && !peer.destroyed) peer.reconnect();
  });

  peer.on("connection", function (connection) {
    // Only one friend at a time. But if an earlier attempt got stuck, swap it for this new one.
    if (conn && conn.open) { connection.close(); return; }
    if (conn) conn.close();
    conn = connection;
    connection.on("open", function () {
      if (conn !== connection || playing) return;
      conn.send({ t: "start" });
      startOnline();
    });
    connection.on("data", onMessage);
    connection.on("close", function () {
      if (conn !== connection) return;
      if (playing) friendLeft();
      else conn = null; // a half-finished attempt gave up: keep the room open for another try
    });
  });

  peer.on("error", function (error) {
    if (error.type === "unavailable-id") { // that code is already taken, so pick another
      peer.destroy();
      hostGame();
    } else {
      backToMenu("Couldn't start an online game (" + error.type + "). Try again?");
    }
  });
}

function joinGame() {
  const code = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 4) {
    setStatus("Type the 4-letter room code your friend sent you.");
    return;
  }
  if (!onlineAvailable()) return;
  mode = "guest";
  myIndex = 1;
  setMenuEnabled(false);
  setStatus("Connecting to room " + code + "…<br>Step 1 of 2: reaching the game server");

  peer = new Peer();

  // Give up after 15 seconds, and say which step it got stuck on.
  let stepReached = 1;
  const giveUp = setTimeout(function () {
    if (playing || mode !== "guest") return;
    if (stepReached === 1) {
      backToMenu("Couldn't reach the game server. This network might be blocking it. Try a different Wi-Fi or mobile data.");
    } else {
      backToMenu("Found room " + code + " but couldn't connect to it. Check the host's page is still open and on screen, then try again.");
    }
  }, 15000);

  peer.on("open", function () {
    stepReached = 2;
    setStatus("Connecting to room " + code + "…<br>Step 2 of 2: connecting to your friend");
    conn = peer.connect(ROOM_PREFIX + code, { reliable: true });
    conn.on("open", function () { clearTimeout(giveUp); });
    conn.on("data", onMessage);
    conn.on("close", friendLeft);
    conn.on("error", function (error) {
      clearTimeout(giveUp);
      backToMenu("The connection had a problem (" + error.type + "). Try again?");
    });
  });

  peer.on("error", function (error) {
    clearTimeout(giveUp);
    if (error.type === "peer-unavailable") {
      backToMenu("Couldn't find a game with the code " + code + ". Check the code, and that the host's page is still open.");
    } else {
      backToMenu("Couldn't connect (" + error.type + "). Try again?");
    }
  });
}

// What the host sends the guest 20 times a second.
function snapshot() {
  return {
    t: "state",
    level: level,
    spiders: spiders.map(function (sp) {
      return [Math.round(sp.angle * 1000) / 1000, Math.round(sp.length), sp.score];
    }),
    flies: flies.map(function (fly) {
      return [fly.id, Math.round(fly.x), Math.round(fly.y)];
    }),
  };
}

// The guest copies the host's latest positions.
function followSnapshot(state) {
  level = state.level;
  state.spiders.forEach(function (data, i) {
    const sp = spiders[i];
    if (!sp) return;
    sp.targetAngle = data[0];
    sp.targetLength = data[1];
    sp.score = data[2];
  });

  const stillFlying = {};
  state.flies.forEach(function (data) {
    stillFlying[data[0]] = true;
    let fly = flies.find(function (f) { return f.id === data[0]; });
    if (!fly) fly = createFly(data[0], data[1], data[2]);
    fly.targetX = data[1];
    fly.targetY = data[2];
  });
  flies.filter(function (fly) { return !stillFlying[fly.id]; }).forEach(removeFly);

  updateHud();
}

// A message arrived from the other player.
function onMessage(message) {
  if (mode === "host" && message.t === "input" && spiders[1]) {
    Object.assign(spiders[1].held, message.held);
  } else if (mode === "guest") {
    if (message.t === "start") startOnline();
    else if (message.t === "state") followSnapshot(message);
    else showEvent(message);
  }
}

// ----- Controls -----

// Remember which direction I'm holding. Guests tell the host straight away.
function setHeld(direction, isHeld) {
  if (myHeld[direction] === isHeld) return;
  myHeld[direction] = isHeld;
  if (mode === "guest" && conn && conn.open) conn.send({ t: "input", held: myHeld });
}

const keys = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

document.addEventListener("keydown", function (event) {
  const direction = keys[event.key];
  if (!direction || !playing) return;
  event.preventDefault(); // stop the arrow keys from scrolling the page
  setHeld(direction, true);
});

document.addEventListener("keyup", function (event) {
  const direction = keys[event.key];
  if (direction) setHeld(direction, false);
});

// If the window loses focus, let go of everything.
window.addEventListener("blur", function () {
  for (const direction in myHeld) setHeld(direction, false);
});

// On-screen buttons: press and hold to move (works with a finger or a mouse).
document.querySelectorAll(".controls button").forEach(function (button) {
  const direction = button.dataset.dir;

  function press(event) {
    event.preventDefault();
    setHeld(direction, true);
    button.classList.add("pressed");
  }

  function release() {
    setHeld(direction, false);
    button.classList.remove("pressed");
  }

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("contextmenu", function (event) { event.preventDefault(); });
});

// Menu buttons
document.getElementById("solo").addEventListener("click", startSolo);
document.getElementById("host").addEventListener("click", hostGame);
document.getElementById("join").addEventListener("click", joinGame);
codeInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") joinGame();
});

// ----- Get going -----

fitWorld();
setUpSpiders([0.5]); // one spider waiting under its web on the start screen
draw();
requestAnimationFrame(frame);
