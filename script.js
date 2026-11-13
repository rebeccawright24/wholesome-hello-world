// When the button is clicked, show a friendly reply under it.
document.getElementById("wave").addEventListener("click", function () {
  document.getElementById("reply").textContent = "👋 Hello, Rebecca! Nice to meet you.";
});

// Move the spider with the arrow keys.
const spider = document.getElementById("spider");
const step = 20; // how many pixels the spider moves per key press
let moveX = 0;
let moveY = 0;

const directions = {
  ArrowLeft: [-step, 0],
  ArrowRight: [step, 0],
  ArrowUp: [0, -step],
  ArrowDown: [0, step],
};

document.addEventListener("keydown", function (event) {
  const direction = directions[event.key];
  if (!direction) return; // not an arrow key, so do nothing
  event.preventDefault(); // stop the arrow keys from scrolling the page

  // Keep the spider inside the browser window.
  const minX = -spider.offsetLeft;
  const maxX = document.documentElement.clientWidth - spider.offsetLeft - spider.offsetWidth;
  const minY = -spider.offsetTop;
  const maxY = window.innerHeight - spider.offsetTop - spider.offsetHeight;

  moveX = Math.min(Math.max(moveX + direction[0], minX), maxX);
  moveY = Math.min(Math.max(moveY + direction[1], minY), maxY);

  spider.style.transform = "translate(" + moveX + "px, " + moveY + "px)";
});
