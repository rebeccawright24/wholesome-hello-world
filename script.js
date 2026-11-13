// When the button is clicked, show a friendly reply under it.
document.getElementById("wave").addEventListener("click", function () {
  document.getElementById("reply").textContent = "👋 Hello, Rebecca! Nice to meet you.";
});

// ---------------------------------------------------------------------------
// The spider game.
// The spider is a pendulum: a weight on a thread hanging from a web at the top centre.
// ◀ ▶ pushes the swing (like pumping your legs on a swing). ▲ ▼ climbs the thread.
// Flies buzz around the page. Touch one with the spider to catch it.
// ---------------------------------------------------------------------------

const playfield = document.getElementById("playfield");
const spider = document.getElementById("spider");
const thread = document.getElementById("thread");
const countText = document.getElementById("count");

// Settings you can play with
const GRAVITY = 2000;      // how strongly the spider is pulled down
const AIR = 0.35;          // air resistance: how quickly the swinging dies down
const SWING_PUSH = 1200;   // how hard ◀ ▶ push the swing
const CLIMB_SPEED = 160;   // how fast the spider climbs up and down
const DROP_SPEED = 420;    // how fast the spider drops when the game starts
const TUCKED_UP = 75;      // thread length before the game starts (just under the web)
const DROP_TO = 220;       // thread length after the drop
const SHORTEST = 40;       // shortest the thread can get
const FLY_COUNT = 3;       // how many flies buzz around at once
const FLY_SPEED = 90;      // how fast flies fly
const CATCH_DISTANCE = 30; // how close the spider has to get to catch a fly

// Where things are right now
let threadLength = TUCKED_UP;
let angle = 0;       // 0 means hanging straight down; positive means swung to the right
let swingSpeed = 0;
let playing = false;
let dropping = false;
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
  //    ◀ ▶ push it sideways, climbing up makes it swing faster
  //    (like a figure skater pulling their arms in), and air resistance calms it down.
  const sidewaysPush = playing && !dropping ? (held.right - held.left) * SWING_PUSH : 0;
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
  element.innerHTML = '<img class="fly-inner" src="images/fly.svg" alt="A little fly">';
  playfield.appendChild(element);

  flies.push({ x: x, y: y, heading: Math.random() * Math.PI * 2, element: element });
}

function updateFlies(dt) {
  const middleX = anchorX();
  const middleY = longest() * 0.5;

  flies.forEach(function (fly) {
    // Wander about, changing direction a little at random.
    fly.heading += (Math.random() * 2 - 1) * 5 * dt;

    // If a fly wanders out of reach, turn it back towards the middle.
    if (!insideReach(fly.x, fly.y)) {
      const towardsMiddle = Math.atan2(middleY - fly.y, middleX - fly.x);
      let turn = towardsMiddle - fly.heading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn)); // the shortest way round
      fly.heading += turn * Math.min(1, 6 * dt);
    }

    fly.x += Math.cos(fly.heading) * FLY_SPEED * dt;
    fly.y += Math.sin(fly.heading) * FLY_SPEED * dt;
  });
}

function catchFlies() {
  const s = spiderPosition();
  const caught = flies.filter(function (fly) {
    return Math.hypot(fly.x - s.x, fly.y - s.y) <= CATCH_DISTANCE;
  });

  caught.forEach(function (fly) {
    flies.splice(flies.indexOf(fly), 1);
    fly.element.remove();
    score++;
    countText.textContent = score;
    showPop(fly.x, fly.y);
    setTimeout(function () { if (playing) addFly(); }, 900); // a new fly arrives soon
  });
}

function showPop(x, y) {
  const pop = document.createElement("div");
  pop.className = "pop";
  pop.textContent = "+1";
  pop.style.left = x + "px";
  pop.style.top = y + "px";
  playfield.appendChild(pop);
  setTimeout(function () { pop.remove(); }, 800);
}

// ----- Drawing and the animation loop -----

// Put the thread, spider and flies where they are.
function draw() {
  const s = spiderPosition();
  thread.style.height = threadLength + "px";
  thread.style.transform = "translateX(" + (anchorX() - 0.75) + "px) rotate(" + (-angle) + "rad)";
  spider.style.transform =
    "translate(" + s.x + "px, " + s.y + "px) translate(-50%, -40.6%) rotate(" + (-angle) + "rad)";

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
  score = 0;
  countText.textContent = score;
  document.body.classList.add("playing");
  for (let i = 0; i < FLY_COUNT; i++) addFly();
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
