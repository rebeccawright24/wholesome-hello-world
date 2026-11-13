// ---------------------------------------------------------------------------
// Catch the Flies!
// The spider is a pendulum: a weight on a thread hanging from a web at the top centre.
// ◀ ▶ pushes the swing (like pumping your legs on a swing). ▲ ▼ climbs the thread.
// Catch all three flies to finish a level. Each level the spider gets heavier
// and the flies get faster and more erratic. Every 5 flies gets a celebration.
// ---------------------------------------------------------------------------

const playfield = document.getElementById("playfield");
const spider = document.getElementById("spider");
const thread = document.getElementById("thread");
const levelText = document.getElementById("level");
const countText = document.getElementById("count");
const banner = document.getElementById("banner");

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
const CATCH_DISTANCE = 30; // how close the spider has to get to catch a fly
const CELEBRATE_EVERY = 5; // celebrate every this many flies

// How each level gets harder
function spiderWeight() { return Math.min(1 + 0.2 * (level - 1), 3); }     // heavier = harder to push
function spiderSize()   { return Math.min(1 + 0.06 * (level - 1), 1.6); }  // grows a little, so you can see it
function flySpeed()     { return Math.min(FLY_SPEED * (1 + 0.15 * (level - 1)), 260); }
function flyWobble()    { return Math.min(5 * (1 + 0.35 * (level - 1)), 22); }  // how much they wander
function flyDarts()     { return Math.min(0.35 * (level - 1), 2.5); }      // sudden turns per second

// Where things are right now
let threadLength = TUCKED_UP;
let angle = 0;       // 0 means hanging straight down; positive means swung to the right
let swingSpeed = 0;
let playing = false;
let dropping = false;
let betweenLevels = false;
let level = 1;
let score = 0;
let flies = [];

// Which directions are being held down (by keyboard or buttons)
const held = { left: false, right: false, up: false, down: false };

function anchorX() {
  return window.innerWidth / 2; // the web is always in the top centre
}

function longest() {
  return Math.max(SHORTEST + 20, window.innerHeight - 70);
}

function spiderPosition() {
  return {
    x: anchorX() + threadLength * Math.sin(angle),
    y: threadLength * Math.cos(angle),
  };
}

// ----- The spider -----

// Move the spider forward by a tiny slice of time (dt, in seconds).
function updateSpider(dt) {
  // 1. Climbing (or dropping at the start of the game).
  let newLength = threadLength;
  if (dropping) {
    newLength = threadLength + DROP_SPEED * dt;
    if (newLength >= DROP_TO) {
      newLength = DROP_TO;
      dropping = false;
      swingSpeed = 0.9; // a gentle swing once it lands
    }
  } else if (playing) {
    newLength = threadLength + (held.down - held.up) * CLIMB_SPEED * dt;
  }
  newLength = Math.min(Math.max(newLength, SHORTEST), longest());
  const lengthChange = (newLength - threadLength) / dt;
  threadLength = newLength;

  // 2. Pendulum physics: gravity pulls the spider back to the middle,
  //    ◀ ▶ push it sideways (a heavier spider moves less for the same push),
  //    climbing up makes it swing faster (like a figure skater pulling their arms in),
  //    and air resistance calms it down.
  const pushing = playing && !dropping ? (held.right - held.left) : 0;
  const sidewaysPush = pushing * SWING_PUSH / spiderWeight();
  const swingChange =
    -(GRAVITY / threadLength) * Math.sin(angle)
    + (sidewaysPush / threadLength) * Math.cos(angle)
    - (2 * lengthChange / threadLength) * swingSpeed
    - AIR * swingSpeed;

  swingSpeed += swingChange * dt;
  angle += swingSpeed * dt;

  // A thread can't swing up over the top of the web, so stop it just past sideways.
  const limit = 1.7;
  if (angle > limit) { angle = limit; swingSpeed = Math.min(swingSpeed, 0); }
  if (angle < -limit) { angle = -limit; swingSpeed = Math.max(swingSpeed, 0); }
}

// ----- Flies -----

// Flies stay where the spider can reach them: below the web, above the bottom,
// and within reach of the longest thread.
function insideReach(x, y) {
  const reach = longest() * 0.9;
  const dx = x - anchorX();
  return y > 70 && y < window.innerHeight - 40 && x > 20 && x < window.innerWidth - 20 &&
    Math.sqrt(dx * dx + y * y) < reach;
}

function addFly() {
  const s = spiderPosition();
  let x, y, tries = 0;
  do {
    x = Math.random() * window.innerWidth;
    y = Math.random() * window.innerHeight;
    tries++;
  } while ((!insideReach(x, y) || Math.hypot(x - s.x, y - s.y) < 150) && tries < 200);

  const element = document.createElement("div");
  element.className = "fly";
  element.innerHTML = '<img src="images/fly.svg" alt="A little fly">';
  playfield.appendChild(element);

  flies.push({ x: x, y: y, heading: Math.random() * Math.PI * 2, element: element });
}

function startLevel() {
  betweenLevels = false;
  levelText.textContent = level;
  for (let i = 0; i < FLIES_PER_LEVEL; i++) addFly();
}

function updateFlies(dt) {
  const middleX = anchorX();
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

    // Fast flies bounce off the edges of the window instead of escaping.
    const left = 20, right = window.innerWidth - 20, top = 60, bottom = window.innerHeight - 30;
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

function catchFlies() {
  const s = spiderPosition();
  const reach = CATCH_DISTANCE * spiderSize();
  const caught = flies.filter(function (fly) {
    return Math.hypot(fly.x - s.x, fly.y - s.y) <= reach;
  });
  if (caught.length === 0) return;

  const scoreBefore = score;
  caught.forEach(function (fly) {
    flies.splice(flies.indexOf(fly), 1);
    fly.element.remove();
    score++;
    showPop(fly.x, fly.y);
  });
  countText.textContent = score;

  // Did we just reach 5, 10, 15...? And did we just clear the level?
  const milestone = Math.floor(score / CELEBRATE_EVERY) > Math.floor(scoreBefore / CELEBRATE_EVERY);
  const levelCleared = flies.length === 0 && !betweenLevels;

  if (milestone) confetti(s.x, s.y);

  if (levelCleared) {
    betweenLevels = true;
    level++;
    if (milestone) {
      showBanner("🎉 " + score + " flies! 🎉", "Level " + level + ": faster flies, heavier spider");
    } else {
      showBanner("Level " + level + "!", "Faster flies, heavier spider");
    }
    setTimeout(startLevel, 1500);
  } else if (milestone) {
    showBanner("🎉 " + score + " flies! 🎉");
  }
}

// ----- Celebrations -----

function showPop(x, y) {
  const pop = document.createElement("div");
  pop.className = "pop";
  pop.textContent = "+1";
  pop.style.left = x + "px";
  pop.style.top = y + "px";
  playfield.appendChild(pop);
  setTimeout(function () { pop.remove(); }, 800);
}

let bannerTimer;
function showBanner(message, smallPrint) {
  banner.innerHTML = message + (smallPrint ? "<small>" + smallPrint + "</small>" : "");
  banner.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(function () { banner.classList.remove("show"); }, 1400);
}

function confetti(x, y) {
  const colours = ["#f7cc6b", "#f2a1b3", "#7fb07f", "#8fc3e0", "#c9a3e6"];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti";
    const direction = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 140;
    piece.style.left = x + "px";
    piece.style.top = y + "px";
    piece.style.background = colours[i % colours.length];
    piece.style.setProperty("--dx", Math.cos(direction) * distance + "px");
    piece.style.setProperty("--dy", Math.sin(direction) * distance + 60 + "px"); // a little fall
    piece.style.setProperty("--spin", (Math.random() * 720 - 360) + "deg");
    playfield.appendChild(piece);
    setTimeout(function () { piece.remove(); }, 1200);
  }
}

// ----- Drawing and the animation loop -----

// Put the thread, spider and flies where they are.
function draw() {
  const s = spiderPosition();
  thread.style.height = threadLength + "px";
  thread.style.transform = "translateX(" + (anchorX() - 0.75) + "px) rotate(" + (-angle) + "rad)";
  spider.style.transform =
    "translate(" + s.x + "px, " + s.y + "px) translate(-50%, -40.6%) rotate(" + (-angle) + "rad) scale(" + spiderSize() + ")";

  flies.forEach(function (fly) {
    fly.element.style.transform = "translate(" + fly.x + "px, " + fly.y + "px) translate(-50%, -50%)";
  });
}

// Run the animation about 60 times a second.
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;
  if (dt > 0) {
    const slices = 4; // small slices keep the physics smooth and steady
    for (let i = 0; i < slices; i++) updateSpider(dt / slices);
    if (playing) {
      updateFlies(dt);
      catchFlies();
    }
  }
  draw();
  requestAnimationFrame(frame);
}
draw();
requestAnimationFrame(frame);

// ----- Starting the game -----

document.getElementById("start").addEventListener("click", function () {
  playing = true;
  dropping = true;
  level = 1;
  score = 0;
  countText.textContent = score;
  document.body.classList.add("playing");
  startLevel();
});

// ----- Controls -----

// Keyboard: hold an arrow key to move.
const keys = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

document.addEventListener("keydown", function (event) {
  const direction = keys[event.key];
  if (!direction || !playing) return;
  event.preventDefault(); // stop the arrow keys from scrolling the page
  held[direction] = true;
});

document.addEventListener("keyup", function (event) {
  const direction = keys[event.key];
  if (direction) held[direction] = false;
});

// If the window loses focus, let go of everything.
window.addEventListener("blur", function () {
  for (const direction in held) held[direction] = false;
});

// On-screen buttons: press and hold to move (works with a finger or a mouse).
document.querySelectorAll(".controls button").forEach(function (button) {
  const direction = button.dataset.dir;

  function press(event) {
    event.preventDefault();
    held[direction] = true;
    button.classList.add("pressed");
  }

  function release() {
    held[direction] = false;
    button.classList.remove("pressed");
  }

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("contextmenu", function (event) { event.preventDefault(); });
});
